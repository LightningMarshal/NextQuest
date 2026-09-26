"use server";

// How people join the circle: member-made invite links (→ guest) and
// membership applications (→ member, admin-reviewed). Every export here is
// a POST endpoint, so every one re-checks who is calling.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { admitPendingAsGuest } from "@/lib/auth";
import { notifyDiscord } from "@/server/discord";
import { randomToken, sha256Hex } from "@/lib/ids";
import { INVITE_TOKEN_RE } from "@/server/circle-read";
import { getSessionUser, requireAdmin, requireMember } from "@/server/session";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Per-member cap on live invites — a leaked account can't mint hundreds. */
const MAX_ACTIVE_INVITES = 10;

const inviteSchema = z.object({
	note: z.string().trim().max(120).optional(),
	maxUses: z.coerce.number().int().min(1).max(25),
	expiresInDays: z.coerce.number().int().min(1).max(30),
});

export type CreateInviteResult = { path: string };

/** Mint an invite link. The raw token is returned once and never stored. */
export async function createInvite(formData: FormData): Promise<CreateInviteResult> {
	const user = await requireMember("/invites");
	const parsed = inviteSchema.safeParse({
		note: formData.get("note") || undefined,
		maxUses: formData.get("maxUses") ?? 5,
		expiresInDays: formData.get("expiresInDays") ?? 7,
	});
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);

	const db = getDb();
	const [{ active }] = await db
		.select({ active: sql<number>`count(*)::int` })
		.from(schema.invites)
		.where(
			and(
				eq(schema.invites.createdBy, user.id),
				isNull(schema.invites.revokedAt),
				gt(schema.invites.expiresAt, new Date()),
				lt(schema.invites.uses, schema.invites.maxUses)
			)
		);
	if (active >= MAX_ACTIVE_INVITES) {
		throw new Error(`You have ${active} live invites — revoke one first.`);
	}

	const token = randomToken();
	await db.insert(schema.invites).values({
		tokenHash: await sha256Hex(token),
		createdBy: user.id,
		note: parsed.data.note,
		maxUses: parsed.data.maxUses,
		expiresAt: new Date(Date.now() + parsed.data.expiresInDays * DAY_MS),
	});
	revalidatePath("/invites");
	return { path: `/invite/${token}` };
}

/** Revoke an invite — its creator or an admin. */
export async function revokeInvite(inviteId: string): Promise<void> {
	const user = await requireMember("/invites");
	const db = getDb();
	const [invite] = await db
		.select({ createdBy: schema.invites.createdBy })
		.from(schema.invites)
		.where(eq(schema.invites.id, inviteId));
	if (!invite) throw new Error("Invite not found.");
	if (invite.createdBy !== user.id && user.role !== "admin") {
		throw new Error("Only the invite's creator or an admin can revoke it.");
	}
	await db
		.update(schema.invites)
		.set({ revokedAt: new Date() })
		.where(eq(schema.invites.id, inviteId));
	revalidatePath("/invites");
	revalidatePath("/admin");
}

/**
 * Redeem an invite for the signed-in account: a PENDING account becomes an
 * approved guest. Approved accounts don't consume a use; rejected ones are
 * refused (an invite never overrides an admin's decision).
 */
export async function redeemInvite(token: string): Promise<void> {
	const user = await getSessionUser();
	if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
	if (user.status === "approved") redirect("/");
	if (user.status === "rejected") throw new Error("This account can't use invites — talk to an admin.");
	if (!INVITE_TOKEN_RE.test(token)) throw new Error("That invite link isn't valid.");

	const db = getDb();
	// Consume one use atomically: the WHERE re-checks every validity rule, so
	// concurrent redemptions can't overshoot max_uses.
	const [consumed] = await db
		.update(schema.invites)
		.set({ uses: sql`${schema.invites.uses} + 1` })
		.where(
			and(
				eq(schema.invites.tokenHash, await sha256Hex(token)),
				isNull(schema.invites.revokedAt),
				gt(schema.invites.expiresAt, new Date()),
				lt(schema.invites.uses, schema.invites.maxUses)
			)
		)
		.returning({ id: schema.invites.id, createdBy: schema.invites.createdBy });
	if (!consumed) throw new Error("This invite has expired, been used up, or been revoked.");

	await admitPendingAsGuest(db, user.id);
	await db
		.insert(schema.inviteRedemptions)
		.values({ inviteId: consumed.id, userId: user.id })
		.onConflictDoNothing();
	redirect("/");
}

const applicationSchema = z.object({
	about: z.string().trim().min(2, "Tell us a little about yourself.").max(1000),
	reason: z.string().trim().min(2, "Why do you want to join?").max(1000),
	knows: z.string().trim().min(2, "Who do you know in the group?").max(300),
});

/** Apply for membership — pending sign-ins and guests. One open application at a time. */
export async function submitApplication(formData: FormData): Promise<void> {
	const user = await getSessionUser();
	if (!user) redirect("/sign-in?next=/apply");
	if (user.status === "rejected") throw new Error("This account was declined — talk to an admin.");
	if (user.status === "approved" && user.role !== "guest") redirect("/");

	const parsed = applicationSchema.safeParse({
		about: formData.get("about"),
		reason: formData.get("reason"),
		knows: formData.get("knows"),
	});
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);

	const db = getDb();
	const [open] = await db
		.select({ id: schema.membershipApplications.id })
		.from(schema.membershipApplications)
		.where(
			and(
				eq(schema.membershipApplications.userId, user.id),
				eq(schema.membershipApplications.status, "pending")
			)
		);
	if (open) throw new Error("Your application is already with the admins.");

	await db.insert(schema.membershipApplications).values({ userId: user.id, ...parsed.data });
	// Admins learn about it where they already are. Names only — the answers
	// stay in the app.
	notifyDiscord(`📨 ${user.name} applied to join the group — admins, it's on the admin page.`);
	revalidatePath("/apply");
	revalidatePath("/admin");
}

/** Admin decision on an application. Approve → member; decline keeps guests as guests. */
export async function reviewApplication(
	applicationId: string,
	decision: "approved" | "declined"
): Promise<void> {
	const admin = await requireAdmin();
	if (decision !== "approved" && decision !== "declined") throw new Error("Invalid decision.");
	const db = getDb();
	const [application] = await db
		.select({
			userId: schema.membershipApplications.userId,
			status: schema.membershipApplications.status,
			role: schema.user.role,
			userStatus: schema.user.status,
		})
		.from(schema.membershipApplications)
		.innerJoin(schema.user, eq(schema.membershipApplications.userId, schema.user.id))
		.where(eq(schema.membershipApplications.id, applicationId));
	if (!application) throw new Error("Application not found.");
	if (application.status !== "pending") throw new Error("Already reviewed.");

	const reviewed = { status: decision, reviewedBy: admin.id, reviewedAt: new Date() } as const;
	if (decision === "approved") {
		await db.batch([
			db
				.update(schema.membershipApplications)
				.set(reviewed)
				.where(eq(schema.membershipApplications.id, applicationId)),
			db
				.update(schema.user)
				.set({
					// Never demote an admin through an application.
					role: application.role === "admin" ? "admin" : "member",
					status: "approved",
					updatedAt: new Date(),
				})
				.where(eq(schema.user.id, application.userId)),
		]);
	} else {
		await db.batch([
			db
				.update(schema.membershipApplications)
				.set(reviewed)
				.where(eq(schema.membershipApplications.id, applicationId)),
			// A declined pending sign-in is rejected; a declined guest stays a guest.
			db
				.update(schema.user)
				.set({ status: "rejected", updatedAt: new Date() })
				.where(and(eq(schema.user.id, application.userId), eq(schema.user.status, "pending"))),
		]);
	}
	revalidatePath("/admin");
}
