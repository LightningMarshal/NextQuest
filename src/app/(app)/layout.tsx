import { eq } from "drizzle-orm";

import { SiteNav } from "@/components/site-nav";
import { WelcomeTour } from "@/components/welcome-tour";
import { getDb, schema } from "@/db";
import { requireApprovedUser } from "@/server/session";
import { getAppSettings } from "@/server/settings";

// Everything in this group is members-only: signed out → /sign-in,
// signed in but not approved → /pending-approval. Session + DB access make
// these pages inherently per-request — never statically prerendered.
export const dynamic = "force-dynamic";

export default async function AppLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const user = await requireApprovedUser();
	const settings = await getAppSettings();
	// tutorial_seen_at is app-owned, not a Better Auth field, so it isn't on
	// the session — one indexed-PK lookup per request is fine at group scale.
	const [tourRow] = await getDb()
		.select({ tutorialSeenAt: schema.user.tutorialSeenAt })
		.from(schema.user)
		.where(eq(schema.user.id, user.id));

	return (
		<>
			<SiteNav
				user={{
					name: user.name,
					email: user.email,
					image: user.image ?? null,
					isAdmin: user.role === "admin",
				}}
				groupName={settings.groupName}
			/>
			<main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
			{/* Auto-opens exactly once per member (issue #13); the user-menu
			    "Replay the tour" re-opens it via a window event. */}
			<WelcomeTour initialOpen={tourRow?.tutorialSeenAt == null} />
		</>
	);
}
