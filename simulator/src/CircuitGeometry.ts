export type CircuitPoint = { posX: number, posY: number, width: number, height: number }
export type CircuitBounds = { left: number, top: number, right: number, bottom: number }

export function translateWaypoint<T extends [number, number, ...unknown[]]>(point: T, offset: readonly [number, number]): T {
    const translated = point.slice() as T
    translated[0] += offset[0]
    translated[1] += offset[1]
    return translated
}

export function circuitBounds(points: Iterable<CircuitPoint>): CircuitBounds | undefined {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    for (const point of points) {
        const {posX, posY, width, height} = point
        if (![posX,posY,width,height].every(Number.isFinite)) continue
        left = Math.min(left,posX-width/2)
        right = Math.max(right,posX+width/2)
        top = Math.min(top,posY-height/2)
        bottom = Math.max(bottom,posY+height/2)
    }
    return left === Infinity ? undefined : {left,top,right,bottom}
}

/** Centre the bounding box, preserving current zoom unless a zoom-out is necessary. */
export function frameCircuit(bounds: CircuitBounds, width: number, height: number, zoom: number, padding = 48) {
    if (width <= 0 || height <= 0) return undefined
    const margin = Math.min(padding,width/4,height/4)
    const maxScale = Math.min(
        (width-2*margin)/Math.max(1,bounds.right-bounds.left),
        (height-2*margin)/Math.max(1,bounds.bottom-bounds.top),
    )
    const nextZoom = Math.max(10,Math.min(100000,zoom,Math.floor(maxScale*100)))
    const scale = nextZoom/100
    return { zoom:nextZoom, x:width/(2*scale)-(bounds.left+bounds.right)/2, y:height/(2*scale)-(bounds.top+bounds.bottom)/2 }
}
