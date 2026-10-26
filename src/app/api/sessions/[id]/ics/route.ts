import { buildCalendar } from "@/lib/ical";
import { isUuid } from "@/lib/ids";
import { appBaseUrl } from "@/server/discord";
import { getSessionUser, isCircle } from "@/server/session";
import { getSessionDetail } from "@/server/sessions-read";
import { getAppSettings } from "@/server/settings";

// One session as a downloadable .ics — works in every calendar app (Google,
// Apple, Outlook). Session-gated like the page itself: a guest can only
// download sessions they can see.

export const dynamic = "force-dynamic";

const VENUE_LABELS: Record<string, string> = { virtual: "Online", in_person: "In person", hybrid: "Online + in person" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	const { id } = await params;
	const user = await getSessionUser();
	if (!user || !isCircle(user)) return new Response("unauthorized", { status: 401 });
	if (!isUuid(id)) return new Response("not found", { status: 404 });
	const session = await getSessionDetail(user, id);
	if (!session) return new Response("not found", { status: 404 });

	const settings = await getAppSettings();
	const url = `${appBaseUrl()}/s/${session.id}`;
	const ics = buildCalendar(
		[
			{
				id: session.id,
				title: session.title,
				startsAt: session.scheduledAt,
				durationMinutes: session.durationMinutes,
				location:
					[session.venue ? VENUE_LABELS[session.venue] : null, session.location, session.joinUrl]
						.filter(Boolean)
						.join(" — ") || null,
				description: [session.notes, `Who's in and how to join: ${url}`].filter(Boolean).join("\n\n"),
				updatedAt: session.createdAt,
				cancelled: session.status === "cancelled",
				url,
			},
		],
		{ name: settings.groupName }
	);
	const filename = session.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "session";
	return new Response(ics, {
		headers: {
			"content-type": "text/calendar; charset=utf-8",
			"content-disposition": `attachment; filename="${filename}.ics"`,
			"cache-control": "private, no-store",
		},
	});
}
