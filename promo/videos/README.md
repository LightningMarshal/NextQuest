# NextQuest videos

Upload-ready masters for YouTube (or anywhere else), with metadata you can paste
straight into the upload form. The reel's source lives in [`../reel`](../reel).

| File | What it is | Spec |
| --- | --- | --- |
| `nextquest-reel-1080p60.mp4` | 15-second motion-graphics reel, silent | 1920×1080, 60 fps, H.264 High, no audio track |
| `nextquest-reel-thumbnail.jpg` | Thumbnail for the reel | 1280×720 JPEG |

The reel is published without sound for now: four soundtrack attempts
didn't land, so audio is paused. A 70-second narrated walkthrough is built
but parked too. What exists and how to pick either back up is in
[docs/plans/promo-future-work.md](../../docs/plans/promo-future-work.md).
The hand-drawn tour that used to live here showed the pre-2026 design and
was retired; git history keeps it.

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
Animated in code (HTML/CSS 3D), rendered frame by frame.
```

**Tags:** `NextQuest, gaming group, game night, Discord, LFG, looking for group, board games, TTRPG, D&D group, open source, self-hosted`

**Category:** Gaming · **Shorts:** this is 16:9; YouTube will treat it as a regular video, not a Short.

---

### Regenerating

```bash
# reel (from promo/reel)
node build.mjs && SILENT=1 FFMPEG=ffmpeg node render.mjs ../videos/nextquest-reel-1080p60.mp4 60
```
