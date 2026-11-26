import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "./server.mjs"

test("registration, session, project isolation, revisions, logout and CSRF", async () => {
    const server = createServer({ dbPath: ":memory:", secure: false })
    await new Promise(r => server.listen(0, "127.0.0.1", r))
    const base = "http://127.0.0.1:" + server.address().port
    let cookie = ""
    async function req(path, method = "GET", data, session = cookie, origin = base) {
        const res = await fetch(base + path, { method, headers: { Origin: origin, Cookie: session, ...(data === undefined ? {} : { "Content-Type": "application/json" }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
        return { status: res.status, data: await res.json(), cookie: res.headers.get("set-cookie") }
    }
    try {
        assert.equal((await req("/api/projects")).status,401)
        assert.equal((await req("/api/register","POST",{ email:"a@example.com",password:"test-password-123" },"","https://evil.example")).status,403)
        const a=await req("/api/register","POST",{email:"a@example.com",password:"test-password-123"})
        assert.equal(a.status,200)
        assert.match(a.cookie,/HttpOnly/)
        cookie=a.cookie.split(";")[0]
        assert.equal((await req("/api/session")).data.user.email,"a@example.com")
        const c={v:8,components:{},wires:[]}
        const created=await req("/api/projects","POST",{name:"CPU",circuit:c})
        assert.equal(created.status,201)
        const id=created.data.project.id
        const path="/api/projects/"+id
        assert.equal((await req(path,"PUT",{circuit:c,revision:1})).data.project.revision,2)
        assert.equal((await req(path,"PUT",{circuit:c,revision:1})).status,409)
        const b=await req("/api/register","POST",{email:"b@example.com",password:"another-password-123"},"")
        const other=b.cookie.split(";")[0]
        assert.equal((await req(path,"GET",undefined,other)).status,404)
        assert.equal((await req(path,"PUT",{circuit:c,revision:2},other)).status,404)
        assert.equal((await req("/api/projects","GET",undefined,other)).data.projects.length,0)
        const lib = {v:8,type:"lib",defs:[{id:"adder",caption:"Adder",circuit:{components:{},wires:[]}}]}
        const saved = await req("/api/library","POST",{name:"Adder",bundle:lib})
        assert.equal(saved.status,201)
        const libPath = "/api/library/" + saved.data.item.id
        assert.equal((await req("/api/library")).data.items.length,1)
        assert.equal((await req("/api/library","GET",undefined,other)).data.items.length,0)
        assert.equal((await req(libPath,"GET",undefined,other)).status,404)
        assert.equal((await req(libPath,"DELETE",undefined,other)).status,404)
        assert.deepEqual((await req(libPath)).data.item.bundle,lib)
        assert.equal((await req(libPath,"DELETE")).status,200)
        assert.equal((await req(libPath)).status,404)
        assert.equal((await req("/api/logout","POST")).status,200)
        assert.equal((await req("/api/session")).data.user,null)
        assert.equal((await req("/api/login","POST",{email:"a@example.com",password:"wrong-password"},"")).status,401)
        const login=await req("/api/login","POST",{email:"a@example.com",password:"test-password-123"},"")
        cookie=login.cookie.split(";")[0]
        assert.equal((await req(path)).data.project.revision,2)
        assert.equal((await req(path,"DELETE",{revision:1})).status,409)
        assert.equal((await req(path,"DELETE",{revision:2})).status,200)
        assert.equal((await req(path)).status,404)
        assert.equal((await req("/data/logic.sqlite")).status,404)
    } finally { await new Promise(r => server.close(r)) }
})
