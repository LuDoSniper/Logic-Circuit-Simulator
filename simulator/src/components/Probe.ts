import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COMPONENT_OUTLINE_THICKNESS, GRID_STEP, INPUT_OUTPUT_DIAMETER, circle, colorForLogicValue, drawComponentName, drawValueText, drawValueTextCentered, useCompact } from "../drawutils"
import { cls, div, style, tooltipContent } from "../htmlgen"
import { S, getLang } from "../strings"
import { ArrayFillWith, binaryStringRepr, LogicValue, typeOrUndefined } from "../utils"
import { ComponentName, ComponentNameRepr, defineParametrizedComponent, groupVertical, param, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuItems } from "./Drawable"

export const ProbeDef = defineParametrizedComponent("probe", true, true, {
    variantName: ({bits}) => "probe-" + bits,
    idPrefix: "probe",
    button: { imgWidth: 32 },
    repr: { bits: typeOrUndefined(t.number), name: ComponentNameRepr },
    valueDefaults: {},
    params: { bits: param(8,Array.from({length:32},(_,i)=>i+1)) },
    validateParams: ({bits}) => ({ numBits: Math.max(1,Math.min(32,Math.trunc(bits) || 1)) }),
    size: ({numBits}) => numBits === 1
        ? {gridWidth:INPUT_OUTPUT_DIAMETER/GRID_STEP,gridHeight:INPUT_OUTPUT_DIAMETER/GRID_STEP}
        : {gridWidth:2,gridHeight:useCompact(numBits) ? numBits : 2*numBits},
    makeNodes: ({numBits}) => ({
        ins: { In: groupVertical("w",numBits === 1 ? -3 : -2,0,numBits,0,{leadLength:10}) },
        outs: { Out: groupVertical("e",numBits === 1 ? 3 : 2,0,numBits,0,{leadLength:10}) },
    }),
    initialValue: (_saved,{numBits}) => ArrayFillWith<LogicValue>(false,numBits),
})
export type ProbeRepr = Repr<typeof ProbeDef>
type ProbeParams = ResolvedParams<typeof ProbeDef>

/** A passive display and non-inverting pass-through, not an external I/O port. */
export class Probe extends ParametrizedComponentBase<ProbeRepr> {
    public readonly numBits: number
    private _name: ComponentName
    constructor(parent: DrawableParent, params: ProbeParams, saved?: ProbeRepr) {
        super(parent,ProbeDef.with(params),saved)
        this.numBits = params.numBits
        this._name = saved?.name
    }
    public toJSON() {
        return {...this.toJSONBase(),bits:this.numBits,name:this._name}
    }
    protected doRecalcValue(): LogicValue[] { return this.inputValues(this.inputs.In) }
    protected override propagateValue(value: LogicValue[]) { this.outputValues(this.outputs.Out,value) }

    public get busTooltipValues() {
        const source = binaryStringRepr(this.value)
        return {source,target:source}
    }
    public override makeTooltip() {
        const fr = getLang() === "fr"
        const {source,target} = this.busTooltipValues
        return tooltipContent((fr ? "Sonde" : "Probe") + " · " + this.numBits + (this.numBits === 1 ? " bit" : " bits"),
            div(cls("bus-value-tooltip"),
                div(cls("bus-value-binary"),source),
                div(cls("bus-value-destination"),style("display:none"),div(cls("bus-value-binary"),target)),
                div(cls("bus-value-order"),fr ? "Bit fort → bit faible (base 2)" : "MSB → LSB (base 2)"),
            ),460)
    }

    protected override doDraw(g: GraphicsRendering,ctx: DrawContext) {
        const bounds = this.bounds()
        const {left,top,width} = bounds
        const values = this.value
        // Reuse the native I/O geometry and colours, with a terminal on each side.
        for (const node of this.allNodes()) this.drawWireLineTo(g,node,bounds)
        g.strokeStyle = ctx.isPointerOver ? ctx.borderColor : COLOR_COMPONENT_BORDER
        if (this.numBits === 1) {
            g.beginPath()
            circle(g,this.posX,this.posY,INPUT_OUTPUT_DIAMETER)
            g.fillStyle = colorForLogicValue(values[0])
            g.fill()
            g.lineWidth = 4
            g.stroke()
        } else {
            const outline = bounds.outline(g)
            g.fillStyle = COLOR_BACKGROUND
            g.fill(outline)
            const cellHeight = useCompact(this.numBits) ? GRID_STEP : GRID_STEP*2
            for (let i=0;i<this.numBits;i++) {
                // Display MSB at the top, so the column reads like a binary word.
                g.beginPath()
                g.rect(left,top+i*cellHeight,width,cellHeight)
                g.fillStyle = colorForLogicValue(values[this.numBits-1-i])
                g.fill()
                g.lineWidth = 1
                g.stroke()
            }
            g.lineWidth = COMPONENT_OUTLINE_THICKNESS
            g.stroke(outline)
        }
        ctx.inNonTransformedFrame(frame => {
            if (this._name !== undefined) drawComponentName(g,frame,this._name,binaryStringRepr(values),this,true)
            if (this.numBits === 1) {
                drawValueTextCentered(g,values[0],this)
            } else {
                const cellHeight = useCompact(this.numBits) ? GRID_STEP : GRID_STEP*2
                for (let i=0;i<this.numBits;i++) {
                    drawValueText(g,values[this.numBits-1-i],...frame.rotatePoint(this.posX,top+(i+.5)*cellHeight),{small:useCompact(this.numBits)})
                }
            }
        })
    }
    public doSetName(name: ComponentName) {
        this._name = name
        this.requestRedraw({why:"probe name changed"})
    }
    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return [
            ["mid",this.makeSetNameContextMenuItem(this._name,this.doSetName.bind(this))],
            this.makeChangeParamsContextMenuItem("inputs",S.Components.Generic.contextMenu.ParamNumBits,this.numBits,"bits"),
        ]
    }
    public override keyDown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.altKey) this.runSetNameDialog(this._name,this.doSetName.bind(this))
        else super.keyDown(e)
    }
}
ProbeDef.impl = Probe
