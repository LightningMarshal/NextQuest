import type { NormalizedGameMetadata } from "./types";

// Manual entry is the fallback of last resort: whatever the member typed in
// the proposal form is already normalized, so this is a pass-through that
// exists to make "no provider data" an explicit, supported path rather than
// an error state.
export function manualMetadata(input: NormalizedGameMetadata): NormalizedGameMetadata {
	return { ...input, raw: undefined };
}
