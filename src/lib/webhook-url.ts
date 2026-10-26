// Only real Discord webhook URLs may be stored: the app POSTs to whatever is
// saved, so an arbitrary URL would be a server-side request to anywhere.
const WEBHOOK_RE =
	/^https:\/\/(?:(?:ptb|canary)\.)?(?:discord\.com|discordapp\.com)\/api(?:\/v\d+)?\/webhooks\/\d{5,25}\/[\w-]{20,120}(?:\?thread_id=\d{5,25})?$/;

export function isDiscordWebhookUrl(value: string): boolean {
	return WEBHOOK_RE.test(value.trim());
}

/** "https://discord.com/api/webhooks/123/abc…" → "discord.com/…/123/•••" for display. */
export function maskWebhookUrl(value: string): string {
	const match = value.match(/webhooks\/(\d+)\//);
	return match ? `discord webhook ${match[1]} •••` : "•••";
}
