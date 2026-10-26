# NextQuest reel

A 15-second motion-graphics spot for NextQuest, built to sit at the top of the
repo README and to go on YouTube: the app's own dark "Nova" palette, true 3D
perspective UI, kinetic typography, and every cut landing on a 120 BPM beat.

- **Watch:** [`../videos/nextquest-reel-1080p60.mp4`](../videos/nextquest-reel-1080p60.mp4) (1080p60, sound on)
- **Play in a browser:** `dist/nextquest-reel.html` (single self-contained file)
- **README preview:** `dist/nextquest-reel-preview.webp` (silent, looping, 960×540)

## Structure (120 BPM, 0.5 s per beat)

Updated in 2026-10 for the sessions-first redesign (Phase 24).

| Time | Beat | What happens |
| --- | --- | --- |
| 0.0–1.5 s | 0–3 | A laser line splits the dark; a 3D wall of group-chat messages ("anyone on tonight?", "link?", "sorry just saw this") tilts in while a counter rolls to **99+ unread in the group chat** |
| 1.5–3.5 s | 3–7 | **ANYONE / UP FOR / A GAME / TONIGHT?** One word per beat, hard cuts, RGB-split hits, the wall accelerating, then imploding |
| 3.5–4.5 s | 7–9 | Impact. The chevron mark draws, the wordmark rises, *play more games with more people*, then the camera zooms through the mark |
| 4.5–12.5 s | 9–25 | Four 2-second features, each a headline plus a live 3D panel modelled on the app's components: **01 Post** (game, the *Tonight 8pm* chip, *Open to the circle*, posted), **02 Discord** (the session card edited in place as Drew, Sam and Riley join, then the one-hour reminder), **03 Join** (This week, a guest arriving from an invite link, *I'm in*), **04 Wrap up** (who came, stars, one line, same time next week) |
| 12.5–13.5 s | 25–27 | The four panels fan out in 3D: **VIDEO GAMES / TTRPGS / BOARD GAMES / ANY NIGHT.** |
| 13.5–15 s | 27–30 | Final impact and lockup: logo, *Play more games with more people.*, repo URL |

The panels use the app's own typefaces (Space Grotesk, Hanken Grotesk,
JetBrains Mono) and colours; Unbounded is reserved for the reel's kinetic type.

## How it's built

```
index.html          stage, all styles (fonts: Unbounded, Space Grotesk, Hanken
                    Grotesk, JetBrains Mono; all OFL)
src/reel.js         DOM construction + render(t): a pure function of time, no CSS
                    transitions, so playback and the frame export are identical
src/reel-audio.js   120 BPM procedural electronic score: FM glass and metal
                    tones, micro-percussion (ticks, rims, a round kick) in a
                    syncopated 3-3-2 groove, a restrained pulse bass, short
                    motifs through a ping-pong echo, breaths before the logo
                    and the end card; every UI moment on screen has its own
                    accent (typing ticks, FM blips, glass confirms, data
                    bursts). Instruments live in ../shared/dsp.js, shared
                    with the walkthrough
src/player.js       realtime player and the window.REEL export hooks
build.mjs           inline everything into dist/nextquest-reel.html
render.mjs          screenshot every frame with Playwright → ffmpeg → MP4
```

```bash
node build.mjs
FFMPEG=ffmpeg node render.mjs ../videos/nextquest-reel-1080p60.mp4 60
```

The panels are hand-built in HTML to look like the app, so they need updating
when the UI changes. The longer [walkthrough](../walkthrough) avoids that by
filming the real app.

The games (*Starfall Salvage*, *Gloomkeep*) and people are fictional, so the
reel can be posted anywhere without third-party artwork.
