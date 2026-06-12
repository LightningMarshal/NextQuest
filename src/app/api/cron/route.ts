import { getCloudflareContext } from "@opennextjs/cloudflare";

import { sendEventReminders } from "@/server/cron/event-reminders";
import { refreshStaleMetadata } from "@/server/cron/metadata-refresh";

// Cron task dispatcher. The worker's `scheduled` handler (custom-worker.ts)
// self-fetches this route so cron work runs inside a normal request context
// where getDb(), getAppSettings(), and notifyDiscord() all work unchanged —
// and every task can be exercised with curl in dev.
//
// This route lives outside the (app) auth gate, so the shared-secret check
// MUST stay first.

export const dynamic = "force-dynamic";

// Tasks return a JSON-serializable summary.
const TASKS: Record<string, () => Promise<Record<string, number>>> = {
	"refresh-metadata": refreshStaleMetadata,
	"event-reminders": sendEventReminders,
};

export async function GET(request: Request): Promise<Response> {
	const { env } = getCloudflareContext();
	const secret = (env as { CRON_SECRET?: string }).CRON_SECRET;
	if (!secret || request.headers.get("x-cron-secret") !== secret) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const task = new URL(request.url).searchParams.get("task") ?? "";
	const run = TASKS[task];
	if (!run) {
		return Response.json({ error: `unknown task: ${task}` }, { status: 400 });
	}

	try {
		const summary = await run();
		return Response.json({ task, ...summary });
	} catch (error) {
		// 200 on handled failure: Cloudflare retries non-2xx cron fetches and
		// none of these tasks benefit from a retry storm.
		console.warn(`cron task ${task} failed`, error);
		return Response.json({ task, error: "failed" });
	}
}
