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

export type ResizeEdge = readonly [dx: -1 | 0 | 1, dy: -1 | 0 | 1]

/** Hit test in world coordinates; tolerance is derived from screen zoom. */
export function rectangleResizeEdge(rect: CircuitPoint, x: number, y: number, tolerance: number): ResizeEdge | undefined {
    const left = rect.posX - rect.width / 2, right = rect.posX + rect.width / 2
    const top = rect.posY - rect.height / 2, bottom = rect.posY + rect.height / 2
    const tx = Math.min(tolerance,rect.width/3), ty = Math.min(tolerance,rect.height/3)
    if (x < left-tx || x > right+tx || y < top-ty || y > bottom+ty) return undefined
    const dx = Math.abs(x-left) <= tx ? -1 : Math.abs(x-right) <= tx ? 1 : 0
    const dy = Math.abs(y-top) <= ty ? -1 : Math.abs(y-bottom) <= ty ? 1 : 0
    return dx || dy ? [dx,dy] : undefined
}

/** Move the selected edges only; keep the opposite edges fixed. */
export function resizeRectangle(rect: CircuitPoint, edge: ResizeEdge, deltaX: number, deltaY: number, step: number, minimum: number): CircuitPoint {
    const [dx,dy] = edge
    const width = dx === 0 ? rect.width : Math.max(Math.min(rect.width,minimum),rect.width + dx * Math.round(deltaX/step)*step)
    const height = dy === 0 ? rect.height : Math.max(Math.min(rect.height,minimum),rect.height + dy * Math.round(deltaY/step)*step)
    return { width,height,posX:rect.posX+dx*(width-rect.width)/2,posY:rect.posY+dy*(height-rect.height)/2 }
}
