import { redirect } from "next/navigation";

import { isUuid } from "@/lib/ids";

// The old events page split into /sessions (the list), /sessions/new (the
// "plan session with this game" deep link), and /sessions/plan (polls).
export default async function EventsRedirect({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
	const { game } = await searchParams;
	redirect(isUuid(game) ? `/sessions/new?game=${game}` : "/sessions");
}
