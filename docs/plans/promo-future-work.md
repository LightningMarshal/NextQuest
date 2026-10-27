# Promo videos: where things stand and what's next

_Written 2026-10-27, when promo work was paused to ship just the graphic._

## Status

| Piece | State | Where |
| --- | --- | --- |
| 15-second reel (picture) | **Published**, silent | `promo/reel/`, `promo/videos/nextquest-reel-1080p60.mp4`, README preview `promo/reel/dist/nextquest-reel-preview.webp` |
| Reel soundtrack | **Paused** after four takes | `promo/reel/src/reel-audio.js` (take 4) |
| 70-second walkthrough | **Built, parked** (needs voiceover and music) | `promo/walkthrough/`, plan in [2026-10-walkthrough-video.md](2026-10-walkthrough-video.md) |
| Hand-drawn tour | Retired (pre-redesign); in git history | — |

Everything is generated in code: `promo/shared/dsp.js` holds the synths both
videos use (an FM kit and an electro kit).

## Reel soundtrack

### What's been tried

| Take | Style | Owner's verdict |
| --- | --- | --- |
| 1 | Whimsical: mallets, chimes | "Pretty good": **almost catchy and matched the motion well**, but the instruments were wrong and it sounded too happy and childish |
| 2 | Phonk/trap: pitched cowbell hook, distorted 808 | Didn't land |
| 3 | Procedural "tech demo": FM glass tones, ticks, clicks | The worst of the four |
| 4 | French electro after Justice's "Genesis": distorted saw-bass riff, stomp, claps, sidechain pump | **Closer**, but **too heavy at around 5 seconds**, where the full beat and riff kick in under the first feature panel |

Takes 1–3 are in git history as `promo/reel/src/reel-audio.js` at commits
0ef6c83, e850b1f and 71f2f54 (take 1 also needs that commit's
`promo/animation/src/audio.js`). Take 4 is the current file.

### The brief (from an interview with the owner)

- **References:** Justice, "Genesis" (leads); Daft Punk, "Derezzed" and "End
  of the Line" (flavour).
- **Keep from take 1:** a hook that's catchy after one listen, and sound that
  follows the motion: a hit for each on-screen moment.
- **Avoid:** happy, cute or childish; take 4's weight once the groove starts.
- **Audience:** gamers and self-hosters, on GitHub, social media and Discord.
- **Constraint:** the picture is fixed on a 120 BPM grid (`TL` in
  `promo/reel/src/reel.js`); the music fits it.
- **How it's made:** in code, preferred. An AI-generated (Suno, Udio) or
  licensed track is an acceptable fallback, but more work for the owner.

### Suggested next step

Start from take 4 and lighten the 4.5 s entry rather than starting over:
let the riff come in alone (no stomp, filtered), bring the kick in under the
second panel and the claps under the third, and keep the full weight for the
fan-out and final drop. Offer two or three riff variations on the same
backing for the owner to pick from. Re-mux with `SILENT` unset (see
`promo/reel/README.md`) and restore "with sound" in the README caption.

## Walkthrough (70 s)

### What's built

Seed → capture → composite → render, all in `promo/walkthrough/` (its
README has the full pipeline):

- A demo group with 20 fictional games and code-painted cover art, so the
  video has no third-party titles or artwork.
- Playwright drives the real app at phone and desktop sizes, and the Discord
  cards come from the app's own embed builder.
- A compositor with phone and browser frames, tap rings, a Discord renderer,
  chapter titles, burned-in captions and a chapter bar.
- An exporter that renders 30 fps MP4 plus `.en.srt` captions and a
  thumbnail.
- YouTube title, description and chapters, drafted in git history
  (`promo/videos/README.md` at commit 71f2f54).

### What's missing

1. **Voiceover.** The owner planned to record it. Takes go in a folder, one
   file per line named by id, then `FFMPEG=ffmpeg python3
   promo/walkthrough/narration/import.py <folder>`. The script is
   `promo/walkthrough/narration/lines.json` (line `post1` now names
   *Starfall Salvage*). A Kokoro placeholder voice is in place until then.
2. **Music.** The bed still uses take 3's FM sound, which was rejected. Redo
   it in whatever style the reel settles on, lighter under the voice.
3. **Final render and publishing.** Render to
   `promo/videos/nextquest-walkthrough-1080p.mp4`, add it to
   `promo/videos/README.md` with the YouTube metadata, and link it from the
   README caption.

### Gotchas when resuming

- **Placeholder Discord sign-in:** the invite page only shows *Continue with
  Discord* if `.dev.vars` has placeholder `DISCORD_CLIENT_ID` and
  `DISCORD_CLIENT_SECRET`. Restart `npm run dev` after adding them.
- **Seed in an afternoon timezone:** seed with a `PROMO_TZ` where it is
  currently afternoon and capture straight away. After 8 pm local, the
  composer's *Tonight 8pm* chip disappears and the capture fails.
- **Art first:** run `capture/art.mjs` before capturing, or the art frames
  come out empty.
- **Re-seed between captures:** the capture posts a real session, so re-seed
  before each run.

## Ideas not started

- A 30-second vertical cut (9:16) for Shorts and TikTok from the phone
  captures. The owner said "not now".
- A single `npm run promo:walkthrough` command for seed → capture → render.
