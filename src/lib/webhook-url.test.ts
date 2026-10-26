import { describe, expect, it } from "vitest";

import { isDiscordWebhookUrl, maskWebhookUrl } from "./webhook-url";

const good = "https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-abc";

describe("isDiscordWebhookUrl", () => {
	it("accepts Discord webhook URLs", () => {
		expect(isDiscordWebhookUrl(good)).toBe(true);
		expect(isDiscordWebhookUrl(good.replace("discord.com", "discordapp.com"))).toBe(true);
		expect(isDiscordWebhookUrl(`${good}?thread_id=123456789012345678`)).toBe(true);
	});
	it("rejects everything else (no SSRF via saved URLs)", () => {
		expect(isDiscordWebhookUrl(good.replace("https", "http"))).toBe(false);
		expect(isDiscordWebhookUrl("https://discord.com.evil.example/api/webhooks/1234567/abcdefghijklmnopqrstuv")).toBe(false);
		expect(isDiscordWebhookUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
		expect(isDiscordWebhookUrl(`${good}?wait=true&x=1`)).toBe(false);
	});
	it("masks for display", () => {
		expect(maskWebhookUrl(good)).toBe("discord webhook 123456789012345678 •••");
	});
});
