import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, COLOR_NODE_MOUSE_OVER, COLOR_UNKNOWN, GRID_STEP } from "../drawutils"
import { div, tooltipContent } from "../htmlgen"
import { ArrayFillWith, LogicValue, typeOrUndefined } from "../utils"
import { defineParametrizedComponent, group, groupVertical, param, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"


// Like a passthrough pin: no filled component body, only the fan-out spine.
function drawAdapter(g: GraphicsRendering,ctx: DrawContext, x: number,y: number,bits: number,merge: boolean) {
    const scalarSide = merge ? -1 : 1
    const extent = 3 * GRID_STEP
    const half = (bits - 1) * GRID_STEP
    g.save()
    g.lineCap = "round"
    g.strokeStyle = ctx.isPointerOver ? COLOR_NODE_MOUSE_OVER : COLOR_UNKNOWN
    g.lineWidth = ctx.isPointerOver ? 6 : 3
    g.beginPath()
    g.moveTo(x,y-half)
    g.lineTo(x,y+half)
    g.stroke()
    g.strokeStyle = COLOR_COMPONENT_BORDER
    g.lineWidth = 1.5
    g.font = "9px sans-serif"
    g.fillStyle = COLOR_COMPONENT_BORDER
    g.textAlign = merge ? "left" : "right"
    for (let i=0;i<bits;i++) {
        const yy = y-half+i*2*GRID_STEP
        g.beginPath()
        g.moveTo(x,yy)
        g.lineTo(x+scalarSide*extent,yy)
        g.stroke()
        g.fillText(String(i),x+scalarSide*3,yy-3)
    }
    g.strokeStyle = "#6485ad"
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(x,y)
    g.lineTo(x-scalarSide*extent,y)
    g.stroke()
    g.fillStyle = COLOR_COMPONENT_BORDER
    g.textAlign = "center"
    g.fillText(bits + "b",x-scalarSide*extent*.55,y-6)
    g.restore()
}

const widths = Array.from({ length: 32 }, (_,i) => i + 1)
const width = (bits: number) => Math.max(1,Math.min(32,Math.trunc(bits) || 1))
function individualPins(orient: "e" | "w", x: number, bits: number) {
    return group(orient, Array.from({ length: bits }, (_,i) => [x, i * 2 - (bits - 1), "D" + i] as const))
}

export const BusMergerDef = defineParametrizedComponent("bus-merger", true, true, {
    variantName: ({bits}) => "bus-merger-" + bits,
    idPrefix: "merge",
    button: { imgWidth: 36 },
    repr: { bits: typeOrUndefined(t.number) },
    valueDefaults: {},
    params: { bits: param(8,widths) },
    validateParams: ({bits}) => ({ bits: width(bits) }),
    size: ({bits}) => ({ gridWidth: 4, gridHeight: Math.max(2,bits * 2) }),
    makeNodes: ({bits}) => ({
        ins: { Bits: individualPins("w",-3,bits) },
        outs: { Bus: groupVertical("e",3,0,bits,0) },
    }),
    initialValue: (_saved,{bits}) => ArrayFillWith<LogicValue>(false,bits),
})
export const BusSplitterDef = defineParametrizedComponent("bus-splitter", true, true, {
    variantName: ({bits}) => "bus-splitter-" + bits,
    idPrefix: "split",
    button: { imgWidth: 36 },
    repr: { bits: typeOrUndefined(t.number) },
    valueDefaults: {},
    params: { bits: param(8,widths) },
    validateParams: ({bits}) => ({ bits: width(bits) }),
    size: ({bits}) => ({ gridWidth: 4, gridHeight: Math.max(2,bits * 2) }),
    makeNodes: ({bits}) => ({
        ins: { Bus: groupVertical("w",-3,0,bits,0) },
        outs: { Bits: individualPins("e",3,bits) },
    }),
    initialValue: (_saved,{bits}) => ArrayFillWith<LogicValue>(false,bits),
})

type MergerRepr = Repr<typeof BusMergerDef>
type SplitterRepr = Repr<typeof BusSplitterDef>

export class BusMerger extends ParametrizedComponentBase<MergerRepr> {
    public readonly bits: number
    constructor(parent: DrawableParent, params: ResolvedParams<typeof BusMergerDef>, saved?: MergerRepr) {
        super(parent,BusMergerDef.with(params),saved)
        this.bits = params.bits
    }
    public toJSON() { return { ...this.toJSONBase(), bits: this.bits } }
    protected doRecalcValue(): LogicValue[] { return this.inputValues(this.inputs.Bits) }
    protected override propagateValue(value: LogicValue[]) { this.outputValues(this.outputs.Bus,value) }
    public override makeTooltip() {
        return tooltipContent("Bus Merger · " + this.bits + " bits",div("Regroupe les fils D0 à D" + (this.bits-1) + " dans un seul bus.",div("D0 = bit de poids faible. Aucune modification de la valeur.")))
    }
    protected override doDraw(g: GraphicsRendering,ctx: DrawContext) {
        drawAdapter(g,ctx,this.posX,this.posY,this.bits,true)
    }
    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return [["mid",MenuData.item("pen","Largeur du bus (" + this.bits + " bits)",async () => {
            const value = await this.parent.editor.appPrompt("Nombre de bits (1–32)",String(this.bits))
            if (value === null) return
            const bits = Number(value)
            if (!Number.isInteger(bits) || bits < 1 || bits > 32) { await this.parent.editor.appAlert("Largeur invalide."); return }
            if (bits !== this.bits) this.replaceWithNewParams({bits})
        })]]
    }
}

export class BusSplitter extends ParametrizedComponentBase<SplitterRepr> {
    public readonly bits: number
    constructor(parent: DrawableParent, params: ResolvedParams<typeof BusSplitterDef>, saved?: SplitterRepr) {
        super(parent,BusSplitterDef.with(params),saved)
        this.bits = params.bits
    }
    public toJSON() { return { ...this.toJSONBase(), bits: this.bits } }
    protected doRecalcValue(): LogicValue[] { return this.inputValues(this.inputs.Bus) }
    protected override propagateValue(value: LogicValue[]) { this.outputValues(this.outputs.Bits,value) }
    public override makeTooltip() {
        return tooltipContent("Bus Splitter · " + this.bits + " bits",div("Sépare le bus en fils D0 à D" + (this.bits-1) + ".",div("D0 = bit de poids faible. Aucune modification de la valeur.")))
    }
    protected override doDraw(g: GraphicsRendering,ctx: DrawContext) {
        drawAdapter(g,ctx,this.posX,this.posY,this.bits,false)
    }
    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return [["mid",MenuData.item("pen","Largeur du bus (" + this.bits + " bits)",async () => {
            const value = await this.parent.editor.appPrompt("Nombre de bits (1–32)",String(this.bits))
            if (value === null) return
            const bits = Number(value)
            if (!Number.isInteger(bits) || bits < 1 || bits > 32) { await this.parent.editor.appAlert("Largeur invalide."); return }
            if (bits !== this.bits) this.replaceWithNewParams({bits})
        })]]
    }
}
BusMergerDef.impl = BusMerger
BusSplitterDef.impl = BusSplitter
