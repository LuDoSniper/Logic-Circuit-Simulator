import * as t from "io-ts"

// A standalone codec: importing persistence must not initialize circuit components.
export const ExternalPinLayout = t.array(t.type({ id: t.string, side: t.keyof({ n: null, e: null, s: null, w: null }) }))
export type ExternalPinLayout = t.TypeOf<typeof ExternalPinLayout>
