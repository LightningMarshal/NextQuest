import {
	boolean,
	pgEnum,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// "The circle": how people beyond the core group get in, and where sessions
// get announced. See docs/DECISIONS.md (2026-09 redesign).

// Member-made invite links. The raw token only ever exists in the URL the
// member copies; the table stores its SHA-256, so a database leak can't be
// replayed into logins. Redeeming admits a PENDING account as an approved
// guest — never upgrades or overrides a rejection.
export const invites = pgTable("invites", {
	id: uuid("id").primaryKey().defaultRandom(),
	tokenHash: text("token_hash").notNull().unique(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
	/** Who it's for — shown back to the inviter and admins ("for Sam's cousin"). */
	note: text("note"),
	maxUses: smallint("max_uses").notNull().default(5),
	uses: smallint("uses").notNull().default(0),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Who came in on which invite — the "who knows them" trail admins see.
export const inviteRedemptions = pgTable(
	"invite_redemptions",
	{
		inviteId: uuid("invite_id")
			.notNull()
			.references(() => invites.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [primaryKey({ columns: [table.inviteId, table.userId] })]
);

export const applicationStatus = pgEnum("application_status", ["pending", "approved", "declined"]);

// Membership applications: a pending sign-in or a guest asking to join the
// group proper. Admins review; approval makes them a member.
export const membershipApplications = pgTable("membership_applications", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	about: text("about").notNull(),
	reason: text("reason").notNull(),
	knows: text("knows").notNull(),
	status: applicationStatus("status").notNull().default("pending"),
	reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Where session announcements go. `all` = the group's own server (every
// session + game news); `open` = a wider server that only hears about
// sessions marked open. The URL is a credential — admin-only, never rendered
// back in full.
export const webhookAudience = pgEnum("webhook_audience", ["all", "open"]);

export const discordWebhooks = pgTable("discord_webhooks", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	url: text("url").notNull(),
	audience: webhookAudience("audience").notNull().default("all"),
	enabled: boolean("enabled").notNull().default(true),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
