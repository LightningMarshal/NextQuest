import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";
import { signInHref } from "@/lib/safe-redirect";

export type UserRole = "admin" | "member" | "guest";

/** Where a guest lands when they hit a member-only page. */
export const GUEST_HOME = "/";
export type UserStatus = "pending" | "approved" | "rejected";

export type SessionUser = {
	id: string;
	name: string;
	email: string;
	image?: string | null;
	role: UserRole;
	status: UserStatus;
};

// Server-only session helpers (not server actions) used by layouts, pages,
// and actions. Route protection happens here server-side — there is no
// middleware/proxy layer; every protected surface calls one of these.
//
// Access tiers:
//   admin / member (approved) — everything: library, stats, planning, admin (admin only)
//   guest (approved)          — "the circle": sessions marked open, join/leave only
//   pending / rejected        — /apply and /pending only

/**
 * Memoized per request (React cache): a page, its layout, and every helper
 * they call share ONE Better Auth lookup instead of re-querying the session
 * and user tables each time (it used to be 3× per page).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
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
		role: (["admin", "member", "guest"].includes(role) ? role : "guest") as UserRole,
		status: (["pending", "approved", "rejected"].includes(status) ? status : "pending") as UserStatus,
	};
});

export function isMember(user: Pick<SessionUser, "role" | "status"> | null): boolean {
	return !!user && user.status === "approved" && (user.role === "member" || user.role === "admin");
}

export function isCircle(user: Pick<SessionUser, "role" | "status"> | null): boolean {
	return !!user && user.status === "approved";
}

export function isAdmin(user: Pick<SessionUser, "role" | "status"> | null): boolean {
	return !!user && user.status === "approved" && user.role === "admin";
}

/**
 * Gate for anything a guest may see (sessions marked open). `returnTo` is
 * where sign-in should come back to — deep links from Discord depend on it.
 */
export async function requireCircleUser(returnTo?: string): Promise<SessionUser> {
	const user = await getSessionUser();
	if (!user) redirect(signInHref(returnTo));
	if (user.status !== "approved") redirect("/apply");
	return user;
}

/** Gate for member-only surfaces and actions. Guests bounce to their home. */
export async function requireMember(returnTo?: string): Promise<SessionUser> {
	const user = await requireCircleUser(returnTo);
	// Guests only ever see circle pages; their home is the sessions view.
	if (!isMember(user)) redirect(GUEST_HOME);
	return user;
}

/** Gate for /admin pages and member-management actions. */
export async function requireAdmin(): Promise<SessionUser> {
	const user = await requireMember("/admin");
	if (user.role !== "admin") redirect("/");
	return user;
}
