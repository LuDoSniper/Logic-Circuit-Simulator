/** Least-significant bit first, matching the simulator's node groups. */
export function resizeBus<T>(input: readonly T[], width: number, offset: number, signed: boolean, zero: T): T[] {
    const fill = signed && input.length > offset ? input[input.length - 1] : zero
    return Array.from({ length: width }, (_,i) => offset + i < input.length ? input[offset+i] : fill)
}
