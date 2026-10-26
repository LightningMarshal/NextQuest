# Plan: replace the hand-drawn tour with a real-app walkthrough

Status: **built** (2026-10); the pipeline lives in `promo/walkthrough/`.
The final master waits on the owner's voiceover (see "Decisions" at the end).

## Why the hand-drawn tour has to go

The 47-second tour (`promo/animation`, `promo/videos/nextquest-tour-handdrawn-1080p.mp4`)
was made before the Phase 24 redesign. Most of its runtime now describes
features that are retired or demoted:

| Tour beat | Status after Phase 24 |
| --- | --- |
| The backlog mountain, "effort" stamped on a game | Effort is frozen history behind a legacy chart on /stats |
| Ten secret votes each, curtain over the jars | Budget voting retired; public "I'd play this" replaced it |
| The picker names what's next | Picker retired |
| Paint the times that work, RSVP | Survives as **find-a-time**, now the secondary path |
| Burn-up chart shrinks the mountain | Legacy chart only |
| *Not shown at all* | Sessions-first home, the 3-tap composer, Discord cards edited in place, the guest circle and invite links, the ten-second wrap-up |

Re-drawing it would fix the content but not the real problem: a
hand-animated mock of the UI drifts every time the app changes. This is
the second time a promo has gone stale in a month.

## Recommendation: a narrated walkthrough filmed from the real app

A **70-second narrated product walkthrough** whose screens come from the
running app on seeded demo data, captured automatically by a script and
composited with the reel's motion language (the same dark "Nova" look,
kinetic captions and 3D device frames). The 15-second reel stays as the
hook; the walkthrough is the "how it actually works" piece for a group
deciding to adopt NextQuest, and for guests arriving from a Discord link.

Why this format:

- **Truthful by construction.** Every frame is the real UI, so it can't
  advertise retired features.
- **Re-shootable.** When the design changes again, re-run seed → capture →
  render and the video updates. The motion and edit stay; only screenshots
  change.
- **Phone-first.** The redesign is built for phones, so the video shows a
  phone for posting and joining and a desktop for the library and stats,
  and can cut down to a vertical short from the same captures.
- **A clear contrast with the reel.** The reel is kinetic and abstract;
  this is calm, narrated and concrete.

### Alternatives considered

| Option | Verdict |
| --- | --- |
| Re-draw the hand-drawn tour with the new story | Charming, but every UI change breaks it again; mocks drift. |
| Extend the 15 s reel to 60 s | Same mock-UI drift problem; a long kinetic piece fatigues. |
| Raw screen recording (Playwright `recordVideo`) | Truthful but low quality (VP8, uneven frame pacing) and no polish. |
| **Real screenshots, composited and narrated (recommended)** | Truthful, re-shootable, polished. |

## Storyboard (≈70 s, five chapters, each ≥ 10 s for YouTube)

| Time | Chapter | Screens (real captures) | Narration (draft) |
| --- | --- | --- | --- |
| 0:00–0:10 | The group chat | Short reel-style open: chat-message wall, "anyone on tonight?", logo | "Every group chat has the same question: anyone on tonight? NextQuest answers it." |
| 0:10–0:24 | Post in three taps | Phone: `/sessions/new` (game picked, **Tonight 8pm** chip, **Open to the circle**), then the Home card | "Pick a game, tap a time, choose who can join. You're in automatically, and it's posted." |
| 0:24–0:36 | Discord keeps up | The real embed from `src/lib/discord-embed.ts` rendered in a Discord-style frame; the "In" field updates; the one-hour reminder | "Discord gets one card for the session, and the app edits that same card as people join. Reminders go out a day and an hour before." |
| 0:36–0:50 | Friends hop in | Phone: `/invite/[token]` → guest Home (open sessions only) → session page `/s/[id]` → **I'm in**, Add to calendar | "Invite links and Discord sign-in bring friends-of-friends in as guests. They see open sessions, tap I'm in, and add it to their calendar." |
| 0:50–1:02 | Wrap up in ten seconds | Session page after it ends: who came (pre-ticked), stars, one line, **same time next week**; a "Recently played" card on Home | "Afterwards: who came, how it went, same time next week? Ten seconds. Forget, and it closes itself after two days." |
| 1:02–1:10 | Everything around it | Desktop montage: Library with "I'd play this", a find-a-time poll, `/stats` and the year in review; end card | "Plus a game library, find-a-time polls, and stats for your group. NextQuest: play more games with more people." |

About 150 words of narration at a calm pace leaves room for the visuals.

## Production pipeline

All of it lives in `promo/walkthrough/` and reuses the reel and tour tooling.

1. **Demo data: a `promo` fixture for the seed.** Add a `--promo` mode to
   `scripts/seed.ts` with fictional games (Starfall Salvage, Gloomkeep,
   Meeple Mayhem…) and generated cover art, so a public video contains no
   third-party artwork or trademarks. Sessions are placed at fixed offsets
   from the capture time (one live, one tonight, one Saturday, one that
   just ended, a few played), plus an open poll, "I'd play this" marks,
   ratings, a guest, and a live invite link.
2. **Run the app locally on plain Postgres.** Postgres 16 is available in
   the cloud container. Use `SHIM_TARGET=<pg url> npm run db:shim` with
   `NEON_HTTP_PROXY_ENDPOINT` in `.dev.vars` (see CLAUDE.md), then
   `npm run db:migrate`, `npm run seed -- --reset --promo`, and `npm run dev`.
3. **Sign-in without Google.** Demo users can't use OAuth. The capture
   script inserts a Better Auth session row for the demo member (and one
   for the guest) and sets the session cookie in Playwright. This is
   dev-only; nothing ships to the app.
4. **Scripted capture.** A Playwright script visits each page at phone
   (390×844 @3x) and desktop (1440×900 @2x) sizes, drives the real
   interactions (choose a chip, tap I'm in, tick wrap-up boxes), and saves
   a PNG per state. Discord frames come from calling the real embed
   builder and rendering its JSON in a Discord-style template, so field
   names and colours always match production.
5. **Composite.** Reuse the reel engine (`render(t)` as a pure function of
   time; CSS 3D device frames; frame-stepped export). Add capture-aware
   moves: slow push-ins, cross-dissolves between states, a tap ripple
   where the script clicked (coordinates saved alongside each PNG), and
   kinetic chapter titles.
6. **Narration and captions.** Kokoro v1.0 runs locally (no API spend),
   with the same voice as the tour (`af_heart`) or a calmer one. Generate
   line by line, use the pause analysis for word cues, and run an ASR
   check on the final mix, as before. Export an `.srt`.
7. **Music.** A calmer 100 BPM variant of the reel's cue (same DSP
   toolkit), ducked under narration.
8. **Outputs** in `promo/videos/`: a 1080p60 master, a thumbnail, captions,
   YouTube metadata with chapters; optionally a **30 s vertical cut**
   (1080×1920) for Shorts from the phone captures.
9. **Re-shoot command.** One script, `npm run promo:walkthrough`, runs seed
   → capture → render, so the next redesign is a re-run, not a rebuild.

Rough effort: about one long working session to build the pipeline and a
first cut, then short review loops.

## Retiring the hand-drawn tour

When the walkthrough ships:

- Remove the tour link from the README caption and point it at the walkthrough.
- Delete `promo/videos/nextquest-tour-handdrawn-*` (61 MB; history keeps
  it) or move the tour to `promo/archive/` with a note that it shows the
  pre-2026 design.
- Keep `promo/animation/` source as the archive (its audio DSP toolkit is
  shared by the reel), or extract the shared DSP into `promo/shared/`
  first and then archive the rest.

Until then, the README caption still links the tour. If you'd rather not
point people at retired features in the meantime, removing that link is a
one-line change.

## Decisions (owner, 2026-10)

1. **Length:** 70 seconds, five chapters plus the open.
2. **Voice:** the owner records the voiceover; a Kokoro placeholder
   (`am_onyx` blended with `am_fenrir`) holds its place.
3. **Games:** first real multiplayer hits with Steam art; Steam's CDN was
   unreachable from the build container, so the owner switched to
   **fictional demo games** with art painted in code (`games.json`,
   `capture/art.mjs`). No third-party titles or artwork, so no copyright
   questions later.
4. **Vertical cut:** not now.
5. **Old tour:** deleted (`promo/animation/` and its videos; git history
   keeps them). Its DSP toolkit moved to `promo/shared/dsp.js` first.

What changed from the plan above: the seed is a separate promo fixture
(`promo/walkthrough/seed-promo.ts`) rather than a `--promo` flag on
`scripts/seed.ts`; the export is 30 fps; the music is a half-time cut of the
reel's procedural FM cue rather than a 100 BPM variant; and the invite page is
captured with placeholder Discord OAuth values so it shows the real
*Continue with Discord* button.
