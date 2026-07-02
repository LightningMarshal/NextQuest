# 06 — Discord notifications (optional)

> [!NOTE]
> **This whole chapter is optional.** If your group doesn't use Discord —
> or you just want to set it up later — skip to
> [chapter 07](07-run-it-on-your-computer.md). With no webhook configured,
> the app works fully and simply doesn't post notifications.

When configured, the app posts to one Discord channel
([what's a webhook? →](01-what-you-are-about-to-do.md#what-is-a-webhook)):

- 🎮 someone proposes a game
- ▶️ / 🏆 a game is started or finished
- 📈 a game's vote total hits a milestone
- 📅 a session is scheduled
- 🔔 / ⏰ reminders ~24 hours and ~1 hour before each session
  (these two need the scheduled jobs from chapter 08's `CRON_SECRET` —
  the rest work regardless)

## Create the webhook

You need to be an admin (or have "Manage Webhooks" permission) on the
Discord **server** in question.

1. Open Discord and go to the server.
2. Hover the **channel** the bot messages should appear in (e.g.
   `#gaming`) and click the **gear icon** (Edit Channel).
3. In the channel settings, open **Integrations** → **Webhooks**.
4. Click **New Webhook**. Discord creates one with a random name.
5. Click it to expand, rename it to something like `NextQuest` (this is
   the name the messages will appear under), and optionally give it an
   avatar.
6. Click **Copy Webhook URL**. It looks like:

   ```
   https://discord.com/api/webhooks/1234567890/AbCdEfGh…
   ```

7. Click **Save Changes** if Discord shows the save bar.

> [!WARNING]
> Anyone with this URL can post arbitrary messages into your channel.
> Don't share it; if it leaks, delete the webhook in the same settings
> screen and create a fresh one.

## Write this down

> [!IMPORTANT]
> In your scratch note, record:
>
> - **Discord webhook URL** — the full `https://discord.com/api/webhooks/…`
>   line.

---

[← 05 — Google sign-in](05-google-sign-in.md) · [Index](README.md) · Next: [07 — Run it on your computer →](07-run-it-on-your-computer.md)
