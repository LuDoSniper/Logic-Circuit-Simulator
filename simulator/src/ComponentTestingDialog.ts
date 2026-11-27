import type { CustomComponent } from "./components/CustomComponent"
import type { Input } from "./components/Input"
import type { Output } from "./components/Output"
import type { Component } from "./components/Component"
import { testInputPhases } from "./ComponentTestExecution"
import { circuitSignature, makeTruthInputs, summarizeDevelopmentResults, TestGame, validBinary, type DevelopmentCase, type DevelopmentResult, type TestPort, type TruthTable } from "./CustomComponentTesting"
import { binaryStringRepr } from "./utils"
import { getLang } from "./strings"

const tr = (fr: string, en: string) => getLang() === "fr" ? fr : en

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
function collectCombinational(root: CustomComponent) {
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
            const source = wire.startNode.component, target = wire.endNode.component
            graph.get(source)?.push(target)
        }
        const visit = (comp: Component) => {
            if (visiting.has(comp)) throw new Error(tr("Boucle de rétroaction détectée : table combinatoire impossible.","Feedback loop detected: combinational table unavailable."))
            if (visited.has(comp)) return
            visiting.add(comp)
            for (const next of graph.get(comp) ?? []) visit(next)
            visiting.delete(comp)
            visited.add(comp)
        }
        for (const comp of components) visit(comp)
    }
    inspect(root)
}

export function openComponentTestingDialog(root: CustomComponent, host: HTMLElement, onClose: () => void) {
    const editor = root.editor
    const draft = structuredClone(root.draftDocumentation)
    const components = [...root.components.all()]
    const ins = ports(components.filter((c): c is Input => c.def.type === "in" && !(c as Input).isConstant))
    const outs = ports(components.filter((c): c is Output => c.def.type === "out" && !(c as Output).isInternal))
    const bits = ins.reduce((n,p) => n + p.bits, 0)
    const signature = () => circuitSignature(editor.factory.buildCustomTestingCircuit(root), id => editor.factory.getCustomDef(id)?.circuit)
    const newId = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)
    function currentResults(): Record<string, DevelopmentResult> {
        try { if (draft.results?.signature === signature()) return draft.results.cases } catch { /* invalid circuit */ }
        return {}
    }
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
    const close = button(tr("Annuler","Cancel"), () => dialog.close())
    const apply = button(tr("Enregistrer","Save"), () => {
        root.draftDocumentation = structuredClone(draft)
        editor.setDirty("component tests and documentation")
        editor.editTools.undoMgr.takeSnapshot()
        editor.eventMgr.clearTooltipIfNeeded()
        dialog.close()
    }, "primary")
    const stop = button(tr("Arrêter","Stop"), () => { cancelled = true })
    stop.hidden = true
    footer.append(stop, close, apply)
    dialog.append(header, nav, body, notice, footer)
    host.append(dialog)
    dialog.addEventListener("cancel", e => { if (running) { e.preventDefault(); cancelled = true } })
    dialog.addEventListener("close", () => { cancelled = true; dialog.remove(); onClose() }, { once: true })
    const tabs = [["truth", tr("Table de vérité","Truth table")], ["custom", tr("Tests de développement","Development tests")], ["info", tr("Description & survol","Description & tooltip")]] as const
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
        if (!ins.length || !outs.length) throw new Error(tr("Ajoutez au moins une entrée non constante et une sortie.","Add at least one non-constant input and one output."))
    }
    async function execute(action: (evaluate: (values: string[]) => string[]) => Promise<void>, sequential = false) {
        if (running) return
        setRunning(true)
        notice.textContent = ""
        try {
            requirePorts()
            if (!sequential) collectCombinational(root)
            signature()
            const sandbox = editor.factory.createComponentTestSandbox(root)
            const mapped = new Map(sandbox.components.map(c => [c.ref,c]))
            const inputs = ins.map(p => {
                const comp = mapped.get(p.id)
                if (!comp || comp.def.type !== "in") throw new Error("Missing test input: " + p.name)
                return comp as Input
            })
            const outputs = outs.map(p => {
                const comp = mapped.get(p.id)
                if (!comp || comp.def.type !== "out") throw new Error("Missing test output: " + p.name)
                return comp as Output
            })
            const clocks = ins.map((p,i) => p.bits === 1 && (/^(clk|clock|horloge)$/i.test(p.name) || inputs[i].isLinkedToSomeClock))
            const applyValues = (values: string[], indexes: readonly number[]) => {
                for (const i of indexes) {
                    inputs[i].setValue([...values[i]].reverse().map(bit => bit === "1"))
                    inputs[i].propagateCurrentValue()
                }
                sandbox.settle()
            }
            // Each execution starts from a fresh circuit with manual clocks low.
            // No reset is invented: the suite must explicitly initialize its memory.
            let previous = inputs.map(input => binaryStringRepr(input.value))
            if (sequential) {
                const initial = ins.map(p => "0".repeat(p.bits))
                applyValues(initial,ins.map((_,i)=>i).filter(i=>clocks[i]))
                applyValues(initial,ins.map((_,i)=>i).filter(i=>!clocks[i]))
                previous = initial
            }
            const evaluate = (values: string[]) => {
                for (const [i, port] of ins.entries()) {
                    if (!validBinary(values[i],port.bits)) throw new Error(tr("Valeur binaire incorrecte : ","Invalid binary value: ") + port.name)
                }
                const phases = sequential ? testInputPhases(previous,values,clocks) : [ins.map((_,i)=>i)]
                for (const phase of phases) applyValues(values,phase)
                previous = values.slice()
                sandbox.settle()
                sandbox.assertValid()
                return outputs.map(port => binaryStringRepr(port.value))
            }
            await action(evaluate)
        } catch (error) {
            report(error)
            console.error("Component test execution failed:",error)
        } finally {
            setRunning(false)
        }
    }
    function truthView() {
        const intro = element("p", "", "Les entrées sont générées automatiquement. Le simulateur mesure chaque sortie, ligne par ligne. Ce relevé décrit le comportement observé, il ne prouve pas sa justesse.")
        body.append(intro)
        function unavailable(reason: string, title = tr("Table de vérité indisponible","Truth table unavailable")) {
            const panel = element("section", "truth-unavailable")
            panel.append(element("h3", "", title), element("p", "", reason),
                button(tr("Ouvrir les tests de développement","Open development tests"), () => { tab = "custom"; render() }, "primary"))
            body.append(panel)
        }
        try { collectCombinational(root) }
        catch (error) { unavailable(error instanceof Error ? error.message : String(error), tr("Table de vérité impossible en l’état","Truth table unavailable for this circuit")); return }
        if (bits > MAX_BITS) {
            const rows = bits <= 52 ? (2 ** bits).toLocaleString(getLang() === "fr" ? "fr-FR" : "en-US") : "2^" + bits
            unavailable("Ce composant possède " + bits + " bits d’entrée, soit " + rows + " combinaisons. La limite du simulateur est de " + MAX_BITS + " bits (1 024 lignes). Une table exhaustive est théoriquement possible pour un circuit combinatoire, mais elle ne peut pas être générée ici.", tr("Table exhaustive trop volumineuse","Exhaustive table too large"))
            return
        }
        if (!ins.length || !outs.length) {
            unavailable(tr("Il faut au moins une entrée non constante et une sortie.","At least one non-constant input and one output are required."))
            return
        }
        let currentSignature: string
        try { currentSignature = signature() }
        catch (error) { unavailable(error instanceof Error ? error.message : String(error), tr("Table de vérité impossible en l’état","Truth table unavailable for this circuit")); return }
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
        const run = button(tr("▶ Générer la table","▶ Generate table"), () => {
            void execute(async evaluate => {
                run.disabled = true
                progress.value = 0
                progressText.textContent = "0 / " + count
                for (const row of cells) for (const cell of row) cell.textContent = "—"
                const rows: string[][] = []
                try {
                    const testedSignature = signature()
                    for (let i=0;i<count;i++) {
                        if (cancelled) { notice.textContent = tr("Calcul interrompu. La dernière table complète est conservée.","Generation stopped. The last complete table is kept."); return }
                        const actual = evaluate(inputRows[i])
                        rows.push([...inputRows[i],...actual])
                        actual.forEach((value,j) => { cells[i][j].textContent = value })
                        progress.value = i+1
                        progressText.textContent = (i+1) + " / " + count
                        if (i % 4 === 0) await pause()
                    }
                    const truth: TruthTable = { signature: testedSignature, inputs: plain(ins), outputs: plain(outs), rows }
                    draft.truth = truth
                    notice.textContent = tr("Table complète. Enregistrez pour la publier selon vos réglages de survol.","Table complete. Save to publish it according to tooltip settings.")
                } finally { run.disabled = false }
            })
        }, "primary")
        toolbar.append(run, progress, progressText)
        if (draft.truth && !saved) toolbar.append(element("span", "test-warning", tr("Table obsolète : régénérez-la.","Outdated table: regenerate it.")))
        wrap.append(table)
        body.append(toolbar,wrap)
    }
    function customView() {
        body.append(element("p", "", tr("Définissez les entrées et les sorties attendues. Ces cas restent privés à l’édition du composant et ne sont jamais affichés au survol.","Define inputs and expected outputs. These cases are only visible in the component editor, not in tooltips.")))
        body.append(element("p","",tr("Les cas sont exécutés dans l’ordre sur une copie isolée ; l’état est conservé entre les cas. Les horloges manuelles commencent à 0. Préparez les données avant le front actif.","Cases run in order on an isolated copy; state is preserved between cases. Manual clocks start at 0. Prepare data before the active edge.")))
        const result: Record<string, DevelopmentResult> = Object.assign(Object.create(null), currentResults())
        const toolbar = element("div", "component-testing-toolbar")
        const runAll = button(tr("▶ Exécuter les tests","▶ Run tests"), () => {
            void execute(async evaluate => {
                const testedSignature = signature()
                runAll.disabled = add.disabled = importButton.disabled = exportButton.disabled = true
                for (const key of Object.keys(result)) delete result[key]
                draft.results = { signature: testedSignature, cases: result }
                updateResults()
                try {
                    for (const test of draft.cases) {
                        if (cancelled) break
                        try {
                            const actual = evaluate(ins.map(p => test.inputs[p.id] ?? ""))
                            const expected = outs.map(p => test.expected[p.id] ?? "")
                            if (!outs.every((p,i) => validBinary(expected[i],p.bits))) throw new Error(tr("Sortie attendue invalide.","Invalid expected output."))
                            result[test.id] = { status: expected.every((value,i) => value === actual[i]) ? "pass" : "fail", actual: Object.fromEntries(outs.map((p,i) => [p.id,actual[i]])) }
                        } catch (error) { result[test.id] = { status: "error", message: error instanceof Error ? error.message : String(error) } }
                        updateResults()
                        await pause()
                    }
                    if (cancelled) notice.textContent = tr("Exécution interrompue. Les résultats obtenus sont conservés.","Run stopped. Completed results are kept.")
                } finally { runAll.disabled = add.disabled = importButton.disabled = exportButton.disabled = false }
            }, true)
        }, "primary")
        const add = button(tr("+ Ajouter un test","+ Add test"), () => {
            const test: DevelopmentCase = {
                id: newId(), name: "Test " + (draft.cases.length+1),
                inputs: Object.fromEntries(ins.map(p => [p.id,"0".repeat(p.bits)])),
                expected: Object.fromEntries(outs.map(p => [p.id,"0".repeat(p.bits)])),
            }
            draft.cases.push(test)
            render()
        })
        const importButton = button(tr("Importer JSON","Import JSON"), () => {
            const picker = element("input")
            picker.type = "file"
            picker.accept = ".json,application/json"
            picker.addEventListener("change", () => {
                const file = picker.files?.[0]
                if (!file) return
                void (async () => {
                    try {
                        if (file.size > 8 * 1024 * 1024) throw new Error(tr("Fichier trop volumineux.","File too large."))
                        const decoded = TestGame.decode(JSON.parse(await file.text()))
                        if (decoded._tag !== "Right") throw new Error(tr("Format de jeu de tests invalide (logic-remaster-tests v1).","Invalid test file format (logic-remaster-tests v1)."))
                        const game = decoded.right
                        if (game.cases.length > 1000 || draft.cases.length + game.cases.length > 1000) throw new Error(tr("Limite : 1 000 cas par composant.","Limit: 1,000 cases per component."))
                        function checkPorts(source: TestPort[], target: TestPort[], kind: string) {
                            const describe = (ps: TestPort[]) => ps.map(p => p.name + " (" + p.bits + " bit" + (p.bits === 1 ? "" : "s") + ")").join(", ")
                            const incompatible = (reason: string) => new Error("Jeu de tests incompatible — " + kind + " : " + reason + ". Fichier : " + describe(source) + ". Composant : " + describe(target) + ".")
                            if (source.some(p => !Number.isInteger(p.bits) || p.bits < 1) || new Set(source.map(p => p.id)).size !== source.length) throw incompatible("ports invalides ou dupliqués")
                            if (source.length !== target.length) throw incompatible("nombre de ports différent")
                            const widths = (ps: TestPort[]) => ps.map(p => p.bits).sort((a,b) => a-b).join(",")
                            if (widths(source) !== widths(target)) throw incompatible("tailles des bus différentes")
                            for (const p of source) {
                                const named = target.filter(t => t.name.toLowerCase() === p.name.toLowerCase())
                                if (named.length && !named.some(t => t.bits === p.bits)) throw incompatible("la broche " + p.name + " n’a pas la même taille")
                            }
                        }
                        // Check both directions before asking the user to map any renamed ports.
                        checkPorts(game.inputs,ins,"entrées")
                        checkPorts(game.outputs,outs,"sorties")
                        async function mapPorts(source: TestPort[], target: TestPort[], kind: string) {
                            const mapping = new Map<string,string>()
                            const used = new Set<string>()
                            // Reserve exact name/width matches first, regardless of source order.
                            for (const p of source) {
                                const matches = target.filter(t => t.bits === p.bits && t.name.toLowerCase() === p.name.toLowerCase() && !used.has(t.id))
                                if (matches.length === 1) {
                                    mapping.set(p.id,matches[0].id)
                                    used.add(matches[0].id)
                                }
                            }
                            for (const p of source) {
                                if (mapping.has(p.id)) continue
                                const available = target.filter(t => t.bits === p.bits && !used.has(t.id))
                                if (!available.length) throw new Error("Aucune broche compatible pour " + p.name)
                                const choices = available.map(t => t.name).join(", ")
                                const name = await editor.appPrompt("Le fichier utilise " + kind + " « " + p.name + " » (" + p.bits + " bits), introuvable sous ce nom. Saisissez le nom de la broche correspondante : " + choices, "")
                                if (name === null) throw new Error(tr("Import annulé.","Import cancelled."))
                                const matches = available.filter(t => t.name.toLowerCase() === name.trim().toLowerCase())
                                if (matches.length !== 1) throw new Error("Association impossible ou ambiguë pour " + p.name)
                                mapping.set(p.id,matches[0].id)
                                used.add(matches[0].id)
                            }
                            return mapping
                        }
                        const im = await mapPorts(game.inputs,ins,"l’entrée")
                        const om = await mapPorts(game.outputs,outs,"la sortie")
                        function mapValues(values: Record<string,string>, ports: TestPort[], mapping: Map<string,string>) {
                            if (Object.keys(values).length !== ports.length) throw new Error(tr("Colonnes manquantes ou supplémentaires dans un test.","Missing or extra columns in a test."))
                            return Object.fromEntries(ports.map(p => {
                                const value = values[p.id]
                                if (!validBinary(value,p.bits)) throw new Error("Valeur binaire invalide pour " + p.name)
                                return [mapping.get(p.id)!,value]
                            }))
                        }
                        const cases = game.cases.map(c => ({ id: newId(), name: c.name, inputs: mapValues(c.inputs,game.inputs,im), expected: mapValues(c.expected,game.outputs,om) }))
                        if (!dialog.isConnected || running) return
                        draft.cases.push(...cases)
                        render()
                        notice.textContent = cases.length + tr(" test(s) importé(s), sans résultats. Lancez leur exécution."," test(s) imported without results. Run them to obtain results.")
                    } catch (error) { report(error) }
                })()
            }, { once: true })
            picker.click()
        })
        const exportButton = button(tr("Exporter JSON","Export JSON"), () => {
            const results = currentResults()
            const game: TestGame = { format: "logic-remaster-tests", version: 1, component: root.customDef.caption,
                inputs: plain(ins), outputs: plain(outs), cases: structuredClone(draft.cases),
                ...(Object.keys(results).length ? { results: Object.fromEntries(draft.cases.filter(c => results[c.id] !== undefined).map(c => [c.id,results[c.id]])) } : {}) }
            const url = URL.createObjectURL(new Blob([JSON.stringify(game,null,2)], { type: "application/json" }))
            const a = element("a")
            a.href = url
            a.download = root.customDef.customId + ".tests.json"
            a.click()
            setTimeout(() => URL.revokeObjectURL(url),1000)
        })
        toolbar.append(add,runAll,importButton,exportButton)
        body.append(toolbar)
        const summary = element("section","component-test-summary")
        summary.setAttribute("aria-label",tr("Bilan des tests","Test summary"))
        const heading = element("div","component-test-summary-heading")
        heading.append(element("strong","",tr("Bilan des tests","Test summary")))
        const progressText = element("span","component-test-progress-text")
        progressText.setAttribute("role","status")
        heading.append(progressText)
        const counters = element("div","component-test-counts")
        const labels = {
            total: tr("Total","Total"), pass: tr("Réussis","Passed"), fail: tr("Échecs","Failed"),
            error: tr("Erreurs","Errors"), idle: tr("Non exécutés","Not run"),
        }
        const countNodes = new Map<keyof typeof labels, HTMLElement>()
        for (const key of ["total","pass","fail","error","idle"] as const) {
            const metric = element("div","component-test-metric")
            metric.dataset.status = key
            const count = element("strong","","0")
            countNodes.set(key,count)
            metric.append(count,element("span","",labels[key]))
            counters.append(metric)
        }
        const progress = element("div","component-test-progress")
        progress.setAttribute("role","progressbar")
        progress.setAttribute("aria-label",tr("Avancement des tests","Test progress"))
        const segments = new Map<string,HTMLElement>()
        for (const status of ["pass","fail","error","idle"]) {
            const segment = element("span")
            segment.dataset.status = status
            segments.set(status,segment)
            progress.append(segment)
        }
        const filterRow = element("label","component-test-filter")
        filterRow.append(element("span","",tr("Afficher","Show")))
        const filter = element("select")
        const options = [
            ["all",tr("Tous les tests","All tests")],
            ["problems",tr("Échecs et erreurs","Failures and errors")],
            ["pass",labels.pass],["fail",labels.fail],["error",labels.error],["idle",labels.idle],
        ] as const
        for (const [value,label] of options) {
            const option = element("option","",label)
            option.value = value
            filter.append(option)
        }
        filterRow.append(filter)
        summary.append(heading,counters,progress,filterRow)
        body.append(summary)
        const list = element("div","component-test-cases component-test-scroll")
        const emptyFilter = element("p","component-test-filter-empty",tr("Aucun test ne correspond à ce filtre.","No tests match this filter."))
        const resultElements = new Map<string,HTMLElement>()
        const cards = new Map<string,HTMLElement>()
        filter.addEventListener("change",updateResults)
        function updateResults() {
            const counts = summarizeDevelopmentResults(draft.cases,result)
            for (const [key,node] of countNodes) node.textContent = String(counts[key])
            const executed = counts.total - counts.idle
            progressText.textContent = executed + " / " + counts.total + tr(" exécutés"," run")
            progress.setAttribute("aria-valuemin","0")
            progress.setAttribute("aria-valuemax",String(Math.max(1,counts.total)))
            progress.setAttribute("aria-valuenow",String(executed))
            for (const key of ["pass","fail","error","idle"] as const) {
                const segment = segments.get(key)!
                segment.style.flexGrow = String(counts[key])
                segment.hidden = counts[key] === 0
            }
            let visible = 0
            for (const [id,node] of resultElements) {
                const r = result[id]
                const status = r?.status ?? "idle"
                const show = filter.value === "all" || filter.value === status || (filter.value === "problems" && (status === "fail" || status === "error"))
                const card = cards.get(id)
                if (card) card.hidden = !show
                if (show) visible++
                node.textContent = !r ? tr("Non exécuté","Not run") : r.status === "pass" ? tr("Réussi","Passed") : r.status === "fail" ? tr("Échec · obtenu ","Failed · actual ") + outs.map(p => r.actual?.[p.id] ?? "—").join(" / ") : tr("Erreur","Error") + (r.message ? " · " + r.message : "")
                node.dataset.result = status
            }
            emptyFilter.hidden = visible > 0 || draft.cases.length === 0
        }
        for (const test of draft.cases) {
            const card = element("section","component-test-case")
            cards.set(test.id,card)
            const head = element("div","component-testing-toolbar")
            const name = element("input")
            name.value = test.name
            name.setAttribute("aria-label",tr("Nom du test","Test name"))
            name.addEventListener("input", () => { test.name = name.value })
            const state = element("span","component-test-result")
            resultElements.set(test.id,state)
            const remove = button(tr("Supprimer","Delete"), () => { if (running) return; draft.cases = draft.cases.filter(c => c.id !== test.id); if (draft.results) delete draft.results.cases[test.id]; render() })
            head.append(name,state,remove)
            const fields = element("div","component-test-fields")
            for (const [title,ps,record] of [[tr("Entrées","Inputs"),ins,test.inputs],[tr("Sorties attendues","Expected outputs"),outs,test.expected]] as const) {
                const group = element("div")
                group.append(element("h3","",title))
                for (const p of ps) {
                    const label = element("label")
                    label.append(element("span","",p.name + " · " + p.bits + " bit(s)"))
                    const input = element("input")
                    input.value = record[p.id] ?? ""
                    input.maxLength = p.bits
                    input.pattern = "[01]{" + p.bits + "}"
                    input.addEventListener("input", () => { record[p.id] = input.value; delete result[test.id]; if (draft.results) delete draft.results.cases[test.id]; updateResults() })
                    label.append(input)
                    group.append(label)
                }
                fields.append(group)
            }
            card.append(head,fields)
            list.append(card)
        }
        if (!draft.cases.length) list.append(element("p","",tr("Aucun test de développement. Ajoutez votre premier cas.","No development tests. Add your first case.")))
        list.append(emptyFilter)
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
        description.placeholder = tr("Décrivez le rôle du composant, ses entrées et ses sorties…","Describe the component, its inputs and outputs…")
        description.value = draft.description
        description.addEventListener("input", () => { draft.description = description.value })
        const label = element("label","component-test-description")
        label.append(element("span","",tr("Description personnalisée","Custom description")),description)
        body.append(label)
        for (const [key,text] of [["showDescription",tr("Afficher la description au survol","Show description on hover")],["showTruth",tr("Afficher la table de vérité au survol","Show truth table on hover")]] as const) {
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
