import {
	boolean,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { games } from "./games";

export const eventStatus = pgEnum("event_status", ["scheduled", "completed", "cancelled"]);

export const rsvpStatus = pgEnum("rsvp_status", ["yes", "no", "maybe"]);

// Future GAC (Gamer Availability Checker) module adds availability_polls /
// availability_options / availability_responses tables plus a nullable
// `availability_poll_id` column here — additive only, see
// docs/ARCHITECTURE.md.
export const events = pgTable("events", {
	id: uuid("id").primaryKey().defaultRandom(),
	title: text("title").notNull(),
	gameId: uuid("game_id").references(() => games.id, { onDelete: "set null" }),
	scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
	durationMinutes: integer("duration_minutes"),
	// Free-form: a Discord channel, a URL, or "the couch".
	location: text("location"),
	notes: text("notes"),
	status: eventStatus("status").notNull().default("scheduled"),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventAttendance = pgTable(
	"event_attendance",
	{
		eventId: uuid("event_id")
			.notNull()
			.references(() => events.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		rsvp: rsvpStatus("rsvp").notNull(),
		// Recorded after the session; null until then.
		attended: boolean("attended"),
		respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [primaryKey({ columns: [table.eventId, table.userId] })]
);
