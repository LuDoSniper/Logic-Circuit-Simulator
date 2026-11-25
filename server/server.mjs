import http from "node:http"
import { DatabaseSync } from "node:sqlite"
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { mkdirSync, createReadStream, statSync } from "node:fs"
import { dirname, resolve, extname } from "node:path"
import { fileURLToPath } from "node:url"

const derive = promisify(scrypt)
const root = fileURLToPath(new URL("../", import.meta.url))
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const MAX_BODY = 8 * 1024 * 1024
const hash = token => createHash("sha256").update(token).digest("hex")
const fail = (status, message) => Object.assign(new Error(message), { status })
const validEmail = email => typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const validPassword = p => typeof p === "string" && p.length >= 10 && p.length <= 128
const normalizeEmail = e => typeof e === "string" ? e.trim().toLowerCase() : ""
const validName = n => typeof n === "string" && n.trim().length > 0 && n.trim().length <= 120
const validCircuit = c => c && typeof c === "object" && !Array.isArray(c) && Number.isInteger(c.v) && !("type" in c)
    && (c.components === undefined || (c.components && typeof c.components === "object"))
    && (c.wires === undefined || Array.isArray(c.wires))
    && (c.defs === undefined || Array.isArray(c.defs))

async function passwordHash(password, salt = randomBytes(16).toString("hex")) {
    const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
    return salt + ":" + key.toString("hex")
}
async function matches(password, stored) {
    const [salt, expected] = stored.split(":")
    const calculated = (await passwordHash(password, salt)).split(":")[1]
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(calculated, "hex"))
}

export function createServer({ dbPath = process.env.LOGIC_DB || resolve(root, "data/logic.sqlite"), secure = process.env.NODE_ENV === "production", origin = process.env.APP_ORIGIN } = {}) {
    if (secure && (!origin || !origin.startsWith("https://"))) throw new Error("Production requires APP_ORIGIN=https://your-domain")
    if (dbPath !== ":memory:") mkdirSync(dirname(resolve(dbPath)), { recursive: true, mode: 0o700 })
    const db = new DatabaseSync(dbPath)
    db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;")
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
        CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, circuit TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS projects_owner ON projects(user_id, updated_at);
    `)
    const limits = new Map()
    let authInFlight = 0
    const dummy = randomBytes(16).toString("hex") + ":" + randomBytes(64).toString("hex")
    function rateLimit(req) {
        const now = Date.now()
        const key = req.socket.remoteAddress || "unknown"
        for (const [k, v] of limits) if (v.until <= now) limits.delete(k)
        if (!limits.has(key) && limits.size >= 10000) throw fail(429, "Trop de requêtes.")
        const limit = limits.get(key) || { count: 0, until: now + 15 * 60 * 1000 }
        limits.set(key, limit)
        if (++limit.count > 20 || authInFlight >= 4) throw fail(429, "Trop de tentatives, réessayez plus tard.")
    }
    function json(res, status, data) {
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
        res.end(JSON.stringify(data))
    }
    async function body(req) {
        if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) throw fail(415, "JSON requis.")
        if (Number(req.headers["content-length"]) > MAX_BODY) throw fail(413, "Circuit trop volumineux.")
        const chunks = []; let size = 0
        for await (const chunk of req) {
            size += chunk.length
            if (size > MAX_BODY) throw fail(413, "Circuit trop volumineux.")
            chunks.push(chunk)
        }
        try {
            const data = JSON.parse(Buffer.concat(chunks).toString("utf8"))
            if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error()
            return data
        } catch { throw fail(400, "JSON invalide.") }
    }
    function token(req) {
        const match = /(?:^|;\s*)logic_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || "")
        return match?.[1]
    }
    function user(req) {
        const value = token(req)
        if (!value) return undefined
        return db.prepare("SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").get(hash(value), Date.now())
    }
    function cookie(res, value, age) {
        res.setHeader("Set-Cookie", "logic_session=" + value + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + age + (secure ? "; Secure" : ""))
    }
    function newSession(req, res, u) {
        const previous = token(req)
        if (previous) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(previous))
        db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now())
        const value = randomBytes(32).toString("hex")
        db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(hash(value), u.id, Date.now() + SESSION_MS)
        cookie(res, value, Math.floor(SESSION_MS / 1000))
    }
    function owned(id, uid) {
        const p = db.prepare("SELECT id,name,circuit,revision,updated_at FROM projects WHERE id=? AND user_id=?").get(id, uid)
        if (!p) throw fail(404, "Projet introuvable.")
        return p
    }
    function project(p) { return { ...p, circuit: JSON.parse(p.circuit) } }
    async function api(req, res, path) {
        const method = req.method
        if (!["GET", "HEAD"].includes(method)) {
            const expected = origin || "http://" + req.headers.host
            if (req.headers.origin !== expected || req.headers["sec-fetch-site"] === "cross-site") throw fail(403, "Origine non autorisée.")
        }
        if (path === "/api/session" && method === "GET") return json(res, 200, { user: user(req) || null })
        if (path === "/api/logout" && method === "POST") {
            const value = token(req)
            if (value) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(value))
            cookie(res, "", 0)
            return json(res, 200, { ok: true })
        }
        if ((path === "/api/register" || path === "/api/login") && method === "POST") {
            rateLimit(req); authInFlight++
            try {
                const data = await body(req)
                const email = normalizeEmail(data.email)
                const password = data.password
                if (!validEmail(email) || !validPassword(password)) throw fail(400, "Email invalide ou mot de passe de 10 à 128 caractères requis.")
                let u = db.prepare("SELECT id,email,password_hash FROM users WHERE email=?").get(email)
                if (path === "/api/register") {
                    if (u) throw fail(409, "Impossible de créer ce compte.")
                    const encoded = await passwordHash(password)
                    u = { id: randomUUID(), email, password_hash: encoded }
                    try { db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(u.id, email, encoded, Date.now()) }
                    catch (e) { if (String(e.message).includes("UNIQUE")) throw fail(409, "Impossible de créer ce compte."); throw e }
                } else {
                    const ok = await matches(password, u?.password_hash || dummy)
                    if (!u || !ok) throw fail(401, "Email ou mot de passe incorrect.")
                }
                newSession(req, res, u)
                return json(res, 200, { user: { id: u.id, email: u.email } })
            } finally { authInFlight-- }
        }
        const u = user(req)
        if (!u) throw fail(401, "Connexion requise.")
        if (path === "/api/projects" && method === "GET") {
            const projects = db.prepare("SELECT id,name,revision,updated_at FROM projects WHERE user_id=? ORDER BY updated_at DESC").all(u.id)
            return json(res, 200, { projects })
        }
        if (path === "/api/projects" && method === "POST") {
            const { name, circuit } = await body(req)
            if (!validName(name) || !validCircuit(circuit)) throw fail(400, "Nom ou circuit invalide.")
            if (db.prepare("SELECT count(*) AS n FROM projects WHERE user_id=?").get(u.id).n >= 100) throw fail(409, "Limite de 100 projets atteinte.")
            const id = randomUUID(), now = Date.now()
            db.prepare("INSERT INTO projects (id,user_id,name,circuit,revision,updated_at) VALUES(?,?,?,?,1,?)").run(id,u.id,name.trim(),JSON.stringify(circuit),now)
            return json(res, 201, { project: project(owned(id,u.id)) })
        }
        const match = /^\/api\/projects\/([a-f0-9-]{36})$/.exec(path)
        if (!match) throw fail(404, "Route inconnue.")
        const id = match[1]
        const p = owned(id, u.id)
        if (method === "GET") return json(res, 200, { project: project(p) })
        if (method === "PUT") {
            const { circuit, revision } = await body(req)
            if (!validCircuit(circuit) || !Number.isInteger(revision) || revision < 1) throw fail(400, "Circuit ou révision invalide.")
            const result = db.prepare("UPDATE projects SET circuit=?, revision=revision+1, updated_at=? WHERE id=? AND user_id=? AND revision=?").run(JSON.stringify(circuit),Date.now(),id,u.id,revision)
            if (result.changes !== 1) throw fail(409, "Ce projet a changé dans un autre onglet. Rechargez-le ou créez une copie.")
            return json(res, 200, { project: project(owned(id,u.id)) })
        }
        if (method === "PATCH") {
            const { name } = await body(req)
            if (!validName(name)) throw fail(400, "Nom invalide.")
            db.prepare("UPDATE projects SET name=?, updated_at=? WHERE id=? AND user_id=?").run(name.trim(),Date.now(),id,u.id)
            return json(res, 200, { project: project(owned(id,u.id)) })
        }
        if (method === "DELETE") {
            const { revision } = await body(req)
            const result = db.prepare("DELETE FROM projects WHERE id=? AND user_id=? AND revision=?").run(id,u.id,revision)
            if (result.changes !== 1) throw fail(409, "Le projet a changé. Actualisez la liste.")
            return json(res, 200, { ok: true })
        }
        throw fail(405, "Méthode non autorisée.")
    }
    const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".png":"image/png", ".map":"application/json" }
    function staticFile(req,res,path) {
        if (!["GET","HEAD"].includes(req.method)) throw fail(405,"Méthode non autorisée.")
        if (path === "/") path = "/index.html"
        // Never serve the repository root, server source, database, or dotfiles.
        if (!/^\/(?:index(?:-dist)?\.html|favicon\.(?:svg|ico)|apple-touch-icon\.png|simulator\/lib\/bundle(?:-dev)?\.js(?:\.map)?|samples\/[a-zA-Z0-9_./-]+|vendor\/[a-zA-Z0-9_./-]+)$/.test(path) || path.split("/").some(part => part === ".." || part.startsWith("."))) throw fail(404,"Not found.")
        const file = resolve(root,"."+path)
        let stat
        try { stat=statSync(file) } catch { throw fail(404, "Not found. Build the frontend with npm run bundle.") }
        if (!stat.isFile()) throw fail(404,"Not found.")
        res.writeHead(200,{"Content-Type":mime[extname(file)]||"application/octet-stream","Content-Length":stat.size,"Cache-Control":"no-cache"})
        if(req.method==="HEAD") res.end()
        else createReadStream(file).on("error",()=>res.destroy()).pipe(res)
    }
    const server=http.createServer(async(req,res)=>{
        res.setHeader("X-Content-Type-Options","nosniff")
        res.setHeader("Referrer-Policy","same-origin")
        res.setHeader("X-Frame-Options","SAMEORIGIN")
        try {
            const path=decodeURIComponent(new URL(req.url,"http://localhost").pathname)
            if(path.startsWith("/api/")) await api(req,res,path)
            else staticFile(req,res,path)
        } catch(e) {
            if(!e.status) console.error(e)
            if(!res.headersSent) json(res,e.status||500,{error:e.status?e.message:"Erreur interne."})
            else res.destroy()
        }
    })
    server.requestTimeout=30000
    server.headersTimeout=15000
    server.on("close",()=>db.close())
    return server
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const port=Number(process.env.PORT||8088)
    const host=process.env.HOST||"127.0.0.1"
    createServer().listen(port,host,()=>console.log("Logic Remaster: http://"+host+":"+port))
}
