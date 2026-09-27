import { eq } from "drizzle-orm";

import { SiteNav } from "@/components/site-nav";
import { TOUR_VERSION_DATE, WelcomeTour } from "@/components/welcome-tour";
import { getDb, schema } from "@/db";
import type { SessionUser } from "@/server/session";
import { getAppSettings } from "@/server/settings";

/**
 * Nav + page frame + welcome tour, shared by the members-only (app) group
 * and the guest-visible (circle) group. Role decides the nav and the tour.
 */
export async function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
	const [settings, [tourRow]] = await Promise.all([
		getAppSettings(),
		// tutorial_seen_at is app-owned, not a Better Auth field, so it isn't
		// on the session — one PK lookup per request is fine at group scale.
		getDb()
			.select({ tutorialSeenAt: schema.user.tutorialSeenAt })
			.from(schema.user)
			.where(eq(schema.user.id, user.id)),
	]);
	const isGuest = user.role === "guest";
	const seen = tourRow?.tutorialSeenAt;

	return (
		<>
			<SiteNav
				user={{
					name: user.name,
					email: user.email,
					image: user.image ?? null,
					isAdmin: user.role === "admin",
					isGuest,
				}}
				groupName={settings.groupName}
			/>
			<main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
			<WelcomeTour
				variant={isGuest ? "guest" : "member"}
				initialOpen={!seen || seen < TOUR_VERSION_DATE}
			/>
		</>
	);
}
