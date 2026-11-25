export type AppDialogOptions = {
    kind: "alert" | "confirm" | "prompt",
    message: string,
    title?: string,
    value?: string,
    danger?: boolean,
    accept?: string,
}

/** Native dialog element, not blocking browser alert/confirm/prompt. */
export function openAppDialog(host: HTMLElement, options: AppDialogOptions): Promise<string | null> {
    return new Promise(resolve => {
        const dialog = document.createElement("dialog")
        dialog.className = "app-dialog"
        const form = document.createElement("form")
        const header = document.createElement("header")
        const icon = document.createElement("span")
        icon.className = "app-dialog-icon" + (options.danger ? " danger" : "")
        icon.setAttribute("aria-hidden", "true")
        icon.textContent = options.kind === "prompt" ? "✎" : options.danger ? "!" : options.kind === "confirm" ? "?" : "i"
        const heading = document.createElement("h2")
        heading.textContent = options.title ?? (options.kind === "prompt" ? "Modifier" : options.kind === "confirm" ? "Confirmation" : "Information")
        const headingId = "app-dialog-" + Math.random().toString(36).slice(2)
        heading.id = headingId
        dialog.setAttribute("aria-labelledby", headingId)
        header.append(icon, heading)
        const body = document.createElement("div")
        body.className = "app-dialog-body"
        const text = document.createElement("p")
        text.textContent = options.message
        body.append(text)
        let field: HTMLInputElement | undefined
        if (options.kind === "prompt") {
            field = document.createElement("input")
            field.type = "text"
            field.value = options.value ?? ""
            field.setAttribute("aria-label", options.message)
            body.append(field)
        }
        const footer = document.createElement("footer")
        let result: string | null = null
        let cancel: HTMLButtonElement | undefined
        if (options.kind !== "alert") {
            cancel = document.createElement("button")
            cancel.type = "button"
            cancel.textContent = "Annuler"
            cancel.addEventListener("click", () => dialog.close())
            footer.append(cancel)
        }
        const accept = document.createElement("button")
        accept.type = "submit"
        accept.className = options.danger ? "danger" : "primary"
        accept.textContent = options.accept ?? (options.kind === "alert" ? "Fermer" : options.kind === "prompt" ? "Enregistrer" : "Confirmer")
        footer.append(accept)
        form.append(header, body, footer)
        dialog.append(form)
        form.addEventListener("submit", e => {
            e.preventDefault()
            result = field?.value ?? ""
            dialog.close()
        })
        dialog.addEventListener("close", () => {
            dialog.remove()
            resolve(result)
        }, { once: true })
        host.append(dialog)
        try {
            dialog.showModal()
            if (field) { field.focus(); field.select() }
            else (cancel ?? accept).focus()
        } catch (e) {
            dialog.remove()
            console.error("Could not open app dialog", e)
            resolve(null)
        }
    })
}
