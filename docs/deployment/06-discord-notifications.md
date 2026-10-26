# 06 — Discord: session cards and sign-in (optional)

> [!NOTE]
> **This whole chapter is optional.** If your group doesn't use Discord —
> or you just want to set it up later — skip to
> [chapter 07](07-run-it-on-your-computer.md). With no webhook configured,
> the app works fully and simply doesn't post notifications.

Discord does two jobs for NextQuest, each optional:

1. **Session cards** via webhooks
   ([what's a webhook? →](01-what-you-are-about-to-do.md#what-is-a-webhook)):
   every session gets one card — when, game, host, where, who's in — and
   the app **edits that same card** as people join or plans change. Plus:
   - 🔔 / ⏰ reminders ~24h and ~1h before, with who's in (needs the
     scheduled jobs from chapter 08's `CRON_SECRET`)
   - 📝 a "how did it go?" nudge after a session ends
   - 🎮 / 🏆 game news (added, started, finished) — group server only
2. **Discord sign-in** for your wider circle: people in the Discord servers
   you choose can sign in with Discord and join **open** sessions as guests.

You can connect **several** servers. Each webhook is either *Everything*
(your group's own server) or *Open sessions only* (a wider server that should
only see sessions you mark open).

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

## Where the webhook URL goes

**Easiest:** once the app is deployed, open **Admin → Discord**, paste the
URL, pick *Everything* or *Open sessions only*, and press **Test** — a
hello message should appear in the channel. Repeat for each server.

(Alternatively, the `DISCORD_WEBHOOK_URL` secret works as one *Everything*
webhook — handy if you're setting everything up before the first deploy.)

## Optional: Discord sign-in for your wider circle

1. Go to <https://discord.com/developers/applications> → **New
   Application** → name it `NextQuest`.
2. Open **OAuth2**. Copy the **Client ID**, click **Reset Secret** and copy
   the **Client Secret**.
3. Under **Redirects**, add
   `https://<your app address>/api/auth/callback/discord` (and
   `http://localhost:3000/api/auth/callback/discord` for local testing).
   Save.
4. Get each server's id: in Discord, **User Settings → Advanced →
   Developer Mode** on; then right-click the server icon → **Copy Server
   ID**.

Anyone who signs in with Discord **and** is in one of those servers comes
in as a guest (open sessions only). Anyone else lands on the application
page like a Google sign-in would.

## Write this down

> [!IMPORTANT]
> In your scratch note, record whichever you set up:
>
> - **Discord webhook URL(s)** — `https://discord.com/api/webhooks/…`
> - **DISCORD_CLIENT_ID** and **DISCORD_CLIENT_SECRET**
> - **DISCORD_GUILD_IDS** — server ids, comma-separated

---

[← 05 — Google sign-in](05-google-sign-in.md) · [Index](README.md) · Next: [07 — Run it on your computer →](07-run-it-on-your-computer.md)
