# NextQuest videos

Upload-ready masters for YouTube (or anywhere else), with metadata you can paste
straight into the upload form. The sources that generate each video live in
[`../animation`](../animation) (hand-drawn tour) and [`../reel`](../reel) (motion reel).

| File | What it is | Spec |
| --- | --- | --- |
| `nextquest-reel-1080p60.mp4` | 15-second motion-graphics reel | 1920×1080, 60 fps, H.264 High, AAC 320 kbps / 48 kHz |
| `nextquest-reel-thumbnail.jpg` | Thumbnail for the reel | 1280×720 JPEG |
| `nextquest-tour-handdrawn-1080p.mp4` | 47-second hand-drawn animated tour | 1920×1080, 30 fps, H.264 High ≈10 Mbps, AAC 384 kbps / 48 kHz |
| `nextquest-tour-handdrawn-thumbnail.jpg` | Thumbnail for the tour | 1280×720 JPEG |
| `nextquest-tour-handdrawn.en.srt` | English captions for the tour (narration timings) | SubRip |

Both masters meet YouTube's recommended upload settings for SDR 1080p
(progressive, `yuv420p`, `+faststart`, 48 kHz stereo AAC).

---

## 1. NextQuest — 15-second reel

**Title**

```
NextQuest in 15 seconds — the backlog app for your gaming group
```

**Description**

```
Your group's backlog has 247 games. Which one's next?

NextQuest is a free, open-source web app for one gaming group: a shared backlog
for video games, tabletop RPGs and board games.

01 Propose — paste a Steam or BoardGameGeek link; effort is sized from
   HowLongToBeat playtime, difficulty and acclaim.
02 Vote — everyone gets ten secret votes. Only group totals are ever shown.
03 Pick — the picker blends interest, time fit and who's around tonight.
04 Play — availability polls, RSVPs, and a burn-up chart that shows the pile
   actually shrinking.

Stop scrolling the backlog. Start playing it.

Source: https://github.com/LightningMarshal/NextQuest
Animation and music were generated in code (HTML/CSS 3D + Web Audio).
```

**Tags:** `NextQuest, game backlog, gaming group, board games, TTRPG, D&D group, game night, what to play next, open source, self-hosted`

**Category:** Gaming · **Shorts:** this is 16:9; YouTube will treat it as a regular video, not a Short.

---

## 2. NextQuest — hand-drawn tour (47 s)

**Title**

```
NextQuest: stop scrolling the backlog, start playing it (animated tour)
```

**Description**

```
Every gaming group has one: the backlog. Video games, tabletop campaigns,
board games… all waiting for someday.

NextQuest is your party's shared quest board:
• Drop in any game and it sizes up the effort (hours, difficulty, acclaim)
• Everyone gets ten secret votes — no peer pressure, no hurt feelings
• The picker weighs interest, time and who's around tonight
• Paint the times that work, RSVP, and watch the burn-up chart shrink the pile

0:00 The backlog
0:10 Meet NextQuest: propose a game
0:20 Secret votes and the picker
0:30 Scheduling, burn rate and the finish

Source: https://github.com/LightningMarshal/NextQuest
Every line, note and sound effect in this short was drawn and synthesized in
plain JavaScript. Narration: Kokoro TTS.
```

The chapter list satisfies YouTube's rules (starts at 0:00, at least three
chapters, each at least 10 seconds). Upload `nextquest-tour-handdrawn.en.srt`
under **Subtitles → Upload file → With timing**.

**Tags:** `NextQuest, game backlog, gaming group, board games, TTRPG, game night, animation, hand-drawn animation, open source`

**Category:** Gaming

---

### Regenerating

```bash
# tour (from promo/animation)
node build.mjs && CRF=12 ABR=384k FFMPEG=ffmpeg node render.mjs ../videos/nextquest-tour-handdrawn-1080p.mp4 30
# reel (from promo/reel)
node build.mjs && FFMPEG=ffmpeg node render.mjs ../videos/nextquest-reel-1080p60.mp4 60
```
