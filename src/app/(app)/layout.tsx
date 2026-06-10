import { SiteNav } from "@/components/site-nav";
import { requireApprovedUser } from "@/server/session";

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

	return (
		<>
			<SiteNav
				user={{
					name: user.name,
					email: user.email,
					image: user.image ?? null,
					isAdmin: user.role === "admin",
				}}
			/>
			<main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
		</>
	);
}
