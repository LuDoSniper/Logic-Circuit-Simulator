import * as t from "io-ts"

// A standalone codec: importing persistence must not initialize circuit components.
export const ExternalPinLayout = t.array(t.intersection([t.type({ id: t.string, side: t.keyof({ n: null, e: null, s: null, w: null }) }), t.partial({ bus: t.boolean })]))
export type ExternalPinLayout = t.TypeOf<typeof ExternalPinLayout>
