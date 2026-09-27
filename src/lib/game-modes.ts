// Play-mode vocabulary derived from Steam appdetails categories
// (src/lib/metadata/steam.ts deriveGameModes). Shown as library badges and
// used as a library filter. (Formerly lived in the retired picker, pick.ts.)
export type GameMode =
	| "single-player"
	| "multi-player"
	| "co-op"
	| "online-co-op"
	| "local-co-op"
	| "pvp";
