import type { CustomComponent } from "./components/CustomComponent"
import type { Input } from "./components/Input"
import type { Output } from "./components/Output"
import type { Component } from "./components/Component"
import type { Wire } from "./components/Wire"
import { circuitSignature, makeTruthInputs, type DevelopmentCase, type TestPort, type TruthTable } from "./CustomComponentTesting"
import { binaryStringRepr, type LogicValue } from "./utils"

type Port<T> = TestPort & { component: T }
const MAX_BITS = 10
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function ports<T extends Input | Output>(components: T[]): Port<T>[] {
    return components.filter(c => c.ref !== undefined).map(c => ({
        id: c.ref!, name: typeof c.name === "string" ? c.name : c.ref!, bits: c.numBits, component: c,
    })).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
function plain<T>(ports: Port<T>[]): TestPort[] {
    return ports.map(({ id, name, bits }) => ({ id, name, bits }))
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text !== undefined) e.textContent = text
    return e
}

// A truth table is only meaningful for combinational circuits. Reject feedback and
// known stateful sources, including those hidden inside nested custom components.
function collectCombinational(root: CustomComponent): Wire[] {
    const wires: Wire[] = []
    const inspect = (container: CustomComponent) => {
        const components = [...container.components.all()]
        const visited = new Set<Component>(), visiting = new Set<Component>()
        const graph = new Map<Component, Component[]>()
        for (const comp of components) {
            const type = comp.def.type
            if (/clock|random|latch|flipflop|register|counter|ram|shift/i.test(type) && !type.startsWith("custom-")) {
                throw new Error("Composant à état détecté (" + type + "). Les tests combinatoires ne couvrent pas les séquences temporelles.")
            }
            if (type.startsWith("custom-")) inspect(comp as CustomComponent)
            graph.set(comp, [])
        }
        for (const wire of container.linkMgr.wires) {
            wires.push(wire)
            const source = wire.startNode.component, target = wire.endNode.component
            graph.get(source)?.push(target)
        }
        const visit = (comp: Component) => {
            if (visiting.has(comp)) throw new Error("Boucle de rétroaction détectée : table combinatoire impossible.")
            if (visited.has(comp)) return
            visiting.add(comp)
            for (const next of graph.get(comp) ?? []) visit(next)
            visiting.delete(comp)
            visited.add(comp)
        }
        for (const comp of components) visit(comp)
    }
    inspect(root)
    return wires
}

export function openComponentTestingDialog(root: CustomComponent, host: HTMLElement, onClose: () => void) {
    const editor = root.editor
    const draft = structuredClone(root.draftDocumentation)
    const components = [...root.components.all()]
    const ins = ports(components.filter((c): c is Input => c.def.type === "in" && !(c as Input).isConstant))
    const outs = ports(components.filter((c): c is Output => c.def.type === "out"))
    const bits = ins.reduce((n,p) => n + p.bits, 0)
    const signature = () => circuitSignature(editor.factory.buildCustomTestingCircuit(root), id => editor.factory.getCustomDef(id)?.circuit)
    const dialog = element("dialog", "component-testing-dialog")
    const header = element("header")
    header.append(element("small", "", "LOGIC / COMPONENT WORKBENCH"), element("h2", "", root.customDef.caption))
    const nav = element("nav", "component-testing-tabs")
    const body = element("div", "component-testing-body")
    const notice = element("p", "component-testing-notice")
    notice.setAttribute("role", "status")
    const footer = element("footer")
    let tab: "truth" | "custom" | "info" = "truth"
    let running = false, cancelled = false
    const button = (label: string, action: () => void, cls?: string) => {
        const b = element("button", cls, label)
        b.type = "button"
        b.addEventListener("click", action)
        return b
    }
    const close = button("Annuler", () => dialog.close())
    const apply = button("Enregistrer", () => {
        root.draftDocumentation = structuredClone(draft)
        editor.setDirty("component tests and documentation")
        editor.editTools.undoMgr.takeSnapshot()
        editor.eventMgr.clearTooltipIfNeeded()
        dialog.close()
    }, "primary")
    const stop = button("Arrêter", () => { cancelled = true })
    stop.hidden = true
    footer.append(stop, close, apply)
    dialog.append(header, nav, body, notice, footer)
    host.append(dialog)
    dialog.addEventListener("cancel", e => { if (running) { e.preventDefault(); cancelled = true } })
    dialog.addEventListener("close", () => { cancelled = true; dialog.remove(); onClose() }, { once: true })
    const tabs = [["truth", "Table de vérité"], ["custom", "Tests de développement"], ["info", "Description & survol"]] as const
    for (const [id,label] of tabs) nav.append(button(label, () => { tab = id; render() }))
    function setRunning(value: boolean) {
        running = value
        cancelled = false
        nav.inert = value
        close.disabled = apply.disabled = value
        stop.hidden = !value
    }
    function report(error: unknown) { notice.textContent = error instanceof Error ? error.message : String(error) }
    function requirePorts() {
        if (!ins.length || !outs.length) throw new Error("Ajoutez au moins une entrée non constante et une sortie.")
    }
    async function execute(action: (evaluate: (values: string[]) => string[]) => Promise<void>) {
        if (running) return
        setRunning(true)
        notice.textContent = ""
        const original = new Map<Input, LogicValue[]>()
        const delays = new Map<Wire, number | undefined>()
        try {
            requirePorts()
            // Validate current circuit and run only combinational cases. Temporarily
            // bypass propagation delays, then restore switches and delays in finally.
            signature()
            for (const wire of collectCombinational(root)) { delays.set(wire, wire.customPropagationDelay); wire.customPropagationDelay = 0 }
            for (const port of ins) original.set(port.component, port.component.value.slice())
            const evaluate = (values: string[]) => {
                for (const [i, port] of ins.entries()) {
                    const value = values[i]
                    if (value.length !== port.bits || !/^[01]+$/.test(value)) throw new Error("Valeur binaire incorrecte : " + port.name)
                    port.component.setValue([...value].reverse().map(bit => bit === "1"))
                    port.component.propagateCurrentValue()
                }
                root.recalcMgr.recalcAndPropagateIfNeeded()
                return outs.map(port => binaryStringRepr(port.component.value))
            }
            await action(evaluate)
        } catch (error) { report(error) }
        finally {
            try {
                for (const [input,value] of original) { input.setValue(value); input.propagateCurrentValue() }
                root.recalcMgr.recalcAndPropagateIfNeeded()
            } finally {
                for (const [wire,delay] of delays) wire.customPropagationDelay = delay
                setRunning(false)
                editor.recalcPropagateAndDrawIfNeeded()
            }
        }
    }
    function truthView() {
        const intro = element("p", "", "Les entrées sont générées automatiquement. Le simulateur mesure chaque sortie, ligne par ligne. Ce relevé décrit le comportement observé, il ne prouve pas sa justesse.")
        body.append(intro)
        if (bits > MAX_BITS || !ins.length || !outs.length) {
            body.append(element("p", "", "Table exhaustive disponible de 1 à " + MAX_BITS + " bits d’entrée, avec au moins une sortie. Utilisez les tests personnalisés pour les circuits plus larges."))
            return
        }
        let currentSignature: string | undefined
        try { currentSignature = signature() } catch (error) { report(error) }
        const count = 2 ** bits
        const progress = element("progress")
        progress.max = count
        const toolbar = element("div", "component-testing-toolbar")
        const progressText = element("span")
        const wrap = element("div", "component-testing-table")
        const table = element("table")
        const h = table.createTHead().insertRow()
        for (const [i,port] of [...ins,...outs].entries()) {
            const cell = element("th", i < ins.length ? "test-input" : "test-output", port.name + (port.bits > 1 ? " [" + port.bits + "]" : ""))
            h.append(cell)
        }
        const tbody = table.createTBody()
        const cells: HTMLTableCellElement[][] = []
        const inputRows: string[][] = []
        const truth = draft.truth
        const saved = truth !== undefined && truth.signature === currentSignature && truth.rows.length === count && JSON.stringify(truth.inputs) === JSON.stringify(plain(ins)) && JSON.stringify(truth.outputs) === JSON.stringify(plain(outs)) ? truth : undefined
        for (let i=0;i<count;i++) {
            const values = makeTruthInputs(ins,i)
            inputRows.push(values)
            const row = tbody.insertRow()
            for (const value of values) row.insertCell().textContent = value
            cells.push(outs.map((_,j) => {
                const cell = row.insertCell()
                cell.textContent = saved?.rows[i]?.[ins.length+j] ?? "—"
                return cell
            }))
        }
        progress.value = saved ? count : 0
        progressText.textContent = progress.value + " / " + count
        const run = button("▶ Générer la table", () => {
            void execute(async evaluate => {
                run.disabled = true
                progress.value = 0
                progressText.textContent = "0 / " + count
                for (const row of cells) for (const cell of row) cell.textContent = "—"
                const rows: string[][] = []
                try {
                    const testedSignature = signature()
                    for (let i=0;i<count;i++) {
                        if (cancelled) { notice.textContent = "Calcul interrompu. La dernière table complète est conservée."; return }
                        const actual = evaluate(inputRows[i])
                        rows.push([...inputRows[i],...actual])
                        actual.forEach((value,j) => { cells[i][j].textContent = value })
                        progress.value = i+1
                        progressText.textContent = (i+1) + " / " + count
                        if (i % 4 === 0) await pause()
                    }
                    const truth: TruthTable = { signature: testedSignature, inputs: plain(ins), outputs: plain(outs), rows }
                    draft.truth = truth
                    notice.textContent = "Table complète. Enregistrez pour la publier selon vos réglages de survol."
                } finally { run.disabled = false }
            })
        }, "primary")
        toolbar.append(run, progress, progressText)
        if (draft.truth && !saved) toolbar.append(element("span", "test-warning", "Table obsolète : régénérez-la."))
        wrap.append(table)
        body.append(toolbar,wrap)
    }
    function customView() {
        body.append(element("p", "", "Définissez les entrées et les sorties attendues. Ces cas restent privés à l’édition du composant et ne sont jamais affichés au survol."))
        const result = new Map<string,string>()
        const toolbar = element("div", "component-testing-toolbar")
        const runAll = button("▶ Exécuter les tests", () => {
            void execute(async evaluate => {
                runAll.disabled = add.disabled = true
                try {
                    for (const test of draft.cases) {
                        if (cancelled) break
                        try {
                            const actual = evaluate(ins.map(p => test.inputs[p.id] ?? ""))
                            const expected = outs.map(p => test.expected[p.id] ?? "")
                            result.set(test.id, expected.every((value,i) => value === actual[i]) ? "Réussi" : "Échec · obtenu " + actual.join(" / "))
                        } catch (error) { result.set(test.id, error instanceof Error ? error.message : String(error)) }
                        updateResults()
                        await pause()
                    }
                } finally { runAll.disabled = add.disabled = false }
            })
        }, "primary")
        const add = button("+ Ajouter un test", () => {
            const test: DevelopmentCase = {
                id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2), name: "Test " + (draft.cases.length+1),
                inputs: Object.fromEntries(ins.map(p => [p.id,"0".repeat(p.bits)])),
                expected: Object.fromEntries(outs.map(p => [p.id,"0".repeat(p.bits)])),
            }
            draft.cases.push(test)
            render()
        })
        toolbar.append(add,runAll)
        body.append(toolbar)
        const list = element("div","component-test-cases")
        const resultElements = new Map<string,HTMLElement>()
        function updateResults() {
            for (const [id,node] of resultElements) {
                const text = result.get(id) ?? "Non exécuté"
                node.textContent = text
                node.dataset.result = text === "Réussi" ? "pass" : result.has(id) ? "fail" : "idle"
            }
        }
        for (const test of draft.cases) {
            const card = element("section","component-test-case")
            const head = element("div","component-testing-toolbar")
            const name = element("input")
            name.value = test.name
            name.setAttribute("aria-label","Nom du test")
            name.addEventListener("input", () => { test.name = name.value })
            const state = element("span","component-test-result")
            resultElements.set(test.id,state)
            const remove = button("Supprimer", () => { if (running) return; draft.cases = draft.cases.filter(c => c.id !== test.id); render() })
            head.append(name,state,remove)
            const fields = element("div","component-test-fields")
            for (const [title,ps,record] of [["Entrées",ins,test.inputs],["Sorties attendues",outs,test.expected]] as const) {
                const group = element("div")
                group.append(element("h3","",title))
                for (const p of ps) {
                    const label = element("label")
                    label.append(element("span","",p.name + " · " + p.bits + " bit(s)"))
                    const input = element("input")
                    input.value = record[p.id] ?? ""
                    input.maxLength = p.bits
                    input.pattern = "[01]{" + p.bits + "}"
                    input.addEventListener("input", () => { record[p.id] = input.value; result.delete(test.id); updateResults() })
                    label.append(input)
                    group.append(label)
                }
                fields.append(group)
            }
            card.append(head,fields)
            list.append(card)
        }
        if (!draft.cases.length) list.append(element("p","","Aucun test de développement. Ajoutez votre premier cas."))
        body.append(list)
        updateResults()
        // Keep editing controls inert while a run is active, without hiding progress.
        runAll.addEventListener("click", () => {
            if (!running) return
            list.inert = true
            const interval = setInterval(() => { if (!running || !dialog.isConnected) { list.inert = false; clearInterval(interval) } }, 40)
        })
    }
    function infoView() {
        const description = element("textarea")
        description.rows = 6
        description.placeholder = "Décrivez le rôle du composant, ses entrées et ses sorties…"
        description.value = draft.description
        description.addEventListener("input", () => { draft.description = description.value })
        const label = element("label","component-test-description")
        label.append(element("span","","Description personnalisée"),description)
        body.append(label)
        for (const [key,text] of [["showDescription","Afficher la description au survol"],["showTruth","Afficher la table de vérité au survol"]] as const) {
            const row = element("label","component-test-toggle")
            const input = element("input")
            input.type = "checkbox"
            input.checked = draft[key]
            input.addEventListener("change", () => { draft[key] = input.checked })
            row.append(input,element("span","",text))
            body.append(row)
        }
        body.append(element("p","","La table n’apparaît que si elle est complète et correspond encore au circuit. Les tests de développement ne sont jamais publiés dans l’infobulle."))
    }
    function render() {
        if (running) return
        body.replaceChildren()
        notice.textContent = ""
        ;[...nav.children].forEach((node,i) => node.classList.toggle("active",tabs[i][0] === tab))
        if (tab === "truth") truthView()
        else if (tab === "custom") customView()
        else infoView()
    }
    render()
    try { dialog.showModal() } catch (error) { dialog.remove(); onClose(); console.error(error) }
}
