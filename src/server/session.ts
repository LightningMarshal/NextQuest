import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

export type SessionUser = {
	id: string;
	name: string;
	email: string;
	image?: string | null;
	role: "admin" | "member";
	status: "pending" | "approved" | "rejected";
};

// Server-only session helpers (not server actions) used by layouts, pages,
// and actions. Route protection happens here server-side — there is no
// middleware/proxy layer; every protected surface calls one of these.

export async function getSessionUser(): Promise<SessionUser | null> {
	// Resolve headers() before touching getAuth(): it marks the route dynamic,
	// keeping build-time prerendering away from getCloudflareContext().
	const requestHeaders = await headers();
	const session = await getAuth().api.getSession({ headers: requestHeaders });
	if (!session) return null;
	const { id, name, email, image, role, status } = session.user;
	return {
		id,
		name,
		email,
		image,
		role: role as SessionUser["role"],
		status: status as SessionUser["status"],
	};
}

/** Gate for everything inside the (app) route group. */
export async function requireApprovedUser(): Promise<SessionUser> {
	const user = await getSessionUser();
	if (!user) redirect("/sign-in");
	if (user.status !== "approved") redirect("/pending-approval");
	return user;
}

/** Gate for /admin pages and member-management actions. */
export async function requireAdmin(): Promise<SessionUser> {
	const user = await requireApprovedUser();
	if (user.role !== "admin") redirect("/");
	return user;
}
