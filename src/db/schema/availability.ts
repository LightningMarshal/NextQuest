import { pgEnum, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { games } from "./games";

// GAC (Gamer Availability Checker), two generations (issue #33):
// - "slots" polls: creator proposes discrete start times, members answer
//   yes / no / if-need-be per slot. The original model; still rendered.
// - "grid" polls: creator proposes day-windows (availability_options rows
//   reused as windows), members PAINT the 15-minute blocks that work for
//   them (availability_marks intervals), whenisgood-style; the heatmap's
//   best fully-covered window becomes the event.
// Availability is public within the group, like RSVPs — only votes are
// anonymous.

export const pollStatus = pgEnum("poll_status", ["open", "closed"]);

export const pollKind = pgEnum("poll_kind", ["slots", "grid"]);

export const availabilityResponseValue = pgEnum("availability_response", [
	"yes",
	"no",
	"if_need_be",
]);

export const availabilityPolls = pgTable("availability_polls", {
	id: uuid("id").primaryKey().defaultRandom(),
	title: text("title").notNull(),
	kind: pollKind("kind").notNull().default("slots"),
	// Grid polls only: how long a session the group is trying to seat — the
	// sliding-window length for "best window" suggestions.
	gridSessionMinutes: smallint("grid_session_minutes"),
	// What the poll is trying to schedule (#37) — optional; copied onto the
	// event when a window is scheduled. Freeform titles become proposed games.
	gameId: uuid("game_id").references(() => games.id, { onDelete: "set null" }),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
	closesAt: timestamp("closes_at", { withTimezone: true }),
	status: pollStatus("status").notNull().default("open"),
	// Stamped when the poll closes (#37): closed polls drop out of the events
	// page after a short window instead of lingering forever.
	closedAt: timestamp("closed_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const availabilityOptions = pgTable("availability_options", {
	id: uuid("id").primaryKey().defaultRandom(),
	pollId: uuid("poll_id")
		.notNull()
		.references(() => availabilityPolls.id, { onDelete: "cascade" }),
	startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
	endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
});

// Grid polls: one row per contiguous painted stretch per member. Saved as a
// full replace of the member's ballot (delete + insert, merged client- and
// server-side), so the PK on (poll, user, start) only guards duplicates.
export const availabilityMarks = pgTable(
	"availability_marks",
	{
		pollId: uuid("poll_id")
			.notNull()
			.references(() => availabilityPolls.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
		endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [primaryKey({ columns: [table.pollId, table.userId, table.startsAt] })]
);

export const availabilityResponses = pgTable(
	"availability_responses",
	{
		optionId: uuid("option_id")
			.notNull()
			.references(() => availabilityOptions.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		response: availabilityResponseValue("response").notNull(),
		respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [primaryKey({ columns: [table.optionId, table.userId] })]
);
