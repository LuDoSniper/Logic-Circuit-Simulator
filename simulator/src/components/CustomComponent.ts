import * as t from "io-ts"
import { ComponentDocumentation, circuitSignature, defaultDocumentation } from "../CustomComponentTesting"
import { ExternalPinLayout } from "../ExternalPinLayout"
import { ComponentFactory } from "../ComponentFactory"
import { ComponentList } from "../ComponentList"
import { LogicEditor } from "../LogicEditor"
import { NodeManager } from "../NodeManager"
import { RecalcManager } from "../RedrawRecalcManager"
import { SVGRenderingContext } from "../SVGRenderingContext"
import { Serialization } from "../Serialization"
import { TestSuites } from "../TestSuite"
import { UIPermissions } from "../UIPermissions"
import { COLOR_COMPONENT_BORDER, TextVAlign, fillTextVAlign } from "../drawutils"
import { b, div, mods, span, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, InteractionResult, LogicValue, Orientation, Orientations, ParentType, isArray, isString, typeOrUndefined, validateJson } from "../utils"
import { Component, ComponentBase, ComponentRepr, InjectedParams, NodeDesc, NodeGroupDesc, NodeInDesc, NodeOutDesc, NodeRec, defineComponent, groupHorizontal, groupVertical } from "./Component"
import { DrawContext, DrawableParent, EditTools, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import { Input, InputRepr } from "./Input"
import { Output, OutputRepr } from "./Output"
import { LinkManager, Wire } from "./Wire"

type CustomComponentNodeSpec = {
    isIn: boolean,
    id: string,
    name: string,
    orient: Orientation,
    numBits: number,
    bus?: boolean,
    sourcePos: [number, number],
    sourceRepr: Record<string, unknown>,
}

// How custom components are identied in their type
export const CustomComponentPrefix = "custom-"
export const CustomComponentImageWidth = 50
export const CustomComponentImageHeight = 34

// How custom component definitions are stored in JSON


export const CustomComponentDefRepr = t.intersection([t.type({
    id: t.string,
    caption: t.string,
    circuit: t.type({
        components: typeOrUndefined(t.record(t.string, t.record(t.string, t.unknown))),
        wires: typeOrUndefined(t.array(Wire.Repr)),
    }),
}), t.partial({ pinLayout: ExternalPinLayout, documentation: ComponentDocumentation })])

export type CustomComponentDefRepr = t.TypeOf<typeof CustomComponentDefRepr>
type CircuitRepr = CustomComponentDefRepr["circuit"]


export class CustomComponentDef {

    public customId: string
    public readonly circuit: CircuitRepr
    public readonly insOuts: CustomComponentNodeSpec[]
    public readonly pinLayout: ExternalPinLayout | undefined
    public readonly documentation: ComponentDocumentation
    public readonly numInputs: number
    public readonly numOutputs: number
    private readonly numBySide: Record<Orientation, number> = { n: 0, e: 0, s: 0, w: 0 }
    private _caption: string
    public gridWidth!: number
    public gridHeight!: number

    public toJSON(): CustomComponentDefRepr {
        return {
            id: this.customId,
            caption: this._caption,
            circuit: this.circuit,
            ...(this.pinLayout === undefined ? {} : { pinLayout: this.pinLayout }),
            documentation: this.documentation,
        }
    }

    public get id() {
        return CustomComponentPrefix + this.customId
    }

    public get caption() {
        return this._caption
    }

    public doSetCaption(caption: string) {
        this._caption = caption
        this.recalcSize()
    }

    public constructor(data: CustomComponentDefRepr) {
        this.customId = data.id
        this._caption = data.caption
        this.circuit = data.circuit
        this.pinLayout = data.pinLayout
        this.documentation = data.documentation ?? defaultDocumentation()

        this.insOuts = []
        let totalIn = 0
        let totalOut = 0
        const components = this.circuit.components ?? {}
        for (const [id, repr_] of Object.entries(components)) {
            const repr = repr_ as ComponentRepr<true, true>
            const isIn = repr.type === "in" && !((repr as InputRepr).isConstant ?? false)
            const isOut = repr.type === "out" && (repr as OutputRepr).isInternal !== true
            if (isIn || isOut) {
                const inOutRepr = repr as InputRepr | OutputRepr
                const name = isString(inOutRepr.name) ? inOutRepr.name : (isIn ? "In" : "Out")
                let orient = Orientations.includes(inOutRepr.orient) ? inOutRepr.orient : Orientation.default
                orient = isIn ? Orientation.invert(orient) : orient
                const numBits = Number(inOutRepr.bits ?? 1)
                const sourcePos = (isArray(inOutRepr.pos) && inOutRepr.pos.length === 2 ? inOutRepr.pos.map(Number) : [0, 0]) as [number, number]
                this.insOuts.push({ isIn, id, name, orient, numBits, sourcePos, sourceRepr: inOutRepr })
                delete components[id] // add them back after 2D sorting
                if (isIn) {
                    totalIn += numBits
                } else {
                    totalOut += numBits
                }
            }
        }
        sortInputsOutputs(this.insOuts)
        for (const spec of this.insOuts) {
            components[spec.id] = spec.sourceRepr
        }

        this.numInputs = totalIn
        this.numOutputs = totalOut

        for (const pin of this.externalPins()) this.numBySide[pin.orient] += pin.bus ? 1 : pin.numBits
        this.recalcSize()
    }

    /** Physical order is independent of the logical order used by the simulator. */
    public externalPins(): CustomComponentNodeSpec[] {
        const automatic = this.insOuts
        const byId = new Map(automatic.map(pin => [pin.id, pin]))
        const assigned = new Set<string>()
        const ordered: CustomComponentNodeSpec[] = []
        for (const entry of this.pinLayout ?? []) {
            const pin = byId.get(entry.id)
            if (pin !== undefined && !assigned.has(entry.id)) {
                ordered.push({ ...pin, orient: entry.side, bus: pin.numBits > 1 && entry.bus === true })
                assigned.add(entry.id)
            }
        }
        // Top and bottom sides are presented from left to right; the legacy
        // automatic arrangement was calculated from right to left.
        for (const side of Orientations) {
            const remaining = automatic.filter(pin => pin.orient === side && !assigned.has(pin.id))
            if (Orientation.isVertical(side)) remaining.reverse()
            ordered.push(...remaining)
        }
        return ordered
    }

    public externalPinPositions(gridWidth = this.gridWidth, gridHeight = this.gridHeight) {
        const counts: Record<Orientation, number> = { n: 0, e: 0, s: 0, w: 0 }
        return this.externalPins().map(pin => {
            const { orient, numBits } = pin
            const slots = pin.bus ? 1 : numBits
            const along = -(this.numBySide[orient] - 1) + 2 * (counts[orient] + (slots - 1) / 2)
            counts[orient] += slots
            const x = orient === "w" ? -gridWidth / 2 - 1 : orient === "e" ? gridWidth / 2 + 1 : along
            const y = orient === "n" ? -gridHeight / 2 - 1 : orient === "s" ? gridHeight / 2 + 1 : along
            return { pin, x, y }
        })
    }

    private recalcSize() {
        const spacing = 2
        const margin = 1.5
        const minSize = 1 * this._caption.length + 2
        this.gridWidth = Math.ceil(Math.max(minSize, (Math.max(this.numBySide.s, this.numBySide.n) - 1) * spacing + 2 * margin))
        this.gridHeight = Math.ceil(Math.max(this.externalPins().some(p => p.bus) ? 6 : minSize, (Math.max(this.numBySide.e, this.numBySide.w) - 1) * spacing + 2 * margin))
    }

    // ComponentMaker interface
    public isValid() { return true }
    public get type() { return CustomComponentPrefix + this.customId }

    public uses(type: string, alsoIndirect: false | [true, ComponentFactory]): boolean {
        const compReprs = this.circuit.components
        if (compReprs === undefined) {
            return false
        }
        const whitelist: string[] = []
        for (const compRepr of Object.values(compReprs)) {
            const compType = String(compRepr.type)
            if (compType === type) {
                return true
            } else if (alsoIndirect !== false && compType.startsWith(CustomComponentPrefix) && !whitelist.includes(compType)) {
                const factory = alsoIndirect[1]
                // maybe this other custom component uses the type
                const customId = compType.substring(CustomComponentPrefix.length)
                if (factory.getCustomDef(customId)?.uses(type, alsoIndirect) ?? false) {
                    return true
                }
                whitelist.push(compType)
            }
        }
        return false
    }

    public make(parent: DrawableParent): Component {
        const comp = new CustomComponent(parent, this)
        parent.components.add(comp)
        return comp
    }

    public makeFromJSON(parent: DrawableParent, data: Record<string, unknown>): Component | undefined {
        const validated = validateJson(data, CustomComponentRepr, "CustomComponent")
        if (validated === undefined) {
            return undefined
        }
        const comp = new CustomComponent(parent, this, validated)
        parent.components.add(comp)
        return comp
    }

    public makeButtonSVG() {
        const width = CustomComponentImageWidth
        const height = CustomComponentImageHeight
        const g = new SVGRenderingContext(width, height)

        // frame
        g.rect(10, 2, 30, 30)
        g.strokeStyle = "currentColor"
        g.lineWidth = 2
        g.stroke()

        // in/out
        const maxHeight = 24
        const stdSep = 6
        const drawInsOuts = (n: number, left: number, right: number) => {
            const sep = ((n - 1) * stdSep <= maxHeight) ? stdSep : maxHeight / (n - 1)
            const top = height / 2 - (n - 1) * sep / 2
            for (let i = 0; i < n; i++) {
                const y = top + i * sep
                g.moveTo(left, y)
                g.lineTo(right, y)
            }
        }
        g.lineWidth = 1
        const maxDrawnIO = 10
        drawInsOuts(Math.min(maxDrawnIO, this.externalPins().filter(p => p.isIn).reduce((n,p) => n + (p.bus ? 1 : p.numBits),0)), 2, 10)
        drawInsOuts(Math.min(maxDrawnIO, this.externalPins().filter(p => !p.isIn).reduce((n,p) => n + (p.bus ? 1 : p.numBits),0)), 40, 48)
        g.stroke()

        // caption
        let drawCaption = this._caption
        let shortened = false

        // eslint-disable-next-line no-constant-condition
        while (true) {
            let fontSize = 15
            g.font = `${fontSize}px sans-serif`
            const textWidth = g.measureText(drawCaption).width
            const scale = (width - 24) / textWidth
            if (scale < 1) {
                fontSize = Math.floor(scale * fontSize)
                g.font = `${fontSize}px sans-serif`
            }
            if (fontSize >= 8) {
                g.fillStyle = "currentColor"
                g.textAlign = "center"
                fillTextVAlign(g, TextVAlign.middle, drawCaption + (shortened ? "." : ""), width / 2, height / 2)
                break
            }
            // else, try again with a shorter caption
            drawCaption = drawCaption.slice(0, -1)
            shortened = true
        }

        return g.getSvg()
    }

    // ComponentDef creation
    public toStandardDef() {
        return defineComponent(CustomComponentPrefix + this.customId, true, true, {
            idPrefix: this.customId,
            button: { imgWidth: 50 },
            valueDefaults: {},
            size: () => ({ gridWidth: this.gridWidth, gridHeight: this.gridHeight }),
            makeNodes: ({ gridWidth, gridHeight }) => {
                const positions = new Map(this.externalPinPositions(gridWidth, gridHeight).map(pos => [pos.pin.id, pos]))
                const ins: NodeRec<NodeInDesc> = {}
                const outs: NodeRec<NodeOutDesc> = {}
                // Keep the logical sequence (and serialized node IDs) unchanged.
                for (const spec of this.insOuts) {
                    const { pin, x, y } = positions.get(spec.id)!
                    const { orient, numBits } = pin
                    const desc: NodeDesc | NodeGroupDesc<NodeDesc> = numBits === 1
                        ? [x, y, orient]
                        : Orientation.isVertical(orient)
                            ? groupHorizontal(orient, x, y, numBits, pin.bus ? 0 : undefined)
                            : groupVertical(orient, x, y, numBits, pin.bus ? 0 : undefined)
                    ;(spec.isIn ? ins : outs)[spec.name] = desc
                }
                return { ins, outs }
            },
            initialValue: () => ArrayFillWith(false as LogicValue, this.numOutputs),
        })
    }
}

export const CustomComponentRepr = ComponentRepr(true, true)
export type CustomComponentRepr = t.TypeOf<typeof CustomComponentRepr>


export class CustomComponent extends ComponentBase<CustomComponentRepr, LogicValue[]> implements DrawableParent {


    /// Base public properties ///

    private _customDef: CustomComponentDef
    public get customDef() { return this._customDef }
    public draftPinLayout: ExternalPinLayout | undefined
    public draftDocumentation: ComponentDocumentation
    public readonly numInputs: number
    public readonly numOutputs: number


    /// DrawableParent implementation ///

    public get type(): ParentType { return ParentType.CUSTOM_COMPONENT }
    public isMainEditor(): this is LogicEditor { return false }
    public get editor() { return this.parent.editor }
    public get mode() { return this.parent.mode }

    public readonly components = new ComponentList()
    public readonly testSuites: TestSuites = new TestSuites(this)
    public readonly nodeMgr = new NodeManager()
    public readonly linkMgr: LinkManager = new LinkManager(this)
    public readonly recalcMgr = new RecalcManager()

    private _ifEditing: EditTools | undefined = undefined
    public get ifEditing() { return this._ifEditing }
    public stopEditingThis() { this._ifEditing = undefined }
    public startEditingThis(tools: EditTools) { this._ifEditing = tools }

    public readonly componentCreationParams: InjectedParams = { isXRay: false }

    /// Other internals ///

    private _subcircuitInputs: Input[] = []
    private _subcircuitOutputs: Output[] = []

    public constructor(parent: DrawableParent, customDef: CustomComponentDef, saved?: CustomComponentRepr) {
        super(parent, customDef.toStandardDef().from(parent), saved)
        this._customDef = customDef
        this.draftPinLayout = customDef.pinLayout?.map(pin => ({ ...pin }))
        this.draftDocumentation = structuredClone(customDef.documentation)
        this.numInputs = this.inputs._all.length
        this.numOutputs = this.outputs._all.length

        const error = Serialization.loadCircuitForCustomComponent(this, customDef.circuit)
        if (error !== undefined) {
            console.error("Failed to load custom component:", error)
            this.setInvalid()
        }
    }

    /**
     * Called by Serialization.loadCircuitOfCustomComponent after successfully loading a circuit;
     * can be seen as the rest of the constructor. It sets up the input and output nodes of this
     * CustomComponent according to the properties of the loaded Input/Output components.
     */
    public circuitDidLoad() {
        this._subcircuitInputs.length = 0
        this._subcircuitOutputs.length = 0
        let iIn = 0
        for (const comp of this.components.all()) {
            // assume they have been kept in the right order
            if (comp instanceof Input && !comp.isConstant) {
                this._subcircuitInputs.push(comp)
                comp.isCustomComponentInput = true
                const nodes = comp.outputs._all
                const num = nodes.length
                if (num === 1 && comp.isLinkedToSomeClock) {
                    this.inputs._all[iIn].isClock = true
                }
                for (let i = 0; i < num; i++) {
                    const j = iIn + i
                    if (j >= this.numInputs) {
                        // we have more input components than actual inputs for this
                        // custom components; this means we are restoring a saved editor
                        // state where some input was added, so we needn't update our
                        // input node now
                        break
                    }
                    this.inputs._all[j].prefersSpike = comp.isPushButton
                }
                iIn += num
            } else if (comp instanceof Output && !comp.isInternal) {
                this._subcircuitOutputs.push(comp)
            }
        }
    }

    public override toStringDetails() {
        return this.customDef?.customId ?? ""
    }

    public toJSON() {
        return this.toJSONBase()
    }

    protected override jsonType() {
        return CustomComponentPrefix + this.customDef.customId
    }

    protected override makeClone(setSpawning: boolean): CustomComponent {
        const repr = this.toNodelessJSON()
        const clone = new CustomComponent(this.parent, this.customDef, repr)
        this.parent.components.add(clone)
        if (setSpawning) {
            clone.setSpawning()
        }
        return clone
    }

    public updateFromDef() {
        // we need to recreate it to regenerate the properties from the new def
        const newDef = this.editor.factory.getCustomDef(this._customDef.customId)
        if (newDef === undefined) {
            console.warn("New custom component definition not found, using old one, but trouble is ahead")
        } else {
            this._customDef = newDef
        }
        this.replaceWithComponent(this.makeClone(false))
    }

    protected doRecalcValue(): LogicValue[] {
        let bitOffset = 0
        for (const inputComp of this._subcircuitInputs) {
            const numBits = inputComp.numBits
            if (bitOffset + numBits > this.numInputs) {
                // we have more input components than actual inputs for this in the current
                // editing state, so we just skip the rest
                break
            }
            inputComp.setValue(ArrayFillUsing(i => this.inputs._all[bitOffset + i].value, numBits))
            inputComp.propagateCurrentValue()
            bitOffset += numBits
        }
        this.recalcMgr.recalcAndPropagateIfNeeded()

        const outputs: LogicValue[] = []
        for (const outputComp of this._subcircuitOutputs) {
            outputs.push(...outputComp.value)
        }
        return outputs
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs._all, newValue)
    }

    public override makeTooltip() {
        const s = S.Components.Custom.tooltip
        const doc = this.customDef.documentation
        const body = document.createElement("div")
        if (doc.showDescription) {
            const description = document.createElement("div")
            description.className = "custom-tooltip-description"
            description.textContent = doc.description || s.desc
            body.append(description)
        }
        const truth = doc.truth
        if (doc.showTruth && truth !== undefined && truth.signature === circuitSignature(this.customDef.circuit, id => this.editor.factory.getCustomDef(id)?.circuit)) {
            const wrap = document.createElement("div")
            wrap.className = "custom-tooltip-truth"
            const table = document.createElement("table")
            table.className = "truth-table"
            const head = table.createTHead().insertRow()
            for (const port of [...truth.inputs, ...truth.outputs]) {
                const cell = document.createElement("th")
                cell.textContent = port.name + (port.bits > 1 ? " [" + port.bits + "]" : "")
                cell.className = truth.inputs.includes(port) ? "test-input" : "test-output"
                head.append(cell)
            }
            const tbody = table.createTBody()
            for (const values of truth.rows) {
                const row = tbody.insertRow()
                for (const value of values) row.insertCell().textContent = value
            }
            wrap.append(table)
            body.append(wrap)
        }
        return tooltipContent(mods(b(this.customDef.caption), span(s.titleSuffix)), body, 520)
    }


    // TODO tooltip

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext): void {
        super.doDrawDefault(g, ctx, () => {
            g.font = `bold 18px sans-serif`
            g.fillStyle = COLOR_COMPONENT_BORDER
            g.textAlign = "center"
            fillTextVAlign(g, TextVAlign.middle, this.customDef.caption, this.posX, this.posY)
        })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Custom.contextMenu

        return [
            ...this.makeForceOutputsContextMenuItem(),
            ["mid", MenuData.item("connect", s.ChangeCircuit, () => {
                this.tryOpenEditor()
            }, { shortcut: "↩︎" })],
        ]
    }

    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter" && !e.altKey) {
            this.tryOpenEditor()
        } else {
            super.keyDown(e)
        }
    }

    public override pointerDoubleClicked(e: PointerEvent) {
        const result = super.pointerDoubleClicked(e)
        if (result.isChange) {
            return result
        }
        return this.tryOpenEditor()

    }

    private tryOpenEditor(): InteractionResult {
        const s = S.Components.Custom.messages

        let showOnly
        if (!UIPermissions.canModifyCustomComponents(this.editor) || (showOnly = this.editor.options.showOnly) !== undefined && !showOnly.includes(this._customDef.id)) {
            void this.editor.appAlert(s.CannotBeModified)
            return InteractionResult.NoChange
        }

        if (!(this.editor.editorRoot instanceof LogicEditor)) {
            void this.editor.appAlert(s.NotInMainEditor)
            return InteractionResult.NoChange
        }

        this.editor.setEditorRoot(this)
        this.editor.editTools.undoMgr.takeSnapshot()
        return InteractionResult.SimpleChange
    }

}


function sortInputsOutputs(insOuts: CustomComponentNodeSpec[]) {
    const orientValue = {
        e: 0,
        w: 1,
        n: 2,
        s: 3,
    }
    const criterion = (spec: CustomComponentNodeSpec) => {
        return Orientation.isVertical(spec.orient) ? -spec.sourcePos[0] : spec.sourcePos[1]
    }
    insOuts.sort((a, b) => {
        return orientValue[a.orient] - orientValue[b.orient] || criterion(a) - criterion(b)
    })
}

