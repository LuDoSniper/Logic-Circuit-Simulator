import type { CustomComponent, CustomComponentDef } from "./components/CustomComponent"
import type { ExternalPinLayout } from "./ExternalPinLayout"
import { Serialization } from "./Serialization"
import { Orientation } from "./utils"

const sides: Orientation[] = ["w", "n", "e", "s"]
const sideLabels: Record<Orientation, string> = { w: "Left / Gauche", n: "Top / Haut", e: "Right / Droite", s: "Bottom / Bas" }

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
    const heading = document.createElement("h2")
    heading.textContent = "Component appearance / Apparence"
    const hint = document.createElement("p")
    hint.textContent = "Choose a side and order for each port. Internal wiring is unchanged. / Choisissez le côté et l’ordre des broches, sans modifier le circuit interne."
    const status = document.createElement("p")
    status.className = "pin-layout-status"
    const content = document.createElement("div")
    content.className = "pin-layout-content"
    const preview = document.createElement("div")
    preview.className = "pin-layout-preview"
    const groups = document.createElement("div")
    groups.className = "pin-layout-groups"
    content.append(preview, groups)
    const footer = document.createElement("div")
    footer.className = "pin-layout-footer"
    function button(label: string, handler: () => void) {
        const b = document.createElement("button")
        b.type = "button"
        b.textContent = label
        b.addEventListener("click", handler)
        return b
    }
    const cancel = button("Cancel / Annuler", () => dialog.close())
    const reset = button("Automatic / Automatique", () => { draft = undefined; render() })
    const apply = button("Apply / Appliquer", () => {
        root.draftPinLayout = draft
        root.editor.setDirty("custom component appearance")
        root.editor.editTools.undoMgr.takeSnapshot()
        dialog.close()
    })
    apply.className = "primary"
    footer.append(reset, cancel, apply)
    dialog.append(heading, hint, status, content, footer)
    host.append(dialog)
    dialog.addEventListener("close", () => { dialog.remove(); onClose() }, { once: true })

    function render() {
        const def = makeDef(draft)
        const pins = def.externalPins()
        status.textContent = draft === undefined ? "Automatic layout / Placement automatique" : "Custom layout / Placement personnalisé"
        const allEntries: ExternalPinLayout = pins.map(pin => ({ id: pin.id, side: pin.orient }))
        groups.replaceChildren()
        for (const side of sides) {
            const group = document.createElement("section")
            const title = document.createElement("h3")
            title.textContent = sideLabels[side]
            group.append(title)
            const sidePins = pins.filter(pin => pin.orient === side)
            if (sidePins.length === 0) {
                const empty = document.createElement("small")
                empty.textContent = "—"
                group.append(empty)
            }
            for (const [i, pin] of sidePins.entries()) {
                const row = document.createElement("div")
                row.className = "pin-layout-row"
                const name = document.createElement("span")
                name.textContent = (pin.isIn ? "IN " : "OUT ") + pin.name + (pin.numBits > 1 ? " [" + pin.numBits + "]" : "")
                name.title = name.textContent
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
                    draft = allEntries.filter(entry => entry.id !== pin.id)
                    draft.push({ id: pin.id, side: target })
                    render()
                })
                function move(direction: number) {
                    const other = sidePins[i + direction]
                    if (other === undefined) return
                    const a = allEntries.findIndex(entry => entry.id === pin.id)
                    const b = allEntries.findIndex(entry => entry.id === other.id)
                    ;[allEntries[a], allEntries[b]] = [allEntries[b], allEntries[a]]
                    draft = allEntries
                    render()
                }
                const up = button("↑", () => move(-1))
                const down = button("↓", () => move(1))
                up.title = "Earlier / Précédent"
                down.title = "Later / Suivant"
                up.disabled = i === 0
                down.disabled = i === sidePins.length - 1
                row.append(name, select, up, down)
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
        svg.setAttribute("role", "img")
        svg.setAttribute("aria-label", "External pin layout preview")
        function shape(tag: string, attrs: Record<string, string | number>, text?: string) {
            const element = document.createElementNS(ns, tag)
            for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value))
            if (text !== undefined) element.textContent = text
            svg.append(element)
        }
        shape("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: 4, fill: "var(--chrome)", stroke: "currentColor", "stroke-width": 1.5 })
        shape("text", { x: 0, y: 0, "text-anchor": "middle", "dominant-baseline": "middle", fill: "currentColor", "font-size": 14, "font-weight": 600 }, def.caption)
        for (const { pin, x, y } of def.externalPinPositions()) {
            const px = x * 12, py = y * 12
            const dx = pin.orient === "w" ? -1 : pin.orient === "e" ? 1 : 0
            const dy = pin.orient === "n" ? -1 : pin.orient === "s" ? 1 : 0
            const color = pin.isIn ? "#478bd6" : "#27a078"
            shape("line", { x1: px - 12 * dx, y1: py - 12 * dy, x2: px, y2: py, stroke: color, "stroke-width": pin.numBits > 1 ? 4 : 2 })
            shape("circle", { cx: px, cy: py, r: 3, fill: color })
            const label = pin.name + (pin.numBits > 1 ? " [" + pin.numBits + "]" : "")
            const tx = px + dx * 8, ty = py + dy * 9
            const attrs: Record<string, string | number> = { x: tx, y: ty, fill: "currentColor", "font-size": 11, "dominant-baseline": "middle", "text-anchor": dx < 0 ? "end" : dx > 0 ? "start" : dy < 0 ? "start" : "end" }
            if (dy !== 0) attrs.transform = "rotate(-90 " + tx + " " + ty + ")"
            shape("text", attrs, label)
        }
        preview.append(svg)
    }
    render()
    try { dialog.showModal() } catch { dialog.remove(); onClose(); throw new Error("Could not open component appearance editor") }
}
