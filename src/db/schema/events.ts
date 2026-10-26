import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { availabilityPolls } from "./availability";
import { games } from "./games";

export const eventStatus = pgEnum("event_status", ["scheduled", "completed", "cancelled"]);

// Structured how-we-meet signal for a SESSION (tabletop_details.format is the
// game's declared format — a virtual-friendly game can still have an
// in-person night, so the session carries its own).
export const eventVenue = pgEnum("event_venue", ["virtual", "in_person", "hybrid"]);

export const rsvpStatus = pgEnum("rsvp_status", ["yes", "no", "maybe"]);

// Who can see and join a session. `open` = the whole circle (guests
// included, and announced to open-audience Discord webhooks); `members` =
// the group only. Existing rows default to members — today's behaviour.
export const eventVisibility = pgEnum("event_visibility", ["members", "open"]);

export const events = pgTable(
	"events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		title: text("title").notNull(),
		gameId: uuid("game_id").references(() => games.id, { onDelete: "set null" }),
		// Set when the event was created from a GAC poll's winning slot.
		availabilityPollId: uuid("availability_poll_id").references(() => availabilityPolls.id, {
			onDelete: "set null",
		}),
		scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
		durationMinutes: integer("duration_minutes"),
		// Campaign session ordinal. Set by clone-forward recurrence (source + 1,
		// falling back to a trailing number in the source title) and backfilled
		// once from title digits; manual one-off events stay null. The title keeps
		// carrying "Session N" for humans — this column is for machines (activity
		// rows, campaign strips) so nobody parses titles at read time.
		sessionNumber: integer("session_number"),
		// Structured venue; null = unspecified (older rows, GAC-created events).
		venue: eventVenue("venue"),
		// Free-form detail: a Discord channel, a URL, or "the couch".
		location: text("location"),
		// Planning notes, set when the session is created ("bring snacks"). Kept
		// distinct from the post-session recap below so wrapping up never destroys
		// the plan.
		notes: text("notes"),
		// Session-capture fields, filled in at wrap-up (all nullable):
		// what happened, a 1–5 "how did it go", and where a campaign left off.
		recap: text("recap"),
		howItWent: smallint("how_it_went"),
		progressNote: text("progress_note"),
		status: eventStatus("status").notNull().default("scheduled"),
		// Sent-markers for the cron reminders (src/server/cron/event-reminders.ts):
		// stamped via single-statement claim updates so the hourly tick can never
		// double-send without transactions.
		reminder24hSentAt: timestamp("reminder_24h_sent_at", { withTimezone: true }),
		reminder1hSentAt: timestamp("reminder_1h_sent_at", { withTimezone: true }),
		// Post-event "needs wrap-up" nudge marker (issue #23), claimed the same way.
		wrapUpNudgeSentAt: timestamp("wrap_up_nudge_sent_at", { withTimezone: true }),
		// The host. Edit/cancel is host-or-admin only.
		createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
		visibility: eventVisibility("visibility").notNull().default("members"),
		// Optional seat cap (a 4-player co-op). Null = no limit.
		capacity: smallint("capacity"),
		// How to get in: a Discord voice channel link, a Steam lobby, a VTT URL.
		// `location` stays the free-text "where".
		joinUrl: text("join_url"),
		// Wrap-up receipt. auto_closed = nobody wrapped it up within 48h, so the
		// cron closed it with "in" RSVPs presumed present.
		wrappedUpAt: timestamp("wrapped_up_at", { withTimezone: true }),
		wrappedUpBy: text("wrapped_up_by").references(() => user.id, { onDelete: "set null" }),
		autoClosed: boolean("auto_closed").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("events_status_scheduled_idx").on(table.status, table.scheduledAt)]
);

export const eventAttendance = pgTable(
	"event_attendance",
	{
		eventId: uuid("event_id")
			.notNull()
			.references(() => events.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Null when the row exists only to record attendance for someone who
		// never RSVP'd but showed up anyway.
		rsvp: rsvpStatus("rsvp"),
		// Recorded after the session; null until then.
		attended: boolean("attended"),
		respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		primaryKey({ columns: [table.eventId, table.userId] }),
		index("event_attendance_user_idx").on(table.userId),
	]
);

// Discord messages announcing a session, one per webhook, so the SAME
// message is edited in place as people join or the time changes.
// webhook_key = discord_webhooks.id, or "env" for DISCORD_WEBHOOK_URL.
export const eventDiscordMessages = pgTable(
	"event_discord_messages",
	{
		eventId: uuid("event_id")
			.notNull()
			.references(() => events.id, { onDelete: "cascade" }),
		webhookKey: text("webhook_key").notNull(),
		messageId: text("message_id").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [primaryKey({ columns: [table.eventId, table.webhookKey] })]
);
