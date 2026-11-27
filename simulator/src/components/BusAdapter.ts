import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, COLOR_NODE_MOUSE_OVER, COLOR_UNKNOWN, drawWireLineToComponent, useCompact } from "../drawutils"
import { div, tooltipContent } from "../htmlgen"
import { ArrayFillWith, LogicValue, Mode, typeOrUndefined } from "../utils"
import { defineParametrizedComponent, group, groupVertical, param, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"
import type { Node } from "./Node"


// Match Passthrough: short native leads, identical spacing and spine.
function drawAdapter(g: GraphicsRendering, ctx: DrawContext, x: number, y: number, height: number, scalar: readonly Node[], bus: readonly Node[]) {
    g.save()
    for (const node of scalar) drawWireLineToComponent(g, node)
    const [x1,y1,x2,y2] = bus[0].drawCoordsInParentTransform
    g.beginPath()
    g.moveTo(x1,y1)
    g.lineTo(x2,y2)
    g.strokeStyle = bus.length > 1 ? "#6485ad" : COLOR_UNKNOWN
    g.lineWidth = bus.length > 1 ? 5 : 2
    g.stroke()

    if (bus[0].parent.mode >= Mode.CONNECT) {
        g.beginPath()
        g.moveTo(x,y-height/2)
        g.lineTo(x,y+height/2)
        if (ctx.isPointerOver) {
            g.lineWidth = 11
            g.strokeStyle = COLOR_NODE_MOUSE_OVER
            g.stroke()
        }
        g.lineWidth = 3
        g.strokeStyle = ctx.isPointerOver ? COLOR_COMPONENT_BORDER : COLOR_UNKNOWN
        g.stroke()
    }
    g.restore()
}

const widths = Array.from({ length: 32 }, (_,i) => i + 1)
const width = (bits: number) => Math.max(1,Math.min(32,Math.trunc(bits) || 1))
function individualPins(orient: "e" | "w", x: number, bits: number) {
    const spacing = useCompact(bits) ? 1 : 2
    return group(orient, Array.from({ length: bits }, (_,i) => [x, (i - (bits - 1) / 2) * spacing, "D" + i, { leadLength: 10 }] as const))
}

export const BusMergerDef = defineParametrizedComponent("bus-merger", true, true, {
    variantName: ({bits}) => "bus-merger-" + bits,
    idPrefix: "merge",
    button: { imgWidth: 36 },
    repr: { bits: typeOrUndefined(t.number) },
    valueDefaults: {},
    params: { bits: param(8,widths) },
    validateParams: ({bits}) => ({ bits: width(bits) }),
    size: ({bits}) => ({ gridWidth: 2, gridHeight: useCompact(bits) ? bits : bits * 2 }),
    makeNodes: ({bits}) => ({
        ins: { Bits: individualPins("w",-1,bits) },
        outs: { Bus: groupVertical("e",1,0,bits,0,{ leadLength: 10 }) },
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
    size: ({bits}) => ({ gridWidth: 2, gridHeight: useCompact(bits) ? bits : bits * 2 }),
    makeNodes: ({bits}) => ({
        ins: { Bus: groupVertical("w",-1,0,bits,0,{ leadLength: 10 }) },
        outs: { Bits: individualPins("e",1,bits) },
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
        return tooltipContent("Bus Merger · " + this.bits + " bits",div("Regroupe les fils D0 à D" + (this.bits-1) + " dans un seul bus.",div("Ordre des broches (orientation par défaut) : D0 en haut, D" + (this.bits-1) + " en bas."),div("D0 = bit de poids faible. Aucune modification de la valeur.")))
    }
    protected override doDraw(g: GraphicsRendering,ctx: DrawContext) {
        drawAdapter(g,ctx,this.posX,this.posY,this.unrotatedHeight,this.inputs.Bits,this.outputs.Bus)
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
        return tooltipContent("Bus Splitter · " + this.bits + " bits",div("Sépare le bus en fils D0 à D" + (this.bits-1) + ".",div("Ordre des broches (orientation par défaut) : D0 en haut, D" + (this.bits-1) + " en bas."),div("D0 = bit de poids faible. Aucune modification de la valeur.")))
    }
    protected override doDraw(g: GraphicsRendering,ctx: DrawContext) {
        drawAdapter(g,ctx,this.posX,this.posY,this.unrotatedHeight,this.outputs.Bits,this.inputs.Bus)
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
