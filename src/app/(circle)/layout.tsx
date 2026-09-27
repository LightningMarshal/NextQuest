import { AppShell } from "@/components/app-shell";
import { getSessionUser, isCircle } from "@/server/session";

// Guest-visible pages (home, sessions, a session's own page). Unlike (app),
// this layout does NOT redirect: a layout can't know the URL, and a
// Discord deep link must survive the sign-in round trip. So EVERY page in
// this group gates itself with requireCircleUser("<its own path>") —
// enforced by src/app/(circle)/gates.test.ts. The layout only decides
// whether to draw the app frame.
export const dynamic = "force-dynamic";

export default async function CircleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	const user = await getSessionUser();
	if (!user || !isCircle(user)) return <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>;
	return <AppShell user={user}>{children}</AppShell>;
}
