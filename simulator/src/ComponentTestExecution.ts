/** Plan stable input changes for a manual-clock test sequence.
 * Close falling-edge clocks before changing data, then apply rising edges
 * after data and controls have settled. Repeated levels never create an edge.
 */
export function testInputPhases(previous: readonly string[], next: readonly string[], clocks: readonly boolean[]): number[][] {
    const falling: number[] = [], data: number[] = [], rising: number[] = []
    for (let i = 0; i < next.length; i++) {
        if (previous[i] === next[i]) continue
        if (!clocks[i]) data.push(i)
        else if (next[i] === "0") falling.push(i)
        else rising.push(i)
    }
    return [falling,data,rising].filter(phase => phase.length > 0)
}

/** The pretty serializer must preserve explicit nulls (e.g. a neutral color). */
export function applyOptionalToJSON(value: any): any {
    return value != null && typeof value.toJSON === "function" ? value.toJSON() : value
}
