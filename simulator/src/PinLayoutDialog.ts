import type { CustomComponent, CustomComponentDef } from "./components/CustomComponent"
import { type ExternalPinLayout, type SymbolSize, snapSymbolSize, fitSymbolCaption, symbolColorPalette, symbolTintOpacity } from "./ExternalPinLayout"
import { Serialization } from "./Serialization"
import type { Orientation } from "./utils"
import { useCompact } from "./drawutils"

const sides: Orientation[] = ["w", "n", "e", "s"]
const sideLabels: Record<Orientation, string> = { w: "Left / Gauche", n: "Top / Haut", e: "Right / Droite", s: "Bottom / Bas" }
type DropTarget = { side: Orientation, index: number }
type PinDrag = { id: string, pointer: number, x: number, y: number, label: string, started: boolean, target: DropTarget | undefined }

export function openPinLayoutDialog(root: CustomComponent, host: HTMLElement, makeDefinition: typeof CustomComponentDef, onClose: () => void) {
    const circuit = Serialization.buildComponentsAndWireObject([...root.components.all()], [], undefined)
    let draft = root.draftPinLayout?.map(pin => ({ ...pin }))
    let draftSize = root.draftSymbolSize === undefined ? undefined : { ...root.draftSymbolSize }
    let draftColor = root.draftSymbolColor
    const makeDef = (layout: ExternalPinLayout | undefined) => new makeDefinition({
        id: root.customDef.customId,
        caption: root.customDef.caption,
        circuit: { components: { ...circuit.components }, wires: circuit.wires },
        ...(layout === undefined ? {} : { pinLayout: layout }),
        ...(draftSize === undefined ? {} : { symbolSize: draftSize }),
        ...(draftColor === undefined ? {} : { symbolColor: draftColor }),
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
    hint.textContent = "Glissez les broches pour les déplacer. Pour chaque port multibits, choisissez une broche de bus unique ou des broches individuelles."
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
    const sizeControls = document.createElement("div")
    sizeControls.className = "symbol-size-controls"
    const sizeInputs = (label: string, axis: "width" | "height") => {
        const field = document.createElement("label")
        const caption = document.createElement("span")
        caption.textContent = label
        const input = document.createElement("input")
        input.type = "number"
        input.step = "1"
        input.max = "4096"
        input.addEventListener("change", () => {
            const value = input.valueAsNumber
            if (Number.isFinite(value)) setSize({ width:currentDef.gridWidth,height:currentDef.gridHeight,[axis]:value })
            else render()
        })
        field.append(caption,input)
        sizeControls.append(field)
        return input
    }
    const widthInput = sizeInputs("Largeur (grille)","width")
    const heightInput = sizeInputs("Hauteur (grille)","height")
    const automaticSize = document.createElement("button")
    automaticSize.type = "button"
    automaticSize.textContent = "Taille automatique"
    automaticSize.addEventListener("click",() => { draftSize = undefined; render() })
    sizeControls.append(automaticSize)
    const colorControls = document.createElement("div")
    colorControls.className = "symbol-color-controls"
    const colorLabel = document.createElement("span")
    colorLabel.textContent = "Couleur par défaut"
    colorControls.append(colorLabel)
    const swatches = document.createElement("div")
    swatches.className = "symbol-color-swatches"
    const colors = new Map<string,HTMLButtonElement>()
    for (const {color,fr} of symbolColorPalette) {
        const swatch = document.createElement("button")
        swatch.type = "button"
        swatch.className = "symbol-color-swatch"
        swatch.style.setProperty("--swatch",color)
        swatch.title = fr
        swatch.setAttribute("aria-label",fr)
        swatch.addEventListener("click",() => { draftColor = color; render() })
        colors.set(color,swatch)
        swatches.append(swatch)
    }
    const picker = document.createElement("input")
    picker.type = "color"
    picker.title = "Couleur personnalisée"
    picker.setAttribute("aria-label","Couleur personnalisée")
    picker.addEventListener("input",() => { draftColor = picker.value; render() })
    const clearColor = document.createElement("button")
    clearColor.type = "button"
    clearColor.textContent = "Sans couleur"
    clearColor.addEventListener("click",() => { draftColor = undefined; render() })
    colorControls.append(swatches,picker,clearColor)
    previewPanel.append(previewTitle, sizeControls, colorControls, preview, dropHint)
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
        root.draftSymbolColor = draftColor
        root.draftSymbolSize = draftSize === undefined ? undefined : { width:currentDef.gridWidth,height:currentDef.gridHeight }
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
    let resize: { pointer:number, x:number,y:number,width:number,height:number, dx:number,dy:number, matrix:DOMMatrix, viewBox:string, original:SymbolSize | undefined } | undefined
    function setSize(size: SymbolSize) {
        draftSize = snapSymbolSize(size,currentDef.minimumSize())
        render()
    }
    let currentDef = makeDef(draft)
    let allEntries: ExternalPinLayout = []
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const spring = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, angle: 0, av: 0, scale: 1, sv: 0 }
    let frame = 0
    let lastFrame = 0
    let settling = false
    let settleStarted = 0
    let sourceElement: Element | undefined
    let landingElement: Element | undefined

    function stopMotion() {
        if (frame !== 0) cancelAnimationFrame(frame)
        frame = 0
        lastFrame = 0
        settling = false
        ghost.hidden = true
        ghost.classList.remove("is-settling")
        sourceElement?.classList.remove("pin-drag-source")
        sourceElement = undefined
        landingElement?.classList.remove("pin-landing")
        landingElement = undefined
    }

    function paintGhost() {
        ghost.style.transform = "translate3d(" + spring.x + "px," + spring.y + "px,0) rotate(" + spring.angle + "deg) scale(" + spring.scale + ")"
    }

    function tick(now: number) {
        frame = 0
        if (ghost.hidden || !dialog.isConnected) { stopMotion(); return }
        // Damped spring with bounded substeps; drop hit testing uses the actual pointer.
        let dt = lastFrame === 0 ? 1 / 60 : Math.min(.05, (now - lastFrame) / 1000)
        lastFrame = now
        while (dt > 0) {
            const step = Math.min(dt, 1 / 120)
            dt -= step
            const stiffness = settling ? 390 : 520
            const damping = settling ? 30 : 36
            spring.vx += ((spring.tx - spring.x) * stiffness - spring.vx * damping) * step
            spring.vy += ((spring.ty - spring.y) * stiffness - spring.vy * damping) * step
            spring.x += spring.vx * step
            spring.y += spring.vy * step
            const tilt = settling ? 0 : Math.max(-8, Math.min(8, spring.vx * .012))
            spring.av += ((tilt - spring.angle) * 220 - spring.av * 23) * step
            spring.angle += spring.av * step
            const scale = settling ? .72 : 1.04
            spring.sv += ((scale - spring.scale) * 300 - spring.sv * 25) * step
            spring.scale += spring.sv * step
        }
        paintGhost()
        if (settling && ((Math.hypot(spring.tx - spring.x, spring.ty - spring.y) < 1.5 && Math.hypot(spring.vx, spring.vy) < 15) || now - settleStarted > 500)) {
            const landed = landingElement
            stopMotion()
            landed?.animate([{ opacity: .65 }, { opacity: 1 }], { duration: 150, easing: "ease-out" })
            return
        }
        frame = requestAnimationFrame(tick)
    }

    function trackGhost(x: number, y: number) {
        spring.tx = x + 14
        spring.ty = y + 14
        if (reducedMotion.matches) {
            spring.x = spring.tx
            spring.y = spring.ty
            spring.angle = 0
            spring.scale = 1
            paintGhost()
        } else if (frame === 0) {
            frame = requestAnimationFrame(tick)
        }
    }

    function settleGhost(destination: Element | undefined) {
        if (destination === undefined || reducedMotion.matches || ghost.hidden) { stopMotion(); return }
        const rect = destination.getBoundingClientRect()
        spring.tx = rect.left + (rect.width - ghost.offsetWidth) / 2
        spring.ty = rect.top + (rect.height - ghost.offsetHeight) / 2
        settling = true
        settleStarted = performance.now()
        ghost.classList.add("is-settling")
        landingElement = destination
        destination.classList.add("pin-landing")
        if (frame === 0) frame = requestAnimationFrame(tick)
    }

    function pinRow(id: string) {
        return [...groups.querySelectorAll<HTMLElement>("[data-pin-id]")].find(row => row.dataset.pinId === id)
    }

    function previewPin(id: string) {
        return [...preview.querySelectorAll<SVGElement>("[data-preview-pin]")].find(pin => pin.getAttribute("data-preview-pin") === id)
    }

    function animateRows(before: Map<string, DOMRect>, moved: string) {
        if (reducedMotion.matches) return
        for (const row of groups.querySelectorAll<HTMLElement>("[data-pin-id]")) {
            const id = row.dataset.pinId
            if (id === undefined || id === moved) continue
            const old = before.get(id)
            if (old === undefined) continue
            const rect = row.getBoundingClientRect()
            const dx = old.left - rect.left, dy = old.top - rect.top
            if (Math.abs(dx) + Math.abs(dy) < 1) continue
            row.animate([
                { transform: "translate(" + dx + "px," + dy + "px)" },
                { transform: "translate(" + (-dx * .05) + "px," + (-dy * .05) + "px)", offset: .78 },
                { transform: "translate(0,0)" },
            ], { duration: 250, easing: "cubic-bezier(.2,.75,.3,1)" })
        }
    }

    function movePin(id: string, target: DropTarget) {
        const before = new Map<string, DOMRect>()
        for (const row of groups.querySelectorAll<HTMLElement>("[data-pin-id]")) {
            if (row.dataset.pinId !== undefined) before.set(row.dataset.pinId, row.getBoundingClientRect())
        }
        const entries = allEntries.filter(entry => entry.id !== id)
        const sameSide = entries.filter(entry => entry.side === target.side)
        const next = sameSide[target.index]
        const index = next === undefined ? entries.length : entries.findIndex(entry => entry.id === next.id)
        entries.splice(index, 0, { ...allEntries.find(entry => entry.id === id), id, side: target.side })
        draft = entries
        render()
        animateRows(before, id)
    }

    function startDrag(e: PointerEvent, id: string, label: string) {
        if (e.button !== 0 || !e.isPrimary || drag !== undefined || resize !== undefined) return
        e.preventDefault()
        stopMotion()
        for (const row of groups.querySelectorAll<HTMLElement>("[data-pin-id]")) {
            for (const animation of row.getAnimations()) animation.cancel()
        }
        sourceElement = e.currentTarget instanceof Element ? e.currentTarget : undefined
        spring.x = spring.tx = e.clientX + 14
        spring.y = spring.ty = e.clientY + 14
        spring.vx = spring.vy = spring.angle = spring.av = spring.sv = 0
        spring.scale = .96
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
        if (resize?.pointer === e.pointerId) {
            const point = new DOMPoint(e.clientX,e.clientY).matrixTransform(resize.matrix)
            const next = snapSymbolSize({ width: resize.width + (point.x-resize.x)*resize.dx/6, height: resize.height + (point.y-resize.y)*resize.dy/6 },currentDef.minimumSize())
            if (next.width !== currentDef.gridWidth || next.height !== currentDef.gridHeight) setSize(next)
            return
        }
        if (drag === undefined || drag.pointer !== e.pointerId) return
        if (!drag.started && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return
        if (!drag.started) {
            drag.started = true
            dialog.classList.add("pin-layout-dragging")
            sourceElement?.classList.add("pin-drag-source")
            ghost.hidden = false
            ghost.textContent = drag.label
            paintGhost()
            showTarget(undefined)
        }
        trackGhost(e.clientX, e.clientY)
        const target = findTarget(e.clientX, e.clientY, drag.id)
        if (target?.side !== drag.target?.side || target?.index !== drag.target?.index) {
            drag.target = target
            showTarget(target)
        }
    })

    function finishDrag(e: PointerEvent, commit: boolean) {
        if (resize?.pointer === e.pointerId) {
            const previous = resize
            resize = undefined
            if (!commit) draftSize = previous.original
            if (dialog.hasPointerCapture(e.pointerId)) dialog.releasePointerCapture(e.pointerId)
            render()
            return
        }
        if (drag === undefined || drag.pointer !== e.pointerId) return
        const previous = drag
        const target = commit && previous.started ? findTarget(e.clientX, e.clientY, previous.id) : undefined
        const fromPreview = sourceElement?.classList.contains("pin-preview-handle") ?? false
        const box = preview.getBoundingClientRect()
        const toPreview = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom
        drag = undefined
        dialog.classList.remove("pin-layout-dragging")
        showTarget(undefined)
        dropHint.textContent = "Attrapez une broche pour la déplacer."
        if (dialog.hasPointerCapture(e.pointerId)) dialog.releasePointerCapture(e.pointerId)
        sourceElement?.classList.remove("pin-drag-source")
        if (!previous.started) { stopMotion(); return }
        if (target !== undefined) movePin(previous.id, target)
        const destination = (target !== undefined ? toPreview : fromPreview) ? previewPin(previous.id) : pinRow(previous.id)
        settleGhost(destination)
    }
    dialog.addEventListener("pointerup", e => finishDrag(e, true))
    dialog.addEventListener("pointercancel", e => finishDrag(e, false))
    dialog.addEventListener("lostpointercapture", e => finishDrag(e, false))
    dialog.addEventListener("close", () => { drag = undefined; stopMotion(); dialog.remove(); onClose() }, { once: true })

    function render() {
        const def = currentDef = makeDef(draft)
        const pins = def.externalPins()
        status.textContent = draft === undefined && draftSize === undefined && draftColor === undefined ? "Automatique" : "Personnalisé"
        status.classList.toggle("is-custom", draft !== undefined || draftSize !== undefined || draftColor !== undefined)
        for (const [color,swatch] of colors) swatch.setAttribute("aria-pressed",String(draftColor === color))
        picker.value = draftColor ?? "#3b82f6"
        clearColor.disabled = draftColor === undefined
        const minimum = def.minimumSize()
        widthInput.min = String(minimum.width)
        heightInput.min = String(minimum.height)
        widthInput.value = String(def.gridWidth)
        heightInput.value = String(def.gridHeight)
        automaticSize.disabled = draftSize === undefined
        dropHint.textContent = "Taille : " + def.gridWidth + " × " + def.gridHeight + " cases. Glissez les bordures ou les angles pour redimensionner."
        allEntries = pins.map(pin => ({ id: pin.id, side: pin.orient, ...(pin.bus ? { bus: true } : {}) }))
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
                row.append(handle, kind, name)
                if (pin.numBits > 1) {
                    const bus = button(pin.bus ? "Bus" : "Bits", () => {
                        draft = allEntries.map(entry => entry.id === pin.id ? { ...entry, bus: !pin.bus } : entry)
                        render()
                    })
                    bus.className = "pin-bus-toggle" + (pin.bus ? " active" : "")
                    bus.title = pin.bus ? "Afficher " + pin.numBits + " broches individuelles" : "Afficher une seule broche de bus (" + pin.numBits + " bits)"
                    bus.setAttribute("aria-label",pin.name + " : " + bus.title)
                    bus.setAttribute("aria-pressed",String(!!pin.bus))
                    row.append(bus)
                }
                row.append(select, up, down)
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
        svg.setAttribute("viewBox", resize?.viewBox ?? [-w / 2 - 110, -h / 2 - 60, w + 220, h + 120].join(" "))
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
        if (def.symbolColor !== undefined) shape("rect",{ x:-w/2,y:-h/2,width:w,height:h,rx:5,fill:def.symbolColor,"fill-opacity":symbolTintOpacity,"pointer-events":"none" })
        const measure = document.createElement("canvas").getContext("2d")
        const fit = fitSymbolCaption(def.caption,def.captionWidth(),(text,font) => {
            if (!measure) return text.length * font * .6
            measure.font = "bold " + font + "px sans-serif"
            return measure.measureText(text).width
        })
        shape("text", { x: 0, y: 0, "text-anchor": "middle", "dominant-baseline": "middle", fill: "currentColor", "font-size": fit.font*1.2, "font-weight": 700 }, fit.text)
        for (const { pin, x, y } of def.externalPinPositions()) {
            const px = x * 12, py = y * 12
            const dx = pin.orient === "w" ? -1 : pin.orient === "e" ? 1 : 0
            const dy = pin.orient === "n" ? -1 : pin.orient === "s" ? 1 : 0
            const color = pin.isIn ? "var(--pin-input)" : "var(--pin-output)"
            const label = pin.name + (pin.numBits > 1 ? " [" + pin.numBits + "]" : "")
            const group = shape("g", { class: "pin-preview-handle", "data-preview-pin": pin.id })
            shape("title", {}, label + " — glisser pour déplacer", group)
            const count = pin.bus ? 1 : pin.numBits
            // Match the simulator's individual-pin spacing, with a compact preview for large groups.
            const spacing = useCompact(pin.numBits) ? 12 : 24
            for (let i = 0; i < count; i++) {
                const offset = (i - (count - 1) / 2) * spacing
                const bx = px + (dy !== 0 ? offset : 0), by = py + (dx !== 0 ? offset : 0)
                shape("line", { x1: bx - 12 * dx, y1: by - 12 * dy, x2: bx, y2: by, stroke: color, "stroke-width": pin.bus ? 4 : 2 }, undefined, group)
                shape("circle", { cx: bx, cy: by, r: 9, fill: color, "fill-opacity": .13, class: "pin-preview-hit" }, undefined, group)
                if (pin.bus) shape("rect", { x: bx-4, y: by-4, width: 8, height: 8, rx: 1, fill: color }, undefined, group)
                else shape("circle", { cx: bx, cy: by, r: 3, fill: color }, undefined, group)
            }
            group.addEventListener("pointerdown", e => startDrag(e, pin.id, label))
            const tx = px + dx * 8, ty = py + dy * 9
            const attrs: Record<string, string | number> = { x: tx, y: ty, fill: "currentColor", "font-size": 11, "dominant-baseline": "middle", "text-anchor": dx < 0 ? "end" : dx > 0 ? "start" : dy < 0 ? "start" : "end" }
            if (dy !== 0) attrs.transform = "rotate(-90 " + tx + " " + ty + ")"
            shape("text", attrs, label, group)
        }
        // Invisible resize hit areas along the full edges, with diagonal corners.
        // Keep most of each area inside the outline to avoid intercepting external pins.
        const edge = 6, corner = 11, outside = 2
        for (const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
            const isCorner = dx !== 0 && dy !== 0
            const thickness = isCorner ? corner : edge
            const handle = shape("rect",{
                x: dx === 0 ? -w/2+corner : dx < 0 ? -w/2-outside : w/2-thickness,
                y: dy === 0 ? -h/2+corner : dy < 0 ? -h/2-outside : h/2-thickness,
                width: dx === 0 ? Math.max(0,w-2*corner) : thickness+outside,
                height: dy === 0 ? Math.max(0,h-2*corner) : thickness+outside,
                class:"symbol-resize-hit",
            })
            handle.style.cursor = dx === 0 ? "ns-resize" : dy === 0 ? "ew-resize" : dx === dy ? "nwse-resize" : "nesw-resize"
            handle.addEventListener("pointerdown",e => {
                if (e.button !== 0 || !e.isPrimary || drag || resize) return
                const transform = svg.getScreenCTM()
                if (!transform) return
                e.preventDefault()
                e.stopPropagation()
                stopMotion()
                const matrix = transform.inverse()
                const point = new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix)
                resize = {pointer:e.pointerId,x:point.x,y:point.y,width:def.gridWidth,height:def.gridHeight,dx,dy,matrix,viewBox:svg.getAttribute("viewBox")!,original:draftSize}
                dialog.setPointerCapture(e.pointerId)
            })
        }
        preview.append(svg)
    }
    render()
    try { dialog.showModal() } catch { dialog.remove(); onClose(); throw new Error("Could not open component appearance editor") }
}
