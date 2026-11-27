import * as t from "io-ts"
import JSON5 from "json5"
import { LogicEditor } from "./LogicEditor"
import { Serialization, type Library } from "./Serialization"
import { CurrentFormatVersion } from "./DataMigration"
import { TestCaseCombinational, TestCaseCombinationalRepr } from "./TestSuite"
import { ALU, ALUDef } from "./components/ALU"
import { Add3IfGeq5, Add3IfGeq5Def } from "./components/Add3IfGeq5"
import { Adder, AdderDef } from "./components/Adder"
import { AdderArray, AdderArrayDef } from "./components/AdderArray"
import { Bypass, BypassDef } from "./components/Bypass"
import { BusConverter, BusConverterDef } from "./components/BusConverter"
import { Clock, ClockDef } from "./components/Clock"
import { Comparator, ComparatorDef } from "./components/Comparator"
import { Component, ComponentBase, ComponentRepr } from "./components/Component"
import { ControlledInverter, ControlledInverterDef } from "./components/ControlledInverter"
import { Counter, CounterDef } from "./components/Counter"
import { CustomComponent, CustomComponentDef, CustomComponentDefRepr, CustomComponentPrefix } from "./components/CustomComponent"
import { Decoder, DecoderDef } from "./components/Decoder"
import { Decoder16Seg, Decoder16SegDef } from "./components/Decoder16Seg"
import { Decoder7Seg, Decoder7SegDef } from "./components/Decoder7Seg"
import { DecoderBCD, DecoderBCDDef } from "./components/DecoderBCD"
import { Demux, DemuxDef } from "./components/Demux"
import { Display, DisplayDef } from "./components/Display"
import { Display16Seg, Display16SegDef } from "./components/Display16Seg"
import { Display7Seg, Display7SegDef } from "./components/Display7Seg"
import { DisplayAscii, DisplayAsciiDef } from "./components/DisplayAscii"
import { DisplayBar, DisplayBarDef } from "./components/DisplayBar"
import { DrawableParent, MenuData } from "./components/Drawable"
import { FlipflopD, FlipflopDDef, FlipflopDWithEnable, FlipflopDWithEnableDef } from "./components/FlipflopD"
import { FlipflopJK, FlipflopJKDef } from "./components/FlipflopJK"
import { FlipflopT, FlipflopTDef } from "./components/FlipflopT"
import { Gate1, Gate1Def, GateN, GateNDef } from "./components/Gate"
import { GateArray, GateArrayDef } from "./components/GateArray"
import { Gate1Types, GateNTypes } from "./components/GateTypes"
import { HalfAdder, HalfAdderDef } from "./components/HalfAdder"
import { IncDec, IncDecDef } from "./components/IncDec"
import { Input, InputDef } from "./components/Input"
import { Label, LabelDef } from "./components/Label"
import { LatchD, LatchDDef } from "./components/LatchD"
import { LatchSR, LatchSRDef, LatchSRWithEnable, LatchSRWithEnableDef } from "./components/LatchSR"
import { Mux, MuxDef } from "./components/Mux"
import { Output, OutputDef } from "./components/Output"
import { Passthrough, PassthroughDef } from "./components/Passthrough"
import { Pixel, PixelDef } from "./components/Pixel"
import { RAM, RAMDef } from "./components/RAM"
import { ROM, ROMDef } from "./components/ROM"
import { Random, RandomDef } from "./components/Random"
import { Rectangle, RectangleDef } from "./components/Rectangle"
import { Register, RegisterDef } from "./components/Register"
import { ShiftDisplay, ShiftDisplayDef } from "./components/ShiftDisplay"
import { ShiftRegister, ShiftRegisterDef } from "./components/ShiftRegister"
import { TrafficLights, TrafficLightsDef } from "./components/TrafficLights"
import { TristateBuffer, TristateBufferDef } from "./components/TristateBuffer"
import { TristateBufferArray, TristateBufferArrayDef } from "./components/TristateBufferArray"
import { S } from "./strings"
import { binaryStringRepr, isArray, isRecord, isString, validateJson, valuesReprForTest } from "./utils"


export type ComponentForDef<TDef> = Component & (
    TDef extends typeof ALUDef ? ALU :
    TDef extends typeof AdderDef ? Adder :
    TDef extends typeof Add3IfGeq5Def ? Add3IfGeq5 :
    TDef extends typeof AdderArrayDef ? AdderArray :
    TDef extends typeof BypassDef ? Bypass :
    TDef extends typeof BusConverterDef ? BusConverter :
    TDef extends typeof ClockDef ? Clock :
    TDef extends typeof ComparatorDef ? Comparator :
    TDef extends typeof ControlledInverterDef ? ControlledInverter :
    TDef extends typeof CounterDef ? Counter :
    TDef extends typeof Decoder16SegDef ? Decoder16Seg :
    TDef extends typeof Decoder7SegDef ? Decoder7Seg :
    TDef extends typeof DecoderDef ? Decoder :
    TDef extends typeof DecoderBCDDef ? DecoderBCD :
    TDef extends typeof DemuxDef ? Demux :
    TDef extends typeof DisplayDef ? Display :
    TDef extends typeof Display16SegDef ? Display16Seg :
    TDef extends typeof Display7SegDef ? Display7Seg :
    TDef extends typeof DisplayAsciiDef ? DisplayAscii :
    TDef extends typeof DisplayBarDef ? DisplayBar :
    TDef extends typeof FlipflopDDef ? FlipflopD :
    TDef extends typeof FlipflopDWithEnableDef ? FlipflopDWithEnable :
    TDef extends typeof FlipflopJKDef ? FlipflopJK :
    TDef extends typeof FlipflopTDef ? FlipflopT :
    TDef extends typeof Gate1Def ? Gate1 :
    TDef extends typeof GateNDef ? GateN :
    TDef extends typeof GateArrayDef ? GateArray :
    TDef extends typeof HalfAdderDef ? HalfAdder :
    TDef extends typeof IncDecDef ? IncDec :
    TDef extends typeof InputDef ? Input :
    TDef extends typeof LabelDef ? Label :
    TDef extends typeof LatchDDef ? LatchD :
    TDef extends typeof LatchSRDef ? LatchSR :
    TDef extends typeof LatchSRWithEnableDef ? LatchSRWithEnable :
    TDef extends typeof MuxDef ? Mux :
    TDef extends typeof OutputDef ? Output :
    TDef extends typeof PassthroughDef ? Passthrough :
    TDef extends typeof PixelDef ? Pixel :
    TDef extends typeof RAMDef ? RAM :
    TDef extends typeof ROMDef ? ROM :
    TDef extends typeof RandomDef ? Random :
    TDef extends typeof RectangleDef ? Rectangle :
    TDef extends typeof RegisterDef ? Register :
    TDef extends typeof ShiftDisplayDef ? ShiftDisplay :
    TDef extends typeof ShiftRegisterDef ? ShiftRegister :
    TDef extends typeof TrafficLightsDef ? TrafficLights :
    TDef extends typeof TristateBufferDef ? TristateBuffer :
    TDef extends typeof TristateBufferArrayDef ? TristateBufferArray :
    Component
)


// Generic interface to instantiate components from scratch (possibly with params) or from JSON
type ComponentMaker<TParams extends Record<string, unknown>> = {
    isValid(): boolean,
    type: string,
    make(parent: DrawableParent, params?: TParams): Component,
    makeFromJSON(parent: DrawableParent, data: Record<string, unknown>): Component | undefined,
}

// All predefined components except the ones which don't have
// static type strings: Gate1, GateN, GateArray, CustomComponent
const AllComponentDefs: ComponentMaker<any>[] = [
    // in
    InputDef,
    ClockDef,
    RandomDef,

    // out
    OutputDef,
    DisplayDef,
    Display7SegDef,
    Display16SegDef,
    DisplayAsciiDef,
    DisplayBarDef,
    PixelDef,
    TrafficLightsDef,
    ShiftDisplayDef,

    // gates
    Gate1Def,
    GateNDef,
    GateArrayDef,
    TristateBufferDef,
    TristateBufferArrayDef,
    ControlledInverterDef,

    // labels & layout
    LabelDef,
    RectangleDef,
    PassthroughDef,
    BusConverterDef,

    // arithmetic
    HalfAdderDef,
    AdderDef,
    ComparatorDef,
    AdderArrayDef,
    Add3IfGeq5Def,
    IncDecDef,
    ALUDef,

    // combinational
    MuxDef,
    DemuxDef,
    BypassDef,
    DecoderDef,
    Decoder7SegDef,
    Decoder16SegDef,
    DecoderBCDDef,

    // memory
    LatchSRDef,
    LatchSRWithEnableDef,
    LatchDDef,
    FlipflopJKDef,
    FlipflopTDef,
    FlipflopDDef,
    FlipflopDWithEnableDef,
    RegisterDef,
    ShiftRegisterDef,
    ROMDef,
    RAMDef,
    CounterDef,
]

// Data present in the HTMLElement of a component button
export type ButtonDataset = {
    type: string,
    componentId?: string,
    params?: string,
}

export class ComponentFactory {

    public readonly editor: LogicEditor
    private readonly _predefinedComponents = new Map<string, ComponentMaker<any>>()
    private readonly _customComponents = new Map<string, CustomComponentDef>()

    public constructor(editor: LogicEditor) {
        this.editor = editor
        for (const maker of AllComponentDefs) {
            const key = maker.type
            if (!maker.isValid()) {
                throw new Error(`Implementation missing for components of type '${key}'`)
            }
            // console.log(`Registering component for '${key}'`)
            if (this._predefinedComponents.has(key)) {
                throw new Error(`Duplicate component for components of type '${key}'`)
            }
            this._predefinedComponents.set(key, maker)
        }
    }


    // Component creation functions

    public makeFromJSON(parent: DrawableParent, obj_: unknown, offsetPos?: [number, number]): Component | undefined {
        if (!isRecord(obj_)) {
            console.warn(`Skipping invalid non-object component: ${JSON5.stringify(obj_, null, 2)}`)
            return undefined
        }
        const obj = obj_ as Partial<ComponentRepr<boolean, boolean>>
        if (offsetPos !== undefined) {
            if (isArray(obj.pos)) {
                obj.pos = [obj.pos[0] + offsetPos[0], obj.pos[1] + offsetPos[1]]
            }
        }
        const type = isString(obj.type) ? obj.type : "<unknown>"
        const maker = this.getMaker(type)
        return maker?.makeFromJSON(parent, obj)
    }

    public makeFromButton(parent: DrawableParent, elem: HTMLElement) {
        const compDataset = elem.dataset as ButtonDataset
        const paramsStr = compDataset.params
        const maker = this.getMaker(compDataset.type)
        const params = paramsStr === undefined ? undefined : JSON5.parse(paramsStr) as Record<string, unknown>
        return maker?.make(parent, params)

        // TODO further general component customisation based on editor options
        // const classId = compDataset.componentId
        // if (classId === undefined) {
        //     console.warn("No class ID linked to elem " + elem.outerHTML)
        // } else {
        //     const compConfig = editor.options.initParams?.[classId]
        //     if (compConfig !== undefined) {
        //         let val
        //         if ((val = compConfig.orient) !== undefined) {
        //             newComp.doSetOrient(val)
        //         }
        //     }

    }

    private getMaker(type: string): ComponentMaker<any> | undefined {
        let maker
        // normal cases
        if ((maker = this._predefinedComponents.get(type)) !== undefined) {
            return maker
        }

        // gates
        if (Gate1Types.includes(type)) {
            return Gate1Def
        } else if (GateNTypes.includes(type)) {
            return GateNDef
        }

        const hyphenPos = type.indexOf("-")
        if (hyphenPos !== -1) {

            // gate arrays
            const typeStart = type.substring(0, hyphenPos)
            const typeEnd = type.substring(hyphenPos + 1)
            if (typeEnd === "array" && GateNTypes.includes(typeStart)) {
                return GateArrayDef
            }

            // custom components
            if (type.startsWith(CustomComponentPrefix)) {
                const customId = type.substring(CustomComponentPrefix.length)
                if ((maker = this._customComponents.get(customId)) !== undefined) {
                    return maker
                }
            }
        }

        console.warn(`Unknown component for '${type}'`)
        return undefined
    }


    // Custom components handling

    public getCustomDef(customId: string): CustomComponentDef | undefined {
        return this._customComponents.get(customId)
    }

    public customDefs(): CustomComponentDef[] | undefined {
        if (this._customComponents.size === 0) {
            return undefined
        }
        return [...this._customComponents.values()]
    }

    public customDefReprs(): CustomComponentDefRepr[] | undefined {
        const defs = this.customDefs()
        if (defs === undefined) {
            return undefined
        }
        return defs.map(def => def.toJSON())
    }

    public clearCustomDefs() {
        this._customComponents.clear()
    }

    public getCustomComponentTypesWhichUse(id: string) {
        const compIds: string[] = [id]
        for (const def of this._customComponents.values()) {
            if (def.uses(id, [true, this])) {
                compIds.push(def.type)
            }
        }
        return compIds
    }

    public tryAddCustomDef(def: CustomComponentDef, overwrite: boolean): ComponentMaker<any> | undefined {
        // Calling this may change the list of custom defs, we may need to update the UI
        const customid = def.customId
        if (!overwrite && this._customComponents.has(customid)) {
            console.warn(`Could not add custom component with duplicate id '${customid}'`)
            return undefined
        }
        this._customComponents.set(customid, def)
        return def
    }

    public tryLoadCustomDefsFrom(defs: unknown): number {
        // Calling this may change the list of custom defs, we may need to update the UI
        if (defs === undefined) {
            return 0
        }
        const validatedDefs = validateJson(defs, t.array(CustomComponentDefRepr), "defs")
        if (validatedDefs === undefined) {
            return 0
        }
        let numLoaded = 0
        for (const validatedDef of validatedDefs) {
            const maker = this.tryAddCustomDef(new CustomComponentDef(validatedDef), false)
            if (maker !== undefined) {
                numLoaded++
            }
        }
        return numLoaded
    }

    /** Export a self-contained snapshot, including nested custom definitions. */
    public exportComponentBundle(ids: readonly string[]): Library {
        const defs: CustomComponentDefRepr[] = []
        const done = new Set<string>(), visiting = new Set<string>()
        const visit = (id: string) => {
            if (visiting.has(id)) throw new Error("Dépendance circulaire : " + id)
            if (done.has(id)) return
            const def = this.getCustomDef(id)
            if (!def) throw new Error("Composant manquant : " + id)
            visiting.add(id)
            for (const repr of Object.values(def.circuit.components ?? {})) {
                if (typeof repr.type === "string" && repr.type.startsWith(CustomComponentPrefix)) visit(repr.type.slice(CustomComponentPrefix.length))
            }
            visiting.delete(id)
            done.add(id)
            defs.push(structuredClone(def.toJSON()))
        }
        for (const id of ids) visit(id)
        if (!defs.length) throw new Error("Aucun composant à exporter.")
        return { v: CurrentFormatVersion, type: "lib", defs }
    }

    /** Validate the whole bundle before adding anything; never replace a live definition. */
    public importComponentBundle(data: unknown): number {
        if (!data || typeof data !== "object" || !("type" in data) || data.type !== "lib" || !("v" in data) || data.v !== CurrentFormatVersion || !("defs" in data)) throw new Error("Fichier de composants incompatible : bibliothèque v" + CurrentFormatVersion + " requise.")
        const decoded = t.array(CustomComponentDefRepr).decode(data.defs)
        if (decoded._tag !== "Right" || !decoded.right.length || decoded.right.length > 200) throw new Error("Définitions invalides ou bibliothèque trop grande.")
        const incoming = new Map<string, CustomComponentDefRepr>()
        for (const def of decoded.right) {
            if (!def.id || incoming.has(def.id) || ["__proto__","constructor","prototype"].includes(def.id)) throw new Error("Identifiant invalide ou dupliqué : " + def.id)
            incoming.set(def.id, def)
        }
        function stable(value: unknown): string {
            if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]"
            if (value && typeof value === "object") {
                const rec = value as Record<string, unknown>
                return "{" + Object.keys(rec).filter(k => k !== "ref" && rec[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + stable(rec[k])).join(",") + "}"
            }
            return JSON.stringify(value) ?? "null"
        }
        const visiting = new Set<string>(), done = new Set<string>()
        const ordered: CustomComponentDefRepr[] = []
        const visit = (id: string) => {
            if (visiting.has(id)) throw new Error("Dépendance circulaire : " + id)
            if (done.has(id)) return
            const def = incoming.get(id)
            if (!def) {
                if (!this.getCustomDef(id)) throw new Error("Dépendance absente : " + id)
                return
            }
            visiting.add(id)
            for (const repr of Object.values(def.circuit.components ?? {})) {
                if (typeof repr.type === "string" && repr.type.startsWith(CustomComponentPrefix)) visit(repr.type.slice(CustomComponentPrefix.length))
            }
            visiting.delete(id)
            done.add(id)
            const existing = this.getCustomDef(id)
            const normalized = new CustomComponentDef(structuredClone(def))
            if (existing && stable(existing.toJSON()) !== stable(normalized.toJSON())) throw new Error("Conflit : « " + def.caption + " » existe déjà avec une autre définition. Renommez le composant existant ou importez dans un autre projet.")
            if (!existing) ordered.push(def)
        }
        for (const id of incoming.keys()) visit(id)
        const prepared = ordered.map(def => new CustomComponentDef(structuredClone(def)))
        for (const def of prepared) this.tryAddCustomDef(def,false)
        if (prepared.length) {
            this.editor.updateCustomComponentButtons()
            this.editor.setDirty("imported component library")
            this.editor.editTools.undoMgr.takeSnapshot()
        }
        return prepared.length
    }

    public hasCustomComponents() {
        return this._customComponents.size > 0
    }

    public makeContextMenu(id: string): MenuData | undefined {
        const customId = id.substring(CustomComponentPrefix.length)
        const def = this._customComponents.get(customId)
        if (def === undefined) {
            return undefined
        }

        const s = S.Components.Custom.contextMenu
        return [
            MenuData.item("pen", s.ChangeName, () => this.runChangeCustomComponentCaptionDialog(def)),
            MenuData.item("connect", s.ChangeCircuit, () => {
                void this.editor.appAlert(s.EditFromComponentMessage)
            }),
            MenuData.sep(),
            MenuData.item("trash", s.Delete, async () => {
                if (this.editor.components.contains(id)) {
                    void this.editor.appAlert(s.CannotDeleteInUse)
                    return
                }
                for (const compDef of this._customComponents.values()) {
                    if (compDef.uses(def.type, false)) {
                        void this.editor.appAlert(s.CannotDeleteInUseBy.expand({ caption: compDef.caption }))
                        return
                    }
                }
                if (await this.editor.appConfirm(s.ConfirmDelete, true, "Supprimer")) {
                    this._customComponents.delete(customId)
                    this.editor.updateCustomComponentButtons()
                }
            }, { color: "danger" }),
        ]
    }

    public async runChangeCustomComponentCaptionDialog(def: CustomComponentDef) {
        const s = S.Components.Custom.contextMenu
        const oldCaption = def.caption
        const oldType = def.type
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const newCaption = await this.editor.appPrompt(s.ChangeNamePrompt, oldCaption)
            if (newCaption === null || newCaption === oldCaption) {
                return
            }
            if (newCaption.length === 0) {
                await this.editor.appAlert(s.ChangeNameEmpty)
                continue
            }

            def.doSetCaption(newCaption)
            const oldDefaultCustomId = makeCustomIdFromCaption(oldCaption)
            if (def.customId === oldDefaultCustomId) {
                // The ID was automatically generated from the caption, so we'll try to update it as well
                const newCustomId = makeCustomIdFromCaption(newCaption)
                if (!this._customComponents.has(newCustomId)) {
                    // we can actually change it without conflicts
                    this._customComponents.delete(oldDefaultCustomId)
                    def.customId = newCustomId
                    const newType = def.type

                    // update the type in all custom conponent definitions
                    for (const compDef of this._customComponents.values()) {
                        for (const compRepr of Object.values(compDef.circuit.components ?? {})) {
                            if (compRepr.type === oldType) {
                                compRepr.type = newType
                            }
                        }
                    }
                    this._customComponents.set(newCustomId, def)
                }
            }
            break
        }

        this.editor.updateCustomComponentButtons()
        this.editor.components.updateCustomComponents(oldType) // they still have the old type
        this.editor.focus()
    }

    public async tryMakeNewCustomComponent(editor: LogicEditor): Promise<CustomComponentDef | string> {
        const s = S.Components.Custom.messages

        const selectionAll = editor.eventMgr.currentSelection?.previouslySelectedElements
        if (selectionAll === undefined) {
            return s.EmptySelection
        }
        const selectedComps = [...selectionAll].filter((e): e is Component => e instanceof ComponentBase)
        if (selectedComps.length === 0) {
            return s.EmptySelection
        }

        const checkResult = this.checkComponentsForCustomDef(selectedComps)
        if (isString(checkResult)) {
            return checkResult
        }

        const componentsToInclude = checkResult.components

        let caption
        const labels = componentsToInclude.filter((e): e is Label => e instanceof Label)
        if (labels.length !== 1) {
            caption = await editor.appPrompt(s.EnterCaptionPrompt)
            if (caption === null) {
                return ""
            }
        } else {
            caption = labels[0].text
        }

        const id = makeCustomIdFromCaption(caption)
        if (this._customComponents.has(id)) {
            return s.ComponentAlreadyExists.expand({ id })
        }

        const { components, wires } = Serialization.buildComponentsAndWireObject(componentsToInclude, [], undefined)
        if (components === undefined || wires === undefined) {
            return s.NoWires
        }

        const customDef = new CustomComponentDef({
            id, caption, circuit: { components, wires },
        })
        const maker = this.tryAddCustomDef(customDef, false)
        if (maker === undefined) {
            return ""
        }

        const customComp = maker.make(editor)
        customComp.setSpawned()
        customComp.setPosition(editor.pointerX + customComp.unrotatedWidth / 2 - 5, editor.pointerY, true)
        editor.eventMgr.currentSelection = undefined
        editor.eventMgr.setCurrentComponentUnderPointer(customComp)

        for (const comp of componentsToInclude) {
            editor.components.tryDelete(comp)
        }

        return customDef
    }

    public async tryMakeNewTestCase(editor: LogicEditor): Promise<TestCaseCombinational | string> {

        const checkResult = this.checkSelectionForTestCase(editor)
        if (isString(checkResult)) {
            return checkResult
        }

        const { inputs, outputs } = checkResult

        const test = this.makeTestCaseWithCurrentValues(editor, inputs, outputs)
        const name = await editor.appPrompt(S.Messages.NewTestCaseSetName, test.name ?? "")
        if (name === null) return ""
        test.name = name.length === 0 ? undefined : name
        return test
    }

    private makeTestCaseWithCurrentValues(editor: LogicEditor, inputs: Input[], outputs: Output[]): TestCaseCombinational {

        const testCaseName = inputs.map(input => binaryStringRepr(input.value)).join(" ") + " → " + outputs.map(output => binaryStringRepr(output.value)).join(" ")

        const inMap: TestCaseCombinationalRepr["in"] = Object.create(null)
        for (const input of inputs) {
            inMap[input.ref ?? "?"] = valuesReprForTest(input.value)
        }

        const outMap: TestCaseCombinationalRepr["out"] = Object.create(null)
        for (const output of outputs) {
            outMap[output.ref ?? "?"] = valuesReprForTest(output.value)
        }

        return new TestCaseCombinational({
            in: inMap, out: outMap,
            name: testCaseName.length === 0 ? undefined : testCaseName,
        }, editor.components)
    }

    public async tryMakeAllTestCases(editor: LogicEditor): Promise<TestCaseCombinational[] | string> {
        const checkResult = this.checkSelectionForTestCase(editor)
        if (isString(checkResult)) {
            return checkResult
        }

        const { inputs, outputs } = checkResult

        const s = S.Messages
        const max = 10

        const inputsByBit: Array<[Input, number]> = []
        let numInputs = 0
        // get bit of last input first
        for (let i = inputs.length - 1; i >= 0; i--) {
            const input = inputs[i]
            for (let j = 0; j < input.numBits; j++) {
                inputsByBit.push([input, j])
            }
            numInputs += input.numBits
        }

        const setBit = (i: number, value: boolean) => {
            const [input, bit] = inputsByBit[i]
            const newValues = input.value.slice()
            newValues[bit] = value
            input.setValue(newValues)
        }

        if (numInputs > max) {
            return s.TooManyInputsForAutoTestCases.expand({ max })
        }

        const numCases = Math.pow(2, numInputs)
        if (!await editor.appConfirm(s.AutoTestCasesWarning.expand({ numInputs, numCases }))) {
            return ""
        }

        const result = await editor.disableUIWhile(s.ComputingTestCases, false, async restoreAfter => {
            for (const input of inputs) {
                restoreAfter.set(input, input.value)
            }

            const testCases: TestCaseCombinational[] = []
            for (let i = 0; i < numCases; i++) {
                for (let j = 0; j < numInputs; j++) {
                    const value = (i & (1 << j)) !== 0
                    setBit(j, value)
                }
                editor.recalcPropagateAndDrawIfNeeded(true)
                await editor.waitForPropagation()
                testCases.push(this.makeTestCaseWithCurrentValues(editor, inputs, outputs))
            }

            return testCases
        })

        return result ?? ""
    }

    public buildCustomTestingCircuit(root: CustomComponent) {
        const checked = this.checkComponentsForCustomDef([...root.components.all()], false)
        if (isString(checked)) throw new Error(checked)
        return Serialization.buildComponentsAndWireObject(checked.components, [], undefined)
    }

    public async tryModifyCustomComponent(def: CustomComponentDef, defRoot: CustomComponent): Promise<undefined | string> {
        const s = S.Components.Custom.messages
        const components = [...defRoot.components.all()]

        const checkResult = this.checkComponentsForCustomDef(components)
        if (isString(checkResult)) {
            return checkResult
        }

        const newComponents = checkResult.components

        const circuit = Serialization.buildComponentsAndWireObject(newComponents, [], undefined)
        if (circuit.components === undefined || circuit.wires === undefined) {
            return ""
        }

        const newDef = new CustomComponentDef({
            id: def.customId,
            caption: def.caption,
            circuit: { components: circuit.components, wires: circuit.wires },
            ...(defRoot.draftPinLayout === undefined ? {} : { pinLayout: defRoot.draftPinLayout.filter(pin => Object.prototype.hasOwnProperty.call(circuit.components, pin.id)) }),
            documentation: structuredClone(defRoot.draftDocumentation),
        })

        if (newDef.numInputs !== def.numInputs || newDef.numOutputs !== def.numOutputs) {
            if (!await this.editor.appConfirm(s.InputsOutputsChanged, true)) {
                return "" // cancelled
            }
        }

        this.tryAddCustomDef(newDef, true)
        return undefined // success
    }

    private checkComponentsForCustomDef(components: Component[], assignNames = true): { components: Component[], inputs: Input[], outputs: Output[] } | string {
        const s = S.Components.Custom.messages

        const inputs = components.filter((e): e is Input => e instanceof Input)
        if (inputs.length === 0) {
            return s.NoInput
        }

        const outputs = components.filter((e): e is Output => e instanceof Output)
        if (outputs.length === 0) {
            return s.NoOutput
        }


        // Check that all inputs and outputs have names
        function checkNames(inOuts: Array<Input | Output>): boolean {
            const names = new Set<string>()
            const missingNames: Array<Input | Output> = []
            for (const inOut of inOuts) {
                const name = inOut.name
                if (name === undefined) {
                    missingNames.push(inOut)
                } else {
                    if (!isString(name) || names.has(name)) {
                        return false
                    }
                    names.add(name)
                }
            }
            if (!assignNames && missingNames.length > 0) return false
            for (const inOut of missingNames) {
                const prefix = inOut instanceof Input ? "In" : "Out"
                let i = 0, name
                do {
                    name = `${prefix}${i++}`
                } while (names.has(name))
                inOut.doSetName(name)
                names.add(name)
            }
            return true
        }

        const namesValid = checkNames(inputs) && checkNames(outputs)
        if (!namesValid) {
            return s.InputsOutputsMustHaveNames
        }


        const componentsToInclude: Component[] = [...inputs, ...outputs]
        const queue: Component[] = []
        let comp

        // Go forward from inputs to keep all linked components.
        // We don't complain about linked components that are not in the selection
        // as we allow inputs to connect to other stuff as well.
        queue.push(...inputs)
        while ((comp = queue.shift()) !== undefined) {
            for (const node of comp.outputs._all) {
                for (const wire of node.outgoingWires) {
                    const otherComp = wire.endNode.component
                    if (components.includes(otherComp)
                        && !componentsToInclude.includes(otherComp)) {
                        componentsToInclude.push(otherComp)
                        queue.push(otherComp)
                    }
                }
            }
        }

        // Go backward from outputs to include all linked components
        // and make sure all necessary components are in the selection.
        queue.push(...outputs)
        const missingComponents: Component[] = []
        while ((comp = queue.shift()) !== undefined) {
            for (const node of comp.inputs._all) {
                const wire = node.incomingWire
                if (wire !== null) {
                    const otherComp = wire.startNode.component

                    if (!components.includes(otherComp)) {
                        // this component is missing from the selection
                        if (!missingComponents.includes(otherComp)) {
                            missingComponents.push(otherComp)
                        }
                    } else {
                        if (!componentsToInclude.includes(otherComp)) {
                            componentsToInclude.push(otherComp)
                            queue.push(otherComp)
                        }
                    }
                }
            }
        }

        if (missingComponents.length > 0) {
            const missingCompsStr = missingComponents.map(c => c.toString()).join(", ")
            return s.MissingComponents.expand({ list: missingCompsStr })
        }

        const uselessComponents = components.filter(c =>
            !componentsToInclude.includes(c)
            // allow disconnected comps that have no inputs or outputs, e.g. labels
            && (c.inputs._all.length !== 0 || c.outputs._all.length !== 0)
        )
        if (uselessComponents.length > 0) {
            const uselessCompsStr = uselessComponents.map(c => c.toString()).join(", ")
            return s.UselessComponents.expand({ list: uselessCompsStr })
        }

        if (componentsToInclude.some(c => c instanceof Clock)) {
            return s.CannotIncludeClock
        }

        return { components: componentsToInclude, inputs, outputs }
    }

    private checkSelectionForTestCase(editor: LogicEditor): { inputs: Input[], outputs: Output[] } | string {
        const s = S.Components.Custom.messages

        const selectionAll = editor.eventMgr.currentSelection?.previouslySelectedElements
        if (selectionAll === undefined) {
            return s.EmptySelection
        }
        const components = [...selectionAll].filter((e): e is Component => e instanceof ComponentBase)
        if (components.length === 0) {
            return s.EmptySelection
        }

        const inputs = components.filter((e): e is Input => e instanceof Input)
        if (inputs.length === 0) {
            return s.NoInput
        }

        const outputs = components.filter((e): e is Output => e instanceof Output)
        if (outputs.length === 0) {
            return s.NoOutput
        }

        const getSortName = (inOut: Input | Output): string => {
            if (isString(inOut.name)) {
                return inOut.name
            }
            return ""
        }

        inputs.sort((a, b) => getSortName(a).localeCompare(getSortName(b)))
        outputs.sort((a, b) => getSortName(a).localeCompare(getSortName(b)))

        return { inputs, outputs }
    }

}


function makeCustomIdFromCaption(caption: string): string {
    return caption
        .trim()
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
}