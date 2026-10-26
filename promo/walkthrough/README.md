# NextQuest walkthrough

A 70-second narrated walkthrough of NextQuest, filmed from the **real app**:
every phone and desktop screen is a screenshot of the running app on seeded
demo data, and every Discord card is built by the app's own embed builder
(`src/lib/discord-embed.ts`). It replaces the hand-drawn tour, which went
stale when the sessions-first redesign shipped. When the UI changes again,
re-run the pipeline below and the video follows; only the timeline in
`src/walk.js` may need nudging.

The demo group plays real multiplayer hits (Helldivers 2, Deep Rock
Galactic, Lethal Company, Baldur's Gate 3, Elden Ring, Valheim…) with their
Steam artwork, as the owner asked.

## Chapters

| Time | Chapter | What's on screen |
| --- | --- | --- |
| 0:00 | The group chat | A 3D wall of unanswered messages, 99+ unread, *Anyone on tonight?*, the logo |
| 0:10 | Post in three taps | Phone: Home → composer (Helldivers 2, **Tonight 8pm**, **Open to the circle**) → posted |
| 0:22 | Discord keeps up | The real embed, edited in place as Drew and Jordan join; the one-hour reminder |
| 0:34 | Friends hop in | Phone, as a guest: invite link → Continue with Discord → This week → **I'm in** → Add to calendar; the card updates to 4/4 |
| 0:48 | Wrap up in ten seconds | Phone: who came, stars, one line, same time next week, with a stopwatch; Recently played |
| 1:00 | Everything around it | Desktop: Library, *I'd play this*, find-a-time poll, stats; end card |

Narration: Kokoro v1.0 (local, no API), a blend of the `am_onyx` and
`am_fenrir` voices. Music: a half-time cut of the reel's phonk/trap cue
(same pitched-cowbell hook and 808), ducked under the voice, plus UI sound
design driven by the picture's own taps, swaps and Discord edits.

## Pipeline

```
seed-promo.ts          demo group: 8 people, 20 real games, 15 sessions at fixed
                       offsets from now, a poll, "I'd play this" marks, an invite
capture/auth.mjs       signs demo users in by minting a Better Auth session cookie
capture/art.mjs        downloads the game art into art-cache/ and serves it to the
                       capture browser (both direct and /_next/image requests)
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
4. **Art.** `node promo/walkthrough/capture/art.mjs` downloads every game's
   header and cover from Steam into `art-cache/` (git-ignored). It needs
   network access to `cdn.cloudflare.steamstatic.com`; a capture without the
   cache still works but shows empty art frames, and says so.
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

To change the narration, edit `narration/lines.json` and run
`narration/generate.py`, then check the cue times in `src/walk.js` (`CUES`)
against the new clip lengths.
