"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { requireAdmin } from "@/server/session";

// Admin-only member management. Every action re-checks the caller's role —
// never trust the UI to have hidden the buttons.

type Role = "admin" | "member" | "guest";

/** Let someone in as a member or a guest (pending or previously rejected). */
export async function approveMember(userId: string, role: "member" | "guest" = "member"): Promise<void> {
	await requireAdmin();
	if (role !== "member" && role !== "guest") throw new Error("Invalid role.");
	await getDb()
		.update(schema.user)
		.set({ status: "approved", role, updatedAt: new Date() })
		.where(and(eq(schema.user.id, userId), ne(schema.user.role, "admin")));
	revalidatePath("/admin");
}

/** Revoke access (pending → rejected, or remove someone). Sessions end on next request. */
export async function rejectMember(userId: string): Promise<void> {
	const admin = await requireAdmin();
	if (userId === admin.id) throw new Error("You can't reject your own account.");
	await getDb()
		.update(schema.user)
		.set({ status: "rejected", updatedAt: new Date() })
		.where(eq(schema.user.id, userId));
	revalidatePath("/admin");
}

export async function setMemberRole(userId: string, role: Role): Promise<void> {
	const admin = await requireAdmin();
	if (role !== "admin" && role !== "member" && role !== "guest") throw new Error("Invalid role.");
	if (userId === admin.id && role !== "admin") throw new Error("You can't remove your own admin role.");
	const db = getDb();
	if (role !== "admin") {
		// Never leave the group without an admin.
		const [{ admins }] = await db
			.select({ admins: sql<number>`count(*)::int` })
			.from(schema.user)
			.where(and(eq(schema.user.role, "admin"), eq(schema.user.status, "approved"), ne(schema.user.id, userId)));
		if (admins === 0) throw new Error("There must be at least one admin.");
	}
	await db.update(schema.user).set({ role, updatedAt: new Date() }).where(eq(schema.user.id, userId));
	revalidatePath("/admin");
}
