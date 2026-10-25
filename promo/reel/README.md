# NextQuest reel

A 15-second motion-graphics spot for NextQuest, built to sit at the top of the
repo README and to go on YouTube. Where the [hand-drawn tour](../animation) is
whimsical, this one is precise: the app's own dark "Nova" palette, true 3D
perspective UI, kinetic typography, and every cut landing on a 120 BPM beat.

- **Watch:** [`../videos/nextquest-reel-1080p60.mp4`](../videos/nextquest-reel-1080p60.mp4) (1080p60, sound on)
- **Play in a browser:** `dist/nextquest-reel.html` (single self-contained file)
- **README preview:** `dist/nextquest-reel-preview.webp` (silent, looping, 960×540)

## Structure (120 BPM, 0.5 s per beat)

| Time | Beat | What happens |
| --- | --- | --- |
| 0.0–1.5 s | 0–3 | A laser line splits the dark; a 3D wall of game covers tilts in while a counter rolls to **247 games in your group's backlog** |
| 1.5–3.5 s | 3–7 | **WHAT / DO WE / PLAY / NEXT?** One word per beat, hard cuts, RGB-split hits, the wall accelerating, then imploding |
| 3.5–4.5 s | 7–9 | Impact. The chevron mark draws, the wordmark rises letter by letter, a light sweep, then the camera zooms through the mark |
| 4.5–12.5 s | 9–25 | Four 2-second features, each a headline plus a live 3D app panel: **01 Propose** (search, metadata, effort stamped 29), **02 Vote** (10 secret votes, group totals, anonymous), **03 Pick** (scores fill and re-rank, *Gloomkeep* is NEXT UP), **04 Play** (availability heatmap, RSVP toast, burn-up chart to the finish flag) |
| 12.5–13.5 s | 25–27 | The four panels fan out in 3D: **VIDEO GAMES / TTRPGS / BOARD GAMES / ONE BACKLOG.** |
| 13.5–15 s | 27–30 | Final impact and lockup: logo, *Stop scrolling the backlog. Start playing it.*, repo URL |

## How it's built

```
index.html          stage, all styles (fonts: Unbounded, Geist, Geist Mono, OFL)
src/reel.js         DOM construction + render(t): a pure function of time, no CSS
                    transitions, so playback and the frame export are identical
src/reel-audio.js   120 BPM cue (supersaw pads, sidechained sub bass, plucks, drums,
                    risers, impacts) + UI sound design synced to on-screen events;
                    reuses the DSP toolkit in ../animation/src/audio.js
src/player.js       realtime player and the window.REEL export hooks
build.mjs           inline everything into dist/nextquest-reel.html
render.mjs          screenshot every frame with Playwright → ffmpeg → MP4
```

```bash
node build.mjs
FFMPEG=ffmpeg node render.mjs ../videos/nextquest-reel-1080p60.mp4 60
```

The game titles (*Dragon's Peak*, *Gloomkeep*, *Meeple Mayhem*, *Starfall
Salvage* and the cover wall) are fictional, so the reel can be posted anywhere
without third-party artwork.
