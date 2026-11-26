import type { LogicEditor } from "./LogicEditor"
import type { Library } from "./Serialization"
import JSON5 from "json5"

type Item = { id: string, name: string, created_at: number }
async function api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
    const response = await fetch("/api/" + path, {
        method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20000),
        ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    })
    const result = await response.json()
    if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "Erreur de bibliothèque."
        throw new Error(message)
    }
    return result as T
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text !== undefined) e.textContent = text
    return e
}
function download(bundle: Library, name: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)], { type: "application/json" }))
    const a = element("a")
    a.href = url
    a.download = name.replace(/[^a-zA-Z0-9_-]/g,"_") + ".components.json"
    a.click()
    setTimeout(() => URL.revokeObjectURL(url),1000)
}
export function openComponentLibraryDialog(editor: LogicEditor, host: HTMLElement, onClose: () => void) {
    const dialog = element("dialog","component-testing-dialog component-library-dialog")
    const header = element("header")
    header.append(element("small","","LOGIC / COMPONENT LIBRARY"),element("h2","","Bibliothèque de composants"))
    const body = element("div","component-testing-body")
    const message = element("p","component-testing-notice")
    message.setAttribute("role","status")
    const footer = element("footer")
    let busy = false
    let account = false
    let items: Item[] = []
    const button = (text: string, action: () => void, cls = "") => {
        const b = element("button",cls,text)
        b.type = "button"
        b.addEventListener("click",action)
        return b
    }
    const close = button("Fermer",() => dialog.close())
    footer.append(close)
    dialog.append(header,body,message,footer)
    host.append(dialog)
    dialog.addEventListener("cancel", e => { if (busy) e.preventDefault() })
    dialog.addEventListener("close",() => { dialog.remove(); onClose() },{once:true})
    const run = async (action: () => Promise<void>) => {
        if (busy) return
        busy = true
        body.inert = true
        close.disabled = true
        message.textContent = ""
        try { await action() }
        catch (error) { message.textContent = error instanceof Error ? error.message : String(error) }
        finally { busy = false; body.inert = false; close.disabled = false }
    }
    async function refresh() {
        try {
            const session = await api<{user: unknown}>("session")
            account = !!session.user
            items = account ? (await api<{items: Item[]}>("library")).items : []
        } catch { account = false; items = [] }
        render()
    }
    function importBundle(bundle: unknown) {
        const count = editor.factory.importComponentBundle(bundle)
        render()
        message.textContent = count ? count + " composant(s) importé(s), disponibles dans le catalogue du projet." : "Ces composants existent déjà à l’identique dans le projet."
    }
    function render() {
        body.replaceChildren()
        const file = button("Importer depuis un fichier",() => {
            const picker = element("input")
            picker.type = "file"
            picker.accept = ".json,.json5,application/json"
            picker.addEventListener("change",() => {
                const selected = picker.files?.[0]
                if (selected) void run(async () => {
                    if (selected.size > 8*1024*1024) throw new Error("Fichier trop volumineux.")
                    importBundle(JSON5.parse(await selected.text()))
                })
            },{once:true})
            picker.click()
        },"primary")
        body.append(file)
        const grid = element("div","component-library-grid")
        const local = element("section","component-library-column")
        local.append(element("h3","","Composants du projet"),element("p","","Exportez une définition avec toutes ses dépendances."))
        for (const def of editor.factory.customDefs() ?? []) {
            const row = element("div","component-library-row")
            row.append(element("strong","",def.caption))
            row.append(button("Vers fichier",() => { void run(async () => { download(editor.factory.exportComponentBundle([def.customId]),def.caption) }) }))
            const publish = button("Vers ma bibliothèque",() => {
                void run(async () => {
                    const bundle = editor.factory.exportComponentBundle([def.customId])
                    await api("library","POST",{name:def.caption,bundle})
                    await refresh()
                    message.textContent = "Copie enregistrée dans votre bibliothèque."
                })
            })
            publish.disabled = !account
            row.append(publish)
            local.append(row)
        }
        if (!editor.factory.customDefs()?.length) local.append(element("p","","Aucun composant personnalisé dans ce projet."))
        const remote = element("section","component-library-column")
        remote.append(element("h3","","Ma bibliothèque"))
        if (!account) remote.append(element("p","","Connectez-vous pour utiliser votre bibliothèque personnelle. L’import/export par fichier reste disponible."))
        else if (!items.length) remote.append(element("p","","Votre bibliothèque est vide. Exportez un composant depuis un projet."))
        for (const item of items) {
            const row = element("div","component-library-row")
            const info = element("div")
            info.append(element("strong","",item.name),element("small","",new Date(item.created_at).toLocaleString()))
            row.append(info)
            const fetchBundle = async () => (await api<{item: Item & {bundle: Library}}>("library/" + item.id)).item.bundle
            row.append(button("Vers projet",() => { void run(async () => importBundle(await fetchBundle())) },"primary"))
            row.append(button("Vers fichier",() => { void run(async () => download(await fetchBundle(),item.name)) }))
            row.append(button("Supprimer",() => { void run(async () => {
                if (!await editor.appConfirm("Supprimer cette copie de la bibliothèque ? Les projets ne seront pas affectés.",true,"Supprimer")) return
                await api("library/" + item.id,"DELETE")
                await refresh()
            }) }))
            remote.append(row)
        }
        grid.append(local,remote)
        body.append(grid)
    }
    render()
    try { dialog.showModal() } catch (error) { dialog.remove(); onClose(); console.error(error); return }
    void run(refresh)
}
