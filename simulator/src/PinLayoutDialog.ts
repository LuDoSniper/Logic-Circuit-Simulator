import type { CustomComponent, CustomComponentDef } from "./components/CustomComponent"
import type { ExternalPinLayout } from "./ExternalPinLayout"
import { Serialization } from "./Serialization"
import type { Orientation } from "./utils"

const sides: Orientation[] = ["w", "n", "e", "s"]
const sideLabels: Record<Orientation, string> = { w: "Left / Gauche", n: "Top / Haut", e: "Right / Droite", s: "Bottom / Bas" }
type DropTarget = { side: Orientation, index: number }
type PinDrag = { id: string, pointer: number, x: number, y: number, label: string, started: boolean, target: DropTarget | undefined }

export function openPinLayoutDialog(root: CustomComponent, host: HTMLElement, makeDefinition: typeof CustomComponentDef, onClose: () => void) {
    const circuit = Serialization.buildComponentsAndWireObject([...root.components.all()], [], undefined)
    let draft = root.draftPinLayout?.map(pin => ({ ...pin }))
    const makeDef = (layout: ExternalPinLayout | undefined) => new makeDefinition({
        id: root.customDef.customId,
        caption: root.customDef.caption,
        circuit: { components: { ...circuit.components }, wires: circuit.wires },
        ...(layout === undefined ? {} : { pinLayout: layout }),
    })

    const dialog = document.createElement("dialog")
    dialog.className = "pin-layout-dialog"
    const header = document.createElement("header")
    header.className = "pin-layout-header"
    const headingGroup = document.createElement("div")
    const eyebrow = document.createElement("div")
    eyebrow.className = "pin-layout-eyebrow"
    eyebrow.textContent = "LOGIC / SYMBOL EDITOR"
    const heading = document.createElement("h2")
    heading.textContent = root.customDef.caption
    const hint = document.createElement("p")
    hint.textContent = "Glissez les broches sur les côtés du symbole ou entre les lignes pour les réordonner."
    headingGroup.append(eyebrow, heading, hint)
    const status = document.createElement("p")
    status.className = "pin-layout-status"
    header.append(headingGroup, status)
    const content = document.createElement("div")
    content.className = "pin-layout-content"
    const preview = document.createElement("div")
    preview.className = "pin-layout-preview"
    const groups = document.createElement("div")
    groups.className = "pin-layout-groups"
    const inspector = document.createElement("div")
    inspector.className = "pin-layout-inspector"
    const inspectorTitle = document.createElement("h3")
    inspectorTitle.textContent = "Broches externes"
    const inspectorHint = document.createElement("p")
    inspectorHint.textContent = "Glisser-déposer ou utiliser les réglages de chaque broche."
    inspector.append(inspectorTitle, inspectorHint, groups)
    const previewPanel = document.createElement("div")
    previewPanel.className = "pin-layout-preview-panel"
    const previewTitle = document.createElement("div")
    previewTitle.className = "pin-layout-preview-title"
    previewTitle.textContent = "Aperçu du symbole"
    const legend = document.createElement("div")
    legend.className = "pin-layout-legend"
    for (const [label, kind] of [["Entrée", "input"], ["Sortie", "output"]]) {
        const item = document.createElement("span")
        item.className = "pin-kind " + kind
        item.textContent = label
        legend.append(item)
    }
    previewTitle.append(legend)
    const dropHint = document.createElement("div")
    dropHint.className = "pin-layout-drop-hint"
    dropHint.setAttribute("aria-live", "polite")
    dropHint.textContent = "Attrapez une broche pour la déplacer."
    previewPanel.append(previewTitle, preview, dropHint)
    content.append(previewPanel, inspector)
    const footer = document.createElement("div")
    footer.className = "pin-layout-footer"
    function button(label: string, handler: () => void) {
        const b = document.createElement("button")
        b.type = "button"
        b.textContent = label
        b.addEventListener("click", handler)
        return b
    }
    const cancel = button("Annuler", () => dialog.close())
    const reset = button("↺  Disposition automatique", () => { draft = undefined; render() })
    reset.className = "pin-layout-reset"
    const apply = button("Appliquer", () => {
        root.draftPinLayout = draft
        root.editor.setDirty("custom component appearance")
        root.editor.editTools.undoMgr.takeSnapshot()
        dialog.close()
    })
    apply.className = "primary"
    footer.append(reset, cancel, apply)
    const ghost = document.createElement("div")
    ghost.className = "pin-layout-drag-ghost"
    ghost.hidden = true
    dialog.append(header, content, footer, ghost)
    host.append(dialog)
    let drag: PinDrag | undefined
    let currentDef = makeDef(draft)
    let allEntries: ExternalPinLayout = []

    function movePin(id: string, target: DropTarget) {
        const entries = allEntries.filter(entry => entry.id !== id)
        const sameSide = entries.filter(entry => entry.side === target.side)
        const next = sameSide[target.index]
        const index = next === undefined ? entries.length : entries.findIndex(entry => entry.id === next.id)
        entries.splice(index, 0, { id, side: target.side })
        draft = entries
        render()
    }

    function startDrag(e: PointerEvent, id: string, label: string) {
        if (e.button !== 0 || !e.isPrimary || drag !== undefined) return
        e.preventDefault()
        drag = { id, pointer: e.pointerId, x: e.clientX, y: e.clientY, label, started: false, target: undefined }
        dialog.setPointerCapture(e.pointerId)
    }

    function findTarget(clientX: number, clientY: number, id: string): DropTarget | undefined {
        // The list and schematic share the same insertion-order model.
        for (const section of groups.querySelectorAll<HTMLElement>("section[data-side]")) {
            const bounds = section.getBoundingClientRect()
            if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) continue
            const side = sides.find(s => s === section.dataset.side)
            if (side === undefined) continue
            const rows = [...section.querySelectorAll<HTMLElement>("[data-pin-id]")].filter(row => row.dataset.pinId !== id)
            const index = rows.findIndex(row => {
                const box = row.getBoundingClientRect()
                return clientY < box.top + box.height / 2
            })
            return { side, index: index === -1 ? rows.length : index }
        }
        const svg = preview.querySelector("svg")
        if (svg === null) return undefined
        const box = svg.getBoundingClientRect()
        if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return undefined
        const matrix = svg.getScreenCTM()
        if (matrix === null) return undefined
        const point = svg.createSVGPoint()
        point.x = clientX
        point.y = clientY
        const p = point.matrixTransform(matrix.inverse())
        const nx = p.x / Math.max(1, currentDef.gridWidth * 6)
        const ny = p.y / Math.max(1, currentDef.gridHeight * 6)
        if (Math.max(Math.abs(nx), Math.abs(ny)) < .55) return undefined
        const side: Orientation = Math.abs(nx) >= Math.abs(ny) ? (nx < 0 ? "w" : "e") : (ny < 0 ? "n" : "s")
        const vertical = side === "w" || side === "e"
        const along = vertical ? p.y : p.x
        const positions = currentDef.externalPinPositions().filter(pos => pos.pin.orient === side && pos.pin.id !== id)
        const index = positions.findIndex(pos => along < (vertical ? pos.y : pos.x) * 12)
        return { side, index: index === -1 ? positions.length : index }
    }

    function showTarget(target: DropTarget | undefined) {
        for (const element of dialog.querySelectorAll(".pin-drop-active, .pin-drop-before, .pin-drop-end")) {
            element.classList.remove("pin-drop-active", "pin-drop-before", "pin-drop-end")
        }
        if (target === undefined || drag === undefined) {
            dropHint.textContent = "Déposez sur un côté du symbole ou dans la liste."
            return
        }
        const side = target.side
        const zone = preview.querySelector('[data-drop-side="' + side + '"]')
        zone?.classList.add("pin-drop-active")
        const section = groups.querySelector<HTMLElement>('section[data-side="' + side + '"]')
        if (section !== null) {
            section.classList.add("pin-drop-active")
            const rows = [...section.querySelectorAll<HTMLElement>("[data-pin-id]")].filter(row => row.dataset.pinId !== drag?.id)
            const row = rows[target.index]
            if (row === undefined) section.classList.add("pin-drop-end")
            else row.classList.add("pin-drop-before")
        }
        dropHint.textContent = sideLabels[side] + " · position " + (target.index + 1)
    }

    dialog.addEventListener("pointermove", e => {
        if (drag === undefined || drag.pointer !== e.pointerId) return
        if (!drag.started && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return
        drag.started = true
        dialog.classList.add("pin-layout-dragging")
        ghost.hidden = false
        ghost.textContent = drag.label
        ghost.style.left = (e.clientX + 14) + "px"
        ghost.style.top = (e.clientY + 14) + "px"
        drag.target = findTarget(e.clientX, e.clientY, drag.id)
        showTarget(drag.target)
    })

    function finishDrag(e: PointerEvent, commit: boolean) {
        if (drag === undefined || drag.pointer !== e.pointerId) return
        const previous = drag
        const target = commit && previous.started ? findTarget(e.clientX, e.clientY, previous.id) : undefined
        drag = undefined
        ghost.hidden = true
        dialog.classList.remove("pin-layout-dragging")
        showTarget(undefined)
        dropHint.textContent = "Attrapez une broche pour la déplacer."
        if (dialog.hasPointerCapture(e.pointerId)) dialog.releasePointerCapture(e.pointerId)
        if (target !== undefined) movePin(previous.id, target)
    }
    dialog.addEventListener("pointerup", e => finishDrag(e, true))
    dialog.addEventListener("pointercancel", e => finishDrag(e, false))
    dialog.addEventListener("lostpointercapture", e => finishDrag(e, false))
    dialog.addEventListener("close", () => { drag = undefined; dialog.remove(); onClose() }, { once: true })

    function render() {
        const def = currentDef = makeDef(draft)
        const pins = def.externalPins()
        status.textContent = draft === undefined ? "Automatique" : "Personnalisé"
        status.classList.toggle("is-custom", draft !== undefined)
        allEntries = pins.map(pin => ({ id: pin.id, side: pin.orient }))
        groups.replaceChildren()
        for (const side of sides) {
            const group = document.createElement("section")
            group.dataset.side = side
            const title = document.createElement("h3")
            const sidePins = pins.filter(pin => pin.orient === side)
            title.textContent = sideLabels[side] + " · " + sidePins.length
            group.append(title)
            if (sidePins.length === 0) {
                const empty = document.createElement("small")
                empty.textContent = "Déposer ici"
                group.append(empty)
            }
            for (const [i, pin] of sidePins.entries()) {
                const row = document.createElement("div")
                row.className = "pin-layout-row"
                row.dataset.pinId = pin.id
                const handle = document.createElement("span")
                handle.className = "pin-layout-handle"
                handle.textContent = "⠿"
                handle.title = "Glisser pour déplacer"
                handle.setAttribute("aria-hidden", "true")
                const name = document.createElement("span")
                name.className = "pin-layout-name"
                const kind = document.createElement("span")
                kind.className = "pin-kind " + (pin.isIn ? "input" : "output")
                kind.textContent = pin.isIn ? "IN" : "OUT"
                const label = pin.name + (pin.numBits > 1 ? " [" + pin.numBits + "]" : "")
                name.textContent = label
                name.title = label
                row.addEventListener("pointerdown", e => {
                    if (e.target instanceof Element && e.target.closest("button, select")) return
                    startDrag(e, pin.id, label)
                })
                const select = document.createElement("select")
                select.setAttribute("aria-label", "Side / Côté " + pin.name)
                for (const target of sides) {
                    const option = document.createElement("option")
                    option.value = target
                    option.textContent = sideLabels[target]
                    select.append(option)
                }
                select.value = side
                select.addEventListener("change", () => {
                    const target = sides.find(s => s === select.value)
                    if (target === undefined) return
                    movePin(pin.id, { side: target, index: allEntries.filter(entry => entry.side === target && entry.id !== pin.id).length })
                })
                function move(direction: number) {
                    if (sidePins[i + direction] === undefined) return
                    movePin(pin.id, { side, index: i + direction })
                }
                const up = button("↑", () => move(-1))
                const down = button("↓", () => move(1))
                up.title = "Earlier / Précédent"
                down.title = "Later / Suivant"
                up.disabled = i === 0
                down.disabled = i === sidePins.length - 1
                row.append(handle, kind, name, select, up, down)
                group.append(row)
            }
            groups.append(group)
        }

        // Schematic preview uses the same positions as the component renderer.
        preview.replaceChildren()
        const ns = "http://www.w3.org/2000/svg"
        const svg = document.createElementNS(ns, "svg")
        const w = def.gridWidth * 12
        const h = def.gridHeight * 12
        svg.setAttribute("viewBox", [-w / 2 - 110, -h / 2 - 60, w + 220, h + 120].join(" "))
        svg.setAttribute("role", "group")
        svg.setAttribute("aria-label", "Aperçu interactif des broches externes")
        function shape(tag: string, attrs: Record<string, string | number>, text?: string, parent: SVGElement = svg) {
            const element = document.createElementNS(ns, tag)
            for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value))
            if (text !== undefined) element.textContent = text
            parent.append(element)
            return element
        }
        // Four large drop zones, including sides with no pins yet.
        for (const side of sides) {
            const vertical = side === "w" || side === "e"
            const x = side === "w" ? -w / 2 - 38 : side === "e" ? w / 2 + 4 : -w / 2
            const y = side === "n" ? -h / 2 - 38 : side === "s" ? h / 2 + 4 : -h / 2
            shape("rect", { x, y, width: vertical ? 34 : w, height: vertical ? h : 34, rx: 5, class: "pin-drop-zone", "data-drop-side": side })
        }
        shape("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: 5, fill: "var(--panel)", stroke: "var(--ink)", "stroke-width": 1.5 })
        shape("text", { x: 0, y: 0, "text-anchor": "middle", "dominant-baseline": "middle", fill: "currentColor", "font-size": 14, "font-weight": 600 }, def.caption)
        for (const { pin, x, y } of def.externalPinPositions()) {
            const px = x * 12, py = y * 12
            const dx = pin.orient === "w" ? -1 : pin.orient === "e" ? 1 : 0
            const dy = pin.orient === "n" ? -1 : pin.orient === "s" ? 1 : 0
            const color = pin.isIn ? "var(--pin-input)" : "var(--pin-output)"
            const label = pin.name + (pin.numBits > 1 ? " [" + pin.numBits + "]" : "")
            const group = shape("g", { class: "pin-preview-handle" })
            shape("title", {}, label + " — glisser pour déplacer", group)
            shape("line", { x1: px - 12 * dx, y1: py - 12 * dy, x2: px, y2: py, stroke: color, "stroke-width": pin.numBits > 1 ? 4 : 2 }, undefined, group)
            shape("circle", { cx: px, cy: py, r: 9, fill: color, "fill-opacity": .13, class: "pin-preview-hit" }, undefined, group)
            shape("circle", { cx: px, cy: py, r: 4, fill: color }, undefined, group)
            group.addEventListener("pointerdown", e => startDrag(e, pin.id, label))
            const tx = px + dx * 8, ty = py + dy * 9
            const attrs: Record<string, string | number> = { x: tx, y: ty, fill: "currentColor", "font-size": 11, "dominant-baseline": "middle", "text-anchor": dx < 0 ? "end" : dx > 0 ? "start" : dy < 0 ? "start" : "end" }
            if (dy !== 0) attrs.transform = "rotate(-90 " + tx + " " + ty + ")"
            shape("text", attrs, label, group)
        }
        preview.append(svg)
    }
    render()
    try { dialog.showModal() } catch { dialog.remove(); onClose(); throw new Error("Could not open component appearance editor") }
}
