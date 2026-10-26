# NextQuest walkthrough

A 70-second narrated walkthrough of NextQuest, filmed from the **real app**:
every phone and desktop screen is a screenshot of the running app on seeded
demo data, and every Discord card is built by the app's own embed builder
(`src/lib/discord-embed.ts`). It replaces the hand-drawn tour, which went
stale when the sessions-first redesign shipped. When the UI changes again,
re-run the pipeline below and the video follows; only the timeline in
`src/walk.js` may need nudging.

The demo group plays twenty fictional games (Starfall Salvage, Hollow Creek,
Gloomkeep, Core Breakers…, listed in `games.json`) with cover art painted in
code by `capture/art.mjs`, so the video contains no third-party titles or
artwork and can be posted anywhere.

## Chapters

| Time | Chapter | What's on screen |
| --- | --- | --- |
| 0:00 | The group chat | A 3D wall of unanswered messages, 99+ unread, *Anyone on tonight?*, the logo |
| 0:10 | Post in three taps | Phone: Home → composer (Starfall Salvage, **Tonight 8pm**, **Open to the circle**) → posted |
| 0:22 | Discord keeps up | The real embed, edited in place as Drew and Jordan join; the one-hour reminder |
| 0:34 | Friends hop in | Phone, as a guest: invite link → Continue with Discord → This week → **I'm in** → Add to calendar; the card updates to 4/4 |
| 0:48 | Wrap up in ten seconds | Phone: who came, stars, one line, same time next week, with a stopwatch; Recently played |
| 1:00 | Everything around it | Desktop: Library, *I'd play this*, find-a-time poll, stats; end card |

Narration: one clip per line in `narration/` (a human voiceover is being
recorded; the placeholder is Kokoro v1.0, a blend of the `am_onyx` and
`am_fenrir` voices). Music: the reel's procedural FM sound (glass and metal
tones, ticks, rims, a round kick, pulse bass) as a lighter bed that keeps
its motif to the gaps between lines and ducks under the voice, plus UI
sound design driven by the picture's own taps, swaps and Discord edits.

## Pipeline

```
games.json             the 20 fictional games: titles, genres, pitches, art specs
seed-promo.ts          demo group: 8 people, 20 games, 15 sessions at fixed
                       offsets from now, a poll, "I'd play this" marks, an invite
capture/auth.mjs       signs demo users in by minting a Better Auth session cookie
capture/art.mjs        paints each game's cover and header into art-cache/ and serves
                       them to the capture browser (direct and /_next/image URLs)
capture/capture.mjs    drives each flow in Playwright at phone (390×844 @3x) and
                       desktop (1440×900 @2x) sizes → captures/*.png + manifest.json
                       (screens, tap boxes, and Discord states after each RSVP)
capture/discord-embeds.ts  the real embed + reminder text for a session
narration/             lines.json (script + captions), generate.py (Kokoro → .ogg)
src/walk.js            the compositor: render(t) is a pure function of time
src/walk-audio.js      narration placement, score, ducking, sound design, master
build.mjs              → build/walkthrough.html (fonts, scripts, data inlined)
render.mjs             frame-stepped export → MP4 + .en.srt captions
```

### Running it

Prerequisites: Postgres 16, the repo's dependencies (`npm ci`), Playwright
with Chromium, and ffmpeg with libx264.

1. **Local app on plain Postgres.** Start Postgres, then
   `SHIM_TARGET=<pg url> npm run db:shim`, with
   `NEON_HTTP_PROXY_ENDPOINT=http://127.0.0.1:4445/sql` in `.dev.vars`
   (see CLAUDE.md). Run `npm run db:migrate`.
2. **Show the Discord sign-in button.** Add placeholder
   `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` values to `.dev.vars`
   (any string; nobody signs in) so the invite page renders *Continue with
   Discord*. Then `npm run dev`.
3. **Seed.** `PROMO_TZ=America/New_York npx tsx promo/walkthrough/seed-promo.ts`.
   The seed places "tonight" and "just ended" relative to the current time in
   `PROMO_TZ`, so capture soon after seeding, and pick a zone where it is
   afternoon (sessions read "Tonight 8:00 PM · in 5h").
4. **Art.** `CHROMIUM=<chrome> node promo/walkthrough/capture/art.mjs` paints
   all 40 images into `art-cache/` (git-ignored) in a few seconds. A capture
   without them still runs but shows empty art frames, and says so.
5. **Capture.** `PROMO_TZ=… CHROMIUM=<chrome> node promo/walkthrough/capture/capture.mjs`
   (about four minutes). It posts a real session, so re-seed before each run.
6. **Build and render.** From `promo/walkthrough`:

   ```bash
   FFMPEG=ffmpeg node build.mjs
   FFMPEG=ffmpeg CHROMIUM=<chrome> node render.mjs ../videos/nextquest-walkthrough-1080p.mp4
   ```

   Open `build/walkthrough.html` in a browser to scrub and play it with sound
   first. The export renders 30 fps (2,100 frames) and writes the captions
   next to the MP4 as `.en.srt`.

To use recorded voiceover, put one take per line in a folder, named by id
(`chat1.wav`, `post1.m4a`…), and run `FFMPEG=ffmpeg python3
narration/import.py <folder>`: it trims, levels and encodes each take over
`narration/<id>.ogg` and flags any line that runs into the next cue. To
change the words, edit `narration/lines.json` (and re-record, or run
`generate.py` for the placeholder voice), then check the cue times in `src/walk.js` (`CUES`)
against the new clip lengths.
