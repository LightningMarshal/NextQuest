# NextQuest promo animation

A 47-second, hand-drawn-style animated short about NextQuest, written in plain
JavaScript. Every line, colour wash, note of music and sound effect is
generated at runtime on a `<canvas>` and with Web Audio — no libraries, no
image or music files. The only pre-rendered asset is the narration.

- **Watch:** `dist/nextquest-promo.mp4` (1920×1080, 30 fps, AAC 256k)
- **Play in a browser:** `dist/nextquest-promo.html` (single self-contained file)
- **README poster:** `dist/poster.jpg` (finale frame at 44.6 s with a play badge)

## Story (≈47 s, 100 BPM grid)

| Time | Scene |
| --- | --- |
| 0–9.6 s | The party is sketched in; the Backlog lands with a thud and grows (video games, tabletop campaigns, board games… "someday") |
| 9.6–13 s | The NextQuest mark draws itself and flies into the desktop app |
| 13–18.6 s | Proposing *Dragon's Peak*: hours, difficulty, acclaim → stamped **29 effort** (the README's own formula example) |
| 19–24.4 s | Ten secret votes each; a curtain hides the ballots, only group totals show |
| 24.6–29.4 s | The picker weighs interest, time fit and who's around → *Gloomkeep*: **NEXT UP!** |
| 29.4–34.2 s | Painting availability, RSVPs, "it's on!" |
| 34.2–39 s | Burn-up chart, then the mountain actually shrinks and the party plants the flag |
| 39–47.5 s | Logo slam, "Stop scrolling the backlog. Start playing it.", iris out |

## Files

```
src/engine.js   hand-drawn renderer: tapered boiling ink strokes, watercolor washes,
                hatching, handwritten text, paper grain
src/draw.js     the party (Pip, Moss, Tally, Bo), props, logo, desktop app shell
src/scenes.js   timeline, camera, word-level cues — pure function of time
src/audio.js    original score (Karplus-Strong pizzicato/ukulele, glockenspiel,
                celesta, marimba, tuba, strings, drums), foley, ducking, reverb, mastering
src/main.js     player + exporter hooks (window.NQ)
assets/         Shantell Sans + Caveat (OFL), narration.mp3
build.mjs       inline everything into dist/nextquest-promo.html
render.mjs      frame-step the page with Playwright → ffmpeg → MP4
```

## Rebuilding

```bash
node build.mjs                                   # dist/nextquest-promo.html
FFMPEG=ffmpeg node render.mjs dist/nextquest-promo.mp4 30   # needs playwright + libx264
```

For development, serve this folder (`npx serve .`) and open `index.html`.

## Narration

Voice: Kokoro-82M v1.0 (voice `af_heart`), generated line by line so the
animation can sync to exact line and word timings (`LINES` / `CUE` in
`src/scenes.js`). Processed with a light EQ, compression and loudness
normalisation. If the narration is regenerated, update `LINES`, `LINE_DURS`
and the word cues to match.
