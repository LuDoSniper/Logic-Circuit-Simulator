import * as t from "io-ts"
import { COLOR_COMPONENT_INNER_LABELS } from "../drawutils"
import { div, tooltipContent } from "../htmlgen"
import { ArrayFillWith, LogicValue, typeOrUndefined } from "../utils"
import { resizeBus } from "../BusBits"
import { defineParametrizedComponent, groupVertical, param, paramBool, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { DrawContext, DrawableParent, GraphicsRendering, MenuData, MenuItems } from "./Drawable"

const widths = Array.from({ length: 32 }, (_,i) => i+1)
const offsets = Array.from({ length: 32 }, (_,i) => i)
export const BusConverterDef = defineParametrizedComponent("bus-converter", true, true, {
    variantName: ({from,to,offset,signed}) => "bus-converter-" + from + "-" + to + "-" + offset + (signed ? "-s" : ""),
    idPrefix: "busconv",
    button: { imgWidth: 36 },
    repr: { from: typeOrUndefined(t.number), to: typeOrUndefined(t.number), offset: typeOrUndefined(t.number), signed: typeOrUndefined(t.boolean) },
    valueDefaults: {},
    params: { from: param(8,widths), to: param(4,widths), offset: param(0,offsets), signed: paramBool() },
    validateParams: ({from,to,offset,signed}) => ({
        from: Math.min(32,Math.max(1,Math.trunc(from) || 1)),
        to: Math.min(32,Math.max(1,Math.trunc(to) || 1)),
        offset: Math.min(31,Math.max(0,Math.trunc(offset) || 0)),
        signed,
    }),
    size: ({from,to}) => ({ gridWidth: 8, gridHeight: Math.max(6, 2 + Math.max(from,to)) }),
    makeNodes: ({from,to}) => ({
        ins: { In: groupVertical("w",-5,0,from,1) },
        outs: { Out: groupVertical("e",5,0,to,1) },
    }),
    initialValue: (saved,{to}) => ArrayFillWith<LogicValue>(false,to),
})
export type BusConverterRepr = Repr<typeof BusConverterDef>
type BusConverterParams = ResolvedParams<typeof BusConverterDef>
export class BusConverter extends ParametrizedComponentBase<BusConverterRepr> {
    private readonly config: BusConverterParams
    public get from() { return this.config.from }
    public get to() { return this.config.to }
    public get offset() { return this.config.offset }
    public get signed() { return this.config.signed }
    constructor(parent: DrawableParent, params: BusConverterParams, saved?: BusConverterRepr) {
        super(parent,BusConverterDef.with(params),saved)
        this.config = params
    }
    public toJSON() {
        return { ...this.toJSONBase(), ...this.config }
    }
    protected doRecalcValue(): LogicValue[] {
        return resizeBus(this.inputValues(this.inputs.In),this.config.to,this.config.offset,this.config.signed,false)
    }
    protected override propagateValue(value: LogicValue[]) {
        this.outputValues(this.outputs.Out,value)
    }
    public override makeTooltip() {
        const {from,to,offset,signed} = this.config
        return tooltipContent("Convertisseur de bus " + from + " → " + to,div(
            "Bit de départ : " + offset,div(signed ? "Extension de signe" : "Extension par zéro"),
            div("Les bits de poids faible sont conservés à partir du bit de départ.")
        ),320)
    }
    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        this.doDrawDefault(g,ctx,() => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.textAlign = "center"
            g.font = "bold 13px sans-serif"
            g.fillText(this.config.from + " → " + this.config.to,this.posX,this.posY-3)
            g.font = "10px sans-serif"
            g.fillText("[" + this.config.offset + "] " + (this.config.signed ? "SIGN" : "ZERO"),this.posX,this.posY+12)
        })
    }
    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const change = (field: "from" | "to" | "offset", label: string, min: number, max: number) =>
            MenuData.item("pen", label + " (" + this.config[field] + ")",async () => {
                const value = await this.parent.editor.appPrompt(label + " (" + min + "–" + max + ")",String(this.config[field]))
                if (value === null) return
                const n = Number(value)
                if (!value.trim() || !Number.isInteger(n) || n < min || n > max) {
                    await this.parent.editor.appAlert("Valeur invalide.")
                    return
                }
                this.replaceWithNewParams({[field]:n})
            })
        return [
            ["mid",change("from","Largeur d’entrée",1,32)],
            ["mid",change("to","Largeur de sortie",1,32)],
            ["mid",change("offset","Bit de départ",0,31)],
            ["mid",MenuData.item(this.config.signed ? "check" : "none","Extension de signe",() => {
                this.replaceWithNewParams({signed:!this.config.signed})
            })],
        ]
    }
}
BusConverterDef.impl = BusConverter
