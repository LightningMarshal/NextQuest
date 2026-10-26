import { AppShell } from "@/components/app-shell";
import { requireMember } from "@/server/session";

// Members-only: the library, planning, stats, invites, admin. Guests bounce
// to their home; signed out → /sign-in. Session + DB make every page
// per-request — never statically prerendered. Pages that need a precise
// post-sign-in return path call requireMember(path) themselves too.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	const user = await requireMember();
	return <AppShell user={user}>{children}</AppShell>;
}
