# NextQuest videos

Upload-ready masters for YouTube (or anywhere else), with metadata you can paste
straight into the upload form. The sources that generate each video live in
[`../reel`](../reel) (motion reel) and [`../walkthrough`](../walkthrough)
(narrated walkthrough filmed from the real app).

| File | What it is | Spec |
| --- | --- | --- |
| `nextquest-reel-1080p60.mp4` | 15-second motion-graphics reel | 1920×1080, 60 fps, H.264 High, AAC 320 kbps / 48 kHz |
| `nextquest-reel-thumbnail.jpg` | Thumbnail for the reel | 1280×720 JPEG |
| `nextquest-walkthrough-1080p.mp4` | 70-second narrated walkthrough | 1920×1080, 30 fps, H.264 High, AAC 320 kbps / 48 kHz |
| `nextquest-walkthrough-thumbnail.jpg` | Thumbnail for the walkthrough | 1280×720 JPEG |
| `nextquest-walkthrough.en.srt` | English captions for the walkthrough | SubRip |

> The walkthrough files land here after the art pass: its demo group plays
> real Steam games, and the capture needs network access to Steam's image
> CDN to show their artwork. See [`../walkthrough`](../walkthrough).

The masters meet YouTube's recommended upload settings for SDR 1080p
(progressive, `yuv420p`, `+faststart`, 48 kHz stereo AAC). The hand-drawn
tour that used to live here showed the pre-2026 design and was retired; git
history keeps it.

---

## 1. NextQuest — 15-second reel

**Title**

```
NextQuest in 15 seconds: post a session, friends hop in
```

**Description**

```
"Anyone on tonight?" 99+ unread in the group chat, and still no plan.

NextQuest is a free, open-source web app that helps a gaming group play
more games with more people: video games, tabletop RPGs and board games.

01 Post: pick a game, tap a time, open it to the circle. Three taps.
02 Discord: one card per session, edited in place as people join, plus
   reminders a day and an hour before.
03 Join: invite links and Discord sign-in bring friends-of-friends into
   open sessions. Tap I'm in.
04 Wrap up: who came, how it went, same time next week. Ten seconds.

Play more games with more people.

Source: https://github.com/LightningMarshal/NextQuest
Animation and music were generated in code (HTML/CSS 3D + Web Audio).
```

**Tags:** `NextQuest, gaming group, game night, Discord, LFG, looking for group, board games, TTRPG, D&D group, open source, self-hosted`

**Category:** Gaming · **Shorts:** this is 16:9; YouTube will treat it as a regular video, not a Short.

---

## 2. NextQuest — walkthrough (70 s)

**Title**

```
NextQuest walkthrough: post a game night in three taps, Discord keeps up, friends hop in
```

**Description**

```
Every gaming group has the same problem: 99 messages and still nobody knows
who's on tonight.

NextQuest is a free, open-source web app that helps a gaming group play more
games with more people. This walkthrough is filmed from the real app:

• Post a session in three taps: pick the game, tap a time, choose who can
  join (just the group, or the whole circle).
• Discord gets one live card per session, edited in place as friends join,
  with reminders a day and an hour before.
• Friends-of-friends come in with an invite link or Discord sign-in, see
  your open sessions, tap I'm in, and add it to their calendar.
• Afterwards, a ten-second wrap-up: who came, how it went, same time next week?
• Plus a game library with "I'd play this", find-a-time polls, and stats.

0:00 The group chat problem
0:10 Post a session in three taps
0:22 Discord keeps up
0:34 Friends hop in
0:48 Wrap up in ten seconds
1:00 Library, polls and stats

Source: https://github.com/LightningMarshal/NextQuest
Composited and scored in code from screenshots of the running app (demo
data). Narration: Kokoro TTS. Game names and artwork belong to their
publishers.
```

The chapter list satisfies YouTube's rules (starts at 0:00, at least three
chapters, each at least 10 seconds). Upload `nextquest-walkthrough.en.srt`
under **Subtitles → Upload file → With timing**.

**Tags:** `NextQuest, gaming group, game night, Discord, LFG, looking for group, Helldivers 2, Lethal Company, Deep Rock Galactic, open source, self-hosted`

**Category:** Gaming

---

### Regenerating

```bash
# walkthrough (from promo/walkthrough; seed and capture first, see its README)
FFMPEG=ffmpeg node build.mjs && FFMPEG=ffmpeg node render.mjs ../videos/nextquest-walkthrough-1080p.mp4
# reel (from promo/reel)
node build.mjs && FFMPEG=ffmpeg node render.mjs ../videos/nextquest-reel-1080p60.mp4 60
```
