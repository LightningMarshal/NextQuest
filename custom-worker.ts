// Custom worker entry (wrangler.jsonc "main"): wraps the OpenNext-generated
// handler to add a `scheduled` export — @opennextjs/cloudflare has no cron
// support of its own. Pattern from the OpenNext "custom worker" howto;
// .open-next/ stays build output and is never hand-edited.
//
// The ./.open-next imports only exist after `opennextjs-cloudflare build`,
// so they're @ts-ignore'd (and this file is tsconfig-excluded) to keep
// `npm run typecheck` working on a fresh clone. Wrangler bundles this file
// with esbuild regardless.
//
// The scheduled handler runs OUTSIDE OpenNext's request context, where
// getCloudflareContext()/getDb() don't work — so it stays thin and
// self-fetches /api/cron (secret-gated) through the WORKER_SELF_REFERENCE
// service binding, putting the real work inside a normal Next request.
// @ts-ignore — build output, may be absent
import handler from "./.open-next/worker.js";

const CRON_TASKS: Record<string, string> = {
	"0 6 * * *": "refresh-metadata",
	"0 * * * *": "event-reminders",
};

export default {
	fetch: handler.fetch,
	async scheduled(event, env, ctx) {
		const secret = (env as { CRON_SECRET?: string }).CRON_SECRET;
		if (!secret) return; // unconfigured → no-op, like DISCORD_WEBHOOK_URL
		const task = CRON_TASKS[event.cron];
		const self: Fetcher | undefined = env.WORKER_SELF_REFERENCE;
		if (!task || !self) return;
		ctx.waitUntil(
			self.fetch(`https://stooge-log.internal/api/cron?task=${task}`, {
				headers: { "x-cron-secret": secret },
			})
		);
	},
} satisfies ExportedHandler<CloudflareEnv>;

// @ts-ignore — build output, may be absent
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
