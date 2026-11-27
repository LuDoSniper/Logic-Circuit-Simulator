/** Least-significant bit first, matching the simulator's node groups. */
export function resizeBus<T>(input: readonly T[], width: number, offset: number, signed: boolean, zero: T): T[] {
    const fill = signed && input.length > offset ? input[input.length - 1] : zero
    return Array.from({ length: width }, (_,i) => offset + i < input.length ? input[offset+i] : fill)
}

/** A reduction gate's operands and the breakout side of adapters are independent pins. */
export function isBusPinGroup(componentType: string, groupName: string, width: number): boolean {
    if (width < 2 || componentType === "gate" || componentType === "gate1") return false
    return !(groupName === "Bits" && (componentType === "bus-merger" || componentType === "bus-splitter"))
}

export type BusPortShape = { width: number, compact: boolean }

/** Expanded pins remain individually connectable; only compact terminals require a full bus. */
export function busConnectionMode(source: BusPortShape | undefined, target: BusPortShape | undefined, singleBit: boolean, direct: boolean, targetFree: boolean): "bus" | "scalar" | "width" | "occupied" {
    const compact = !!(source?.compact || target?.compact)
    if (!direct || (singleBit && !compact)) return compact ? "width" : "scalar"
    if (!source || !target || source.width !== target.width) return compact ? "width" : "scalar"
    if (!targetFree) return compact ? "occupied" : "scalar"
    return "bus"
}

/** Screen order of a rotated probe: LSB at top (vertical) or right (horizontal). */
export function probeDisplayValues<T>(values: readonly T[], orientation: "e" | "s" | "w" | "n"): readonly T[] {
    // The drawing transform reverses the local vertical axis for west and north.
    return orientation === "w" || orientation === "n" ? [...values].reverse() : values
}
