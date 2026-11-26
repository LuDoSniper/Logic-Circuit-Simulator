import * as t from "io-ts"

const Port = t.type({ id: t.string, name: t.string, bits: t.number })
const Truth = t.type({ signature: t.string, inputs: t.array(Port), outputs: t.array(Port), rows: t.array(t.array(t.string)) })
const Case = t.type({ id: t.string, name: t.string, inputs: t.record(t.string, t.string), expected: t.record(t.string, t.string) })
export const ComponentTesting = t.type({
    description: t.string, showDescription: t.boolean, showTruth: t.boolean,
    cases: t.array(Case), 
})
export const ComponentDocumentation = t.intersection([ComponentTesting, t.partial({ truth: Truth })])
export type ComponentDocumentation = t.TypeOf<typeof ComponentDocumentation>
export type TruthTable = t.TypeOf<typeof Truth>
export type DevelopmentCase = t.TypeOf<typeof Case>
export type TestPort = t.TypeOf<typeof Port>
export function defaultDocumentation(): ComponentDocumentation {
    return { description: "", showDescription: true, showTruth: true, cases: [] }
}

// Stable signature of the tested circuit, independent of record order and current input switches.
// Include nested definitions so updating a dependency invalidates the published truth table.
type CircuitShape = { components?: Record<string, Record<string, unknown>>, wires?: readonly unknown[] }
function canonical(value: unknown): string {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]"
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>
        return "{" + Object.keys(record).filter(k => record[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + canonical(record[k])).join(",") + "}"
    }
    return JSON.stringify(value) ?? "null"
}
export function circuitSignature(circuit: CircuitShape, dependency: (id: string) => CircuitShape | undefined, seen = new Set<string>()): string {
    const components = Object.fromEntries(Object.entries(circuit.components ?? {}).map(([id, repr]) => {
        const copy = { ...repr }
        delete copy.ref
        if (copy.type === "in" && copy.isConstant !== true) delete copy.val
        return [id, copy]
    }))
    const wires = (circuit.wires ?? []).map(wire => {
        if (!Array.isArray(wire)) return canonical(wire)
        const opts = wire[2]
        if (typeof opts !== "object" || opts === null) return canonical(wire)
        const copy = { ...opts } as Record<string, unknown>
        delete copy.propagationDelay
        return canonical(Object.keys(copy).filter(k => copy[k] !== undefined).length ? [wire[0],wire[1],copy] : [wire[0],wire[1]])
    }).sort()
    const dependencies: Record<string, string> = {}
    for (const repr of Object.values(components)) {
        if (typeof repr.type !== "string" || !repr.type.startsWith("custom-")) continue
        const id = repr.type.slice(7)
        if (seen.has(id) || Object.prototype.hasOwnProperty.call(dependencies,id)) continue
        const def = dependency(id)
        if (def !== undefined) dependencies[id] = circuitSignature(def, dependency, new Set([...seen,id]))
    }
    return canonical({ components, wires, dependencies })
}
export function makeTruthInputs(ports: readonly TestPort[], row: number): string[] {
    let remaining = ports.reduce((sum, p) => sum + p.bits, 0)
    return ports.map(port => {
        remaining -= port.bits
        return Math.floor(row / 2 ** remaining).toString(2).slice(-port.bits).padStart(port.bits, "0")
    })
}
