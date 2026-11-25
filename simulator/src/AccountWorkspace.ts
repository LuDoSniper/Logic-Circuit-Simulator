import type { LogicEditor } from "./LogicEditor"
import type { Circuit } from "./Serialization"

type User = { id: string, email: string }
type ProjectSummary = { id: string, name: string, revision: number, updated_at: number }
type Project = ProjectSummary & { circuit: Circuit }
class ApiError extends Error {
    constructor(public readonly status: number, message: string) { super(message) }
}
async function api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
    const response = await fetch("/api/" + path, {
        method, credentials: "same-origin", cache: "no-store",
        ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    })
    let result
    try { result = await response.json() } catch { throw new ApiError(response.status, "Serveur de comptes indisponible.") }
    if (!response.ok) throw new ApiError(response.status, result.error ?? "Erreur du serveur.")
    return result as T
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e)

export class AccountWorkspace {
    private user: User | null = null
    private active: ProjectSummary | undefined
    private guest: Circuit | undefined
    private pending: Circuit | undefined
    private inFlight: Promise<void> | undefined
    private timer: ReturnType<typeof setTimeout> | undefined
    private problem: string | undefined
    private conflict = false
    private expired = false
    private busy = false
    private available = true
    private dialog: HTMLDialogElement | undefined
    private disposed = false
    private readonly button: HTMLButtonElement
    private readonly status: HTMLSpanElement
    private readonly online = () => { if (this.pending && !this.conflict && !this.expired) void this.flush().catch(() => undefined) }
    private readonly visibility = () => { if (document.visibilityState === "hidden" && this.pending && !this.conflict && !this.expired) void this.flush().catch(() => undefined) }

    constructor(private readonly editor: LogicEditor, private readonly host: HTMLElement, toolbar: HTMLElement) {
        this.button = document.createElement("button")
        this.button.type = "button"
        this.button.className = "account-workspace-button"
        this.button.addEventListener("click", () => { void this.open() })
        const icon = document.createElement("span")
        icon.className = "account-workspace-icon"
        icon.setAttribute("aria-hidden", "true")
        icon.textContent = "●"
        this.status = document.createElement("span")
        this.button.append(icon, this.status)
        toolbar.append(this.button)
        this.refreshStatus()
        window.addEventListener("online", this.online)
        document.addEventListener("visibilitychange", this.visibility)
    }

    public get hasProject() { return this.active !== undefined }
    public get hasUnsavedChanges() { return this.pending !== undefined || this.inFlight !== undefined || this.conflict }
    private snapshot(): Circuit { return clone(this.editor.save()) }
    private empty(name?: string): Circuit { return { v: this.editor.save().v, ...(name ? { opts: { name } } : {}) } }

    private refreshStatus() {
        const title = !this.available ? "Mode local" : this.active
            ? (this.conflict ? "Conflit de sauvegarde" : this.problem ? "Non sauvegardé" : this.pending || this.inFlight ? "Sauvegarde…" : "Synchronisé")
            : this.user ? "Mes projets" : "Se connecter"
        this.status.textContent = title
        this.button.dataset.state = this.conflict || this.problem ? "error" : this.pending || this.inFlight ? "saving" : this.active ? "saved" : "guest"
        this.button.title = this.active ? this.active.name + " — " + (this.problem ?? title) : title
        this.button.setAttribute("aria-label", this.button.title)
    }

    public async initialize() {
        const before = JSON.stringify(this.snapshot())
        this.busy = true
        try {
            const { user } = await api<{ user: User | null }>("session")
            if (this.disposed) return
            this.user = user
            if (user && !location.search && !location.hash) {
                const { projects } = await api<{ projects: ProjectSummary[] }>("projects")
                const last = this.lastProject()
                const target = projects.find(p => p.id === last) ?? projects[0]
                if (target && before === JSON.stringify(this.snapshot())) {
                    const { project } = await api<{ project: Project }>("projects/" + target.id)
                    if (!this.disposed && before === JSON.stringify(this.snapshot())) this.activate(project)
                }
            }
        } catch (e) {
            this.available = false
            console.warn("Account service:", e)
        } finally { this.busy = false; this.refreshStatus() }
    }

    private lastProject() {
        try { return localStorage.getItem("logic-remaster-project:" + this.user?.id) } catch { return null }
    }
    private rememberProject() {
        try {
            if (this.active && this.user) localStorage.setItem("logic-remaster-project:" + this.user.id, this.active.id)
        } catch { /* optional browser preference */ }
    }

    private activate(project: Project) {
        const guest = this.active === undefined ? this.snapshot() : undefined
        this.editor.replaceWorkspaceCircuit(clone(project.circuit))
        if (guest !== undefined) this.guest = guest
        if (this.timer !== undefined) clearTimeout(this.timer)
        this.timer = undefined
        this.active = project
        this.pending = undefined
        this.problem = undefined
        this.conflict = false
        this.expired = false
        this.rememberProject()
        this.refreshStatus()
    }

    // Called from the original undo/snapshot persistence hook.
    public queue(circuit: Circuit) {
        if (!this.active || this.disposed) return
        this.pending = clone(circuit)
        if (this.timer !== undefined) clearTimeout(this.timer)
        if (!this.conflict && !this.expired) {
            this.timer = setTimeout(() => {
                this.timer = undefined
                void this.flush().catch(() => undefined)
            }, 650)
        }
        this.refreshStatus()
    }

    public async flush(): Promise<void> {
        if (this.timer !== undefined) clearTimeout(this.timer)
        this.timer = undefined
        if (this.conflict || this.expired) throw new Error(this.problem ?? "Sauvegarde bloquée.")
        if (this.inFlight) { await this.inFlight; if (this.pending) await this.flush(); return }
        if (!this.active || !this.pending) return
        const active = this.active
        const circuit = this.pending
        this.pending = undefined
        this.inFlight = (async () => {
            try {
                const { project } = await api<{ project: Project }>("projects/" + active.id, "PUT", { circuit, revision: active.revision })
                if (this.active?.id === active.id) {
                    this.active = project
                    this.problem = undefined
                }
            } catch (e) {
                if (this.active?.id === active.id) {
                    this.pending ??= circuit
                    this.problem = errorText(e)
                    this.conflict = e instanceof ApiError && e.status === 409
                    this.expired = e instanceof ApiError && e.status === 401
                }
                throw e
            }
        })()
        this.refreshStatus()
        try { await this.inFlight }
        finally { this.inFlight = undefined; this.refreshStatus() }
        if (this.pending) await this.flush()
    }

    public resetProject() {
        if (!this.active || !window.confirm("Vider le circuit de ce projet ? Vous pourrez annuler cette action.")) return
        this.editor.replaceWorkspaceCircuit(this.empty(this.active.name), false)
        this.queue(this.snapshot())
    }

    private async openProject(id: string, discard = false) {
        if (!discard) await this.flush()
        else if (this.inFlight) await this.inFlight.catch(() => undefined)
        const { project } = await api<{ project: Project }>("projects/" + id)
        this.activate(project)
    }

    private async createProject(name: string, copy: boolean) {
        // A copy is also a recovery path after a revision conflict.
        if (!this.conflict) await this.flush()
        else if (!copy) throw new Error("Créez d'abord une copie de vos modifications.")
        const circuit = copy ? this.snapshot() : this.empty(name)
        circuit.opts = { ...circuit.opts, name }
        const { project } = await api<{ project: Project }>("projects", "POST", { name, circuit })
        this.activate(project)
    }

    private async logout() {
        await this.flush()
        await api("logout", "POST")
        const guest = this.guest
        this.active = undefined
        this.user = null
        this.pending = undefined
        this.guest = undefined
        this.problem = undefined
        this.conflict = false
        this.expired = false
        if (guest !== undefined) this.editor.replaceWorkspaceCircuit(guest)
        this.refreshStatus()
    }

    private async open() {
        if (this.busy || this.dialog || this.disposed) return
        const dialog = document.createElement("dialog")
        this.dialog = dialog
        dialog.className = "account-dialog"
        this.editor.setAccountDialogFocus(true)
        const header = document.createElement("header")
        const eyebrow = document.createElement("small")
        eyebrow.textContent = "LOGIC / WORKSPACE"
        const heading = document.createElement("h2")
        header.append(eyebrow, heading)
        const main = document.createElement("div")
        main.className = "account-dialog-main"
        const message = document.createElement("p")
        message.className = "account-error"
        message.setAttribute("role", "alert")
        const footer = document.createElement("footer")
        const close = this.makeButton("Fermer", () => dialog.close())
        footer.append(close)
        dialog.append(header, main, message, footer)
        this.host.append(dialog)
        dialog.addEventListener("cancel", e => { if (this.busy) e.preventDefault() })
        dialog.addEventListener("close", () => {
            dialog.remove()
            this.dialog = undefined
            this.editor.setAccountDialogFocus(false)
        }, { once: true })

        const setBusy = (value: boolean) => {
            this.busy = value
            main.inert = value
            close.disabled = value
        }
        const run = async (fn: () => Promise<void>) => {
            if (this.busy) return
            message.textContent = ""
            setBusy(true)
            try { await fn() } catch (e) { message.textContent = errorText(e) }
            finally { setBusy(false); this.refreshStatus() }
        }
        const labelInput = (label: string, type: string, value = "") => {
            const wrapper = document.createElement("label")
            const title = document.createElement("span")
            title.textContent = label
            const field = document.createElement("input")
            field.type = type
            field.value = value
            field.required = true
            wrapper.append(title, field)
            return { wrapper, field }
        }

        const renderAuth = (register = false) => {
            main.replaceChildren()
            heading.textContent = this.expired ? "Session expirée" : register ? "Créer un compte" : "Connexion"
            const text = document.createElement("p")
            text.textContent = this.expired ? "Reconnectez-vous pour conserver vos modifications." : "Vos circuits et composants restent accessibles sur tous vos appareils."
            const form = document.createElement("form")
            const email = labelInput("Adresse email", "email", this.expired ? this.user?.email ?? "" : "")
            email.field.autocomplete = "email"
            if (this.expired) email.field.readOnly = true
            const password = labelInput("Mot de passe", "password")
            password.field.autocomplete = register ? "new-password" : "current-password"
            password.field.minLength = 10
            password.field.maxLength = 128
            const submit = document.createElement("button")
            submit.type = "submit"
            submit.className = "primary"
            submit.textContent = register ? "Créer mon compte" : "Se connecter"
            form.append(email.wrapper, password.wrapper, submit)
            form.addEventListener("submit", e => {
                e.preventDefault()
                void run(async () => {
                    const { user } = await api<{ user: User }>(register ? "register" : "login", "POST", { email: email.field.value, password: password.field.value })
                    if (this.expired && user.id !== this.user?.id) throw new Error("Reconnectez-vous avec le même compte.")
                    this.user = user
                    this.available = true
                    this.expired = false
                    this.problem = undefined
                    if (this.active) await this.flush()
                    await renderProjects()
                })
            })
            main.append(text, form)
            if (!this.active) main.append(this.makeButton(register ? "Déjà un compte ? Se connecter" : "Créer un compte", () => { message.textContent = ""; renderAuth(!register) }))
        }

        const renderProjects = async () => {
            if (this.expired) { renderAuth(); return }
            if (!this.user) { renderAuth(); return }
            const { projects } = await api<{ projects: ProjectSummary[] }>("projects")
            heading.textContent = "Mes projets"
            main.replaceChildren()
            const identity = document.createElement("div")
            identity.className = "account-identity"
            const email = document.createElement("span")
            email.textContent = this.user.email
            identity.append(email, this.makeButton("Déconnexion", () => { void run(async () => { await this.logout(); renderAuth() }) }))
            main.append(identity)
            if (this.problem) {
                const warning = document.createElement("p")
                warning.className = "account-error"
                warning.textContent = this.problem
                main.append(warning)
                if (!this.conflict) main.append(this.makeButton("Réessayer la sauvegarde", () => { void run(async () => { await this.flush(); await renderProjects() }) }))
            }
            const create = document.createElement("form")
            const name = labelInput("Nouveau projet", "text", this.editor.documentDisplayName)
            name.field.maxLength = 120
            const copy = document.createElement("button")
            copy.type = "submit"
            copy.className = "primary"
            copy.textContent = "Enregistrer le circuit actuel"
            const blank = this.makeButton("Projet vide", () => {
                if (name.field.reportValidity()) void run(async () => { await this.createProject(name.field.value, false); dialog.close() })
            })
            create.append(name.wrapper, copy, blank)
            create.addEventListener("submit", e => {
                e.preventDefault()
                void run(async () => { await this.createProject(name.field.value, true); dialog.close() })
            })
            main.append(create)
            const list = document.createElement("div")
            list.className = "account-project-list"
            for (const p of projects) {
                const row = document.createElement("div")
                row.className = "account-project-row"
                const info = document.createElement("div")
                const title = document.createElement("strong")
                title.textContent = p.name
                const detail = document.createElement("small")
                detail.textContent = (p.id === this.active?.id ? "Projet actuel · " : "") + new Date(p.updated_at).toLocaleString()
                info.append(title, detail)
                const open = this.makeButton(p.id === this.active?.id ? "Continuer" : "Ouvrir", () => {
                    void run(async () => {
                        if (p.id !== this.active?.id) await this.openProject(p.id)
                        dialog.close()
                    })
                })
                const rename = this.makeButton("Renommer", () => {
                    const n = window.prompt("Nouveau nom", p.name)
                    if (n && n.trim()) void run(async () => {
                        const { project } = await api<{ project: Project }>("projects/" + p.id, "PATCH", { name: n })
                        if (this.active?.id === p.id) this.active.name = project.name
                        await renderProjects()
                    })
                })
                row.append(info, open, rename)
                if (p.id === this.active?.id && this.conflict) {
                    row.append(this.makeButton("Recharger", () => {
                        if (window.confirm("Abandonner les modifications locales non sauvegardées ?")) void run(async () => { await this.openProject(p.id, true); dialog.close() })
                    }))
                }
                if (p.id !== this.active?.id) {
                    const remove = this.makeButton("Supprimer", () => {
                        if (window.confirm("Supprimer définitivement " + p.name + " ?")) void run(async () => {
                            await api("projects/" + p.id, "DELETE", { revision: p.revision })
                            await renderProjects()
                        })
                    })
                    remove.className = "danger"
                    row.append(remove)
                }
                list.append(row)
            }
            if (projects.length === 0) {
                const empty = document.createElement("p")
                empty.textContent = "Aucun projet pour le moment. Enregistrez votre circuit actuel ou créez un projet vide."
                list.append(empty)
            }
            main.append(list)
        }
        try { dialog.showModal() }
        catch (e) { dialog.remove(); this.dialog = undefined; this.editor.setAccountDialogFocus(false); throw e }
        await run(async () => {
            if (!this.available) {
                const { user } = await api<{ user: User | null }>("session")
                this.available = true
                this.user = user
            }
            if (this.user && !this.expired) await renderProjects()
            else renderAuth()
        })
    }

    private makeButton(label: string, action: () => void) {
        const b = document.createElement("button")
        b.type = "button"
        b.textContent = label
        b.addEventListener("click", action)
        return b
    }

    public dispose() {
        this.disposed = true
        if (this.timer !== undefined) clearTimeout(this.timer)
        window.removeEventListener("online", this.online)
        document.removeEventListener("visibilitychange", this.visibility)
        this.dialog?.close()
        this.button.remove()
    }
}
