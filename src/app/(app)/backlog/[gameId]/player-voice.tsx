import { formatDistanceToNowStrict } from "date-fns";
import { MessageSquareIcon, StarIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { averageRating } from "@/lib/ratings";
import { addGameComment, deleteGameComment, rateGame } from "@/server/ratings";

// Phase 21 (player voice): the game page's two people-surfaces — ratings
// once the group is done, and a running discussion thread at any stage.
// Both public within the group; votes stay anonymous and untouched.

export type MemberRating = {
	userId: string;
	name: string;
	rating: number;
	note: string | null;
};

export type GameComment = {
	id: string;
	userId: string | null;
	name: string | null;
	body: string;
	createdAt: Date;
};

const RATING_LABELS: Record<number, string> = {
	5: "5 — loved it",
	4: "4 — really good",
	3: "3 — fine",
	2: "2 — not for me",
	1: "1 — regret it",
};

export function RatingsCard({
	gameId,
	gameStatus,
	ratings,
	viewerId,
}: {
	gameId: string;
	gameStatus: string;
	ratings: MemberRating[];
	viewerId: string;
}) {
	const finished = gameStatus === "completed" || gameStatus === "abandoned";
	// Nothing to show or collect yet — pre-finish games skip the card.
	if (!finished && ratings.length === 0) return null;
	const average = averageRating(ratings.map((r) => r.rating));
	const mine = ratings.find((r) => r.userId === viewerId);

	return (
		<Card className="flex flex-col gap-3 p-6">
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-sm font-medium tracking-wide uppercase">Player ratings</h2>
				{average !== null && (
					<Badge variant="secondary" className="stat gap-1">
						<StarIcon className="size-3" />
						{average}/5 · {ratings.length}
					</Badge>
				)}
			</div>

			{ratings.length > 0 && (
				<ul className="flex flex-col gap-1.5">
					{ratings.map((entry) => (
						<li key={entry.userId} className="flex items-baseline gap-2 text-sm">
							<span className="stat text-primary shrink-0 font-semibold">{entry.rating}/5</span>
							<span className="shrink-0 font-medium">{entry.name}</span>
							{entry.note && <span className="text-muted-foreground truncate">{entry.note}</span>}
						</li>
					))}
				</ul>
			)}

			{finished && (
				<form action={rateGame.bind(null, gameId)} className="flex flex-wrap items-center gap-2">
					<select
						name="rating"
						defaultValue={mine?.rating ?? ""}
						required
						aria-label="Your rating"
						className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-40 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
					>
						<option value="" disabled>
							your rating…
						</option>
						{[5, 4, 3, 2, 1].map((value) => (
							<option key={value} value={value}>
								{RATING_LABELS[value]}
							</option>
						))}
					</select>
					<Input
						name="note"
						maxLength={500}
						defaultValue={mine?.note ?? ""}
						placeholder="one-line take (optional)"
						className="h-9 min-w-48 flex-1"
					/>
					<Button size="sm">{mine ? "Update" : "Rate it"}</Button>
				</form>
			)}
		</Card>
	);
}

export function DiscussionCard({
	gameId,
	comments,
	viewerId,
	viewerIsAdmin,
}: {
	gameId: string;
	comments: GameComment[];
	viewerId: string;
	viewerIsAdmin: boolean;
}) {
	return (
		<Card className="flex flex-col gap-3 p-6">
			<h2 className="flex items-center gap-2 text-sm font-medium tracking-wide uppercase">
				<MessageSquareIcon className="size-4" />
				Table talk
				{comments.length > 0 && (
					<span className="stat text-muted-foreground font-normal">{comments.length}</span>
				)}
			</h2>

			{comments.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No takes yet — make the case for (or against) this one.
				</p>
			) : (
				<ul className="flex flex-col gap-3">
					{comments.map((comment) => (
						<li key={comment.id} className="flex items-start gap-2 text-sm">
							<div className="min-w-0 flex-1">
								<p className="text-muted-foreground text-xs">
									<span className="text-foreground font-medium">
										{comment.name ?? "former member"}
									</span>{" "}
									· {formatDistanceToNowStrict(comment.createdAt, { addSuffix: true })}
								</p>
								<p className="whitespace-pre-line">{comment.body}</p>
							</div>
							{(comment.userId === viewerId || viewerIsAdmin) && (
								<form action={deleteGameComment.bind(null, comment.id)}>
									<Button
										size="icon"
										variant="ghost"
										className="size-7"
										aria-label="Delete comment"
									>
										<Trash2Icon className="size-3.5" />
									</Button>
								</form>
							)}
						</li>
					))}
				</ul>
			)}

			<form action={addGameComment.bind(null, gameId)} className="flex items-start gap-2">
				<textarea
					name="body"
					required
					rows={2}
					maxLength={2000}
					placeholder="Add to the discussion…"
					className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full flex-1 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
				/>
				<Button size="sm">Post</Button>
			</form>
		</Card>
	);
}
