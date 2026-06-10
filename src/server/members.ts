"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { requireAdmin } from "@/server/session";

// Admin-only member management. Every action re-checks the caller's role —
// never trust the UI to have hidden the buttons.

export async function approveMember(userId: string): Promise<void> {
	await requireAdmin();
	const db = getDb();
	await db
		.update(schema.user)
		.set({ status: "approved", updatedAt: new Date() })
		.where(eq(schema.user.id, userId));
	revalidatePath("/admin");
}

export async function rejectMember(userId: string): Promise<void> {
	const admin = await requireAdmin();
	if (userId === admin.id) {
		throw new Error("You can't reject your own account.");
	}
	const db = getDb();
	await db
		.update(schema.user)
		.set({ status: "rejected", updatedAt: new Date() })
		.where(eq(schema.user.id, userId));
	revalidatePath("/admin");
}

export async function setMemberRole(userId: string, role: "admin" | "member"): Promise<void> {
	const admin = await requireAdmin();
	// Self-demotion lockout guard: the last admin must stay an admin.
	if (userId === admin.id && role !== "admin") {
		throw new Error("You can't remove your own admin role.");
	}
	const db = getDb();
	await db
		.update(schema.user)
		.set({ role, updatedAt: new Date() })
		.where(eq(schema.user.id, userId));
	revalidatePath("/admin");
}
