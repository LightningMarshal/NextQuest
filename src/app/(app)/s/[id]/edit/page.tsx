import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SessionForm } from "@/components/sessions/session-form";
import { isUuid } from "@/lib/ids";
import { canManageSession } from "@/lib/sessions";
import { requireMember } from "@/server/session";
import { getPickableGames, getSessionDetail } from "@/server/sessions-read";

export const metadata: Metadata = { title: "Edit session" };

export default async function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const user = await requireMember(`/s/${id}/edit`);
	if (!isUuid(id)) notFound();
	const [session, games] = await Promise.all([getSessionDetail(user, id), getPickableGames()]);
	if (!session) notFound();
	// Host or admin only; everyone else just sees the session.
	if (!canManageSession(session, user) || session.status !== "scheduled") redirect(`/s/${id}`);

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<h1 className="font-display text-3xl font-semibold tracking-tight">Edit session</h1>
			<SessionForm
				games={games}
				sessionId={id}
				initial={{
					gameId: session.gameId,
					title: session.title,
					startsAt: session.scheduledAt.toISOString(),
					durationMinutes: session.durationMinutes,
					visibility: session.visibility,
					capacity: session.capacity,
					location: session.location ?? "",
					joinUrl: session.joinUrl ?? "",
					notes: session.notes ?? "",
					venue: session.venue,
				}}
			/>
		</div>
	);
}
