import * as t from "io-ts"

// A standalone codec: importing persistence must not initialize circuit components.
export const ExternalPinLayout = t.array(t.intersection([t.type({ id: t.string, side: t.keyof({ n: null, e: null, s: null, w: null }) }), t.partial({ bus: t.boolean })]))
export type ExternalPinLayout = t.TypeOf<typeof ExternalPinLayout>

const GridDimension = new t.Type<number,number,unknown>("GridDimension",
    (v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 4096,
    (v,ctx) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 4096 ? t.success(v) : t.failure(v,ctx),
    t.identity)
export const SymbolSize = t.type({ width: GridDimension, height: GridDimension })
export type SymbolSize = t.TypeOf<typeof SymbolSize>

export function minimumSymbolSize(horizontalSlots: number, verticalSlots: number): SymbolSize {
    const dimension = (slots: number) => Math.max(4, 2 * Math.max(0,slots - 1) + 3)
    return { width: dimension(horizontalSlots), height: dimension(verticalSlots) }
}
export function snapSymbolSize(size: SymbolSize, minimum: SymbolSize): SymbolSize {
    const snap = (n: number, min: number) => Math.max(min,Math.min(4096,Number.isFinite(n) ? Math.round(n) : min))
    return { width: snap(size.width,minimum.width), height: snap(size.height,minimum.height) }
}
export function fitSymbolCaption(caption: string, available: number, measure: (text: string, font: number) => number) {
    const width = Math.max(1,available)
    for (let font = 18; font >= 8; font--) {
        if (measure(caption,font) <= width) return { text:caption,font }
    }
    let text = caption
    while (text.length && measure(text + "…",8) > width) text = text.slice(0,-1)
    return { text: text.length ? text + "…" : measure("…",8) <= width ? "…" : "", font:8 }
}

export const SymbolColor = new t.Type<string,string,unknown>("SymbolColor",
    (v): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v),
    (v,ctx) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? t.success(v.toLowerCase()) : t.failure(v,ctx),
    t.identity)
export const symbolColorPalette = [
    { color:"#3b82f6", fr:"Bleu", en:"Blue" },
    { color:"#14b8a6", fr:"Turquoise", en:"Teal" },
    { color:"#22c55e", fr:"Vert", en:"Green" },
    { color:"#eab308", fr:"Jaune", en:"Yellow" },
    { color:"#f97316", fr:"Orange", en:"Orange" },
    { color:"#ef4444", fr:"Rouge", en:"Red" },
    { color:"#a855f7", fr:"Violet", en:"Purple" },
    { color:"#ec4899", fr:"Rose", en:"Pink" },
    { color:"#94a3b8", fr:"Gris", en:"Grey" },
] as const
export const symbolTintOpacity = 0.28
// undefined inherits the definition; null explicitly disables its color.
export function resolveSymbolColor(defaultColor: string | undefined, override: string | null | undefined): string | undefined {
    return override === undefined ? defaultColor : override ?? undefined
}
