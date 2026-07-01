import { CalendarCheckIcon, CheckIcon, HelpCircleIcon, XIcon } from "lucide-react";

import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { closePoll, createEventFromSlot, respondToSlot } from "@/server/availability";

export type PollSlot = {
	id: string;
	startsAt: Date;
	endsAt: Date;
	responses: { userId: string; name: string; response: "yes" | "no" | "if_need_be" }[];
};

export type PollWithSlots = {
	id: string;
	title: string;
	status: "open" | "closed";
	creatorName: string | null;
	scheduled: boolean;
	slots: PollSlot[];
};

function slotScore(slot: PollSlot) {
	const yes = slot.responses.filter((r) => r.response === "yes").length;
	const ifNeedBe = slot.responses.filter((r) => r.response === "if_need_be").length;
	return yes * 2 + ifNeedBe;
}

export function PollCard({
	poll,
	currentUserId,
}: {
	poll: PollWithSlots;
	currentUserId: string;
}) {
	const open = poll.status === "open";
	const bestScore = Math.max(...poll.slots.map(slotScore), 0);
	const respondedCount = new Set(
		poll.slots.flatMap((slot) => slot.responses.map((r) => r.userId))
	).size;

	return (
		<Card>
			<CardContent className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="font-display text-base font-semibold">{poll.title}</h3>
					{poll.scheduled ? (
						<Badge className="gap-1">
							<CalendarCheckIcon className="size-3" />
							scheduled
						</Badge>
					) : (
						!open && <Badge variant="outline">closed</Badge>
					)}
					{poll.creatorName && (
						<span className="text-muted-foreground text-xs">by {poll.creatorName}</span>
					)}
					<span className="stat text-muted-foreground ml-auto text-xs">
						{respondedCount} responded
					</span>
					{open && (
						<form action={closePoll.bind(null, poll.id)}>
							<Button size="sm" variant="ghost">
								Close poll
							</Button>
						</form>
					)}
				</div>

				{/* Nova: night tiles — the leading slot gets the cyan border + count. */}
				<div className="grid items-stretch gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
					{poll.slots.map((slot) => {
						const mine = slot.responses.find((r) => r.userId === currentUserId)?.response;
						const yes = slot.responses.filter((r) => r.response === "yes");
						const ifNeedBe = slot.responses.filter((r) => r.response === "if_need_be");
						const leading = open && bestScore > 0 && slotScore(slot) === bestScore;
						const names = [
							yes.length > 0 && `free: ${yes.map((r) => r.name).join(", ")}`,
							ifNeedBe.length > 0 && `if need be: ${ifNeedBe.map((r) => r.name).join(", ")}`,
						]
							.filter(Boolean)
							.join(" · ");
						return (
							<div
								key={slot.id}
								title={names || "no takers yet"}
								className={cn(
									"bg-background/50 flex flex-col gap-1.5 rounded-lg border p-3",
									leading && "border-primary/60"
								)}
							>
								<span className="text-xs font-medium">
									<LocalTime date={slot.startsAt} withWeekday />
								</span>
								<span
									className={cn(
										"stat text-sm font-semibold",
										leading ? "text-primary" : yes.length > 0 ? "text-foreground" : "text-muted-foreground"
									)}
								>
									{yes.length} free
									{ifNeedBe.length > 0 && (
										<span className="text-muted-foreground font-normal"> +{ifNeedBe.length}</span>
									)}
								</span>
								<span className="text-muted-foreground truncate text-[11px]">
									{names || "no takers yet"}
								</span>
								{open && (
									<div className="mt-auto flex items-center gap-1 pt-1">
										<form action={respondToSlot.bind(null, slot.id, "yes")}>
											<Button
												size="icon"
												variant="outline"
												aria-label="Free"
												className={cn(
													"size-7",
													mine === "yes" &&
														"border-success/40 bg-success/15 text-success hover:bg-success/25 hover:text-success"
												)}
											>
												<CheckIcon />
											</Button>
										</form>
										<form action={respondToSlot.bind(null, slot.id, "if_need_be")}>
											<Button
												size="icon"
												variant={mine === "if_need_be" ? "secondary" : "outline"}
												aria-label="If need be"
												className="size-7"
											>
												<HelpCircleIcon />
											</Button>
										</form>
										<form action={respondToSlot.bind(null, slot.id, "no")}>
											<Button
												size="icon"
												variant={mine === "no" ? "secondary" : "outline"}
												aria-label="Busy"
												className="size-7"
											>
												<XIcon />
											</Button>
										</form>
									</div>
								)}
								{open && (
									<form action={createEventFromSlot.bind(null, slot.id)}>
										<Button
											size="sm"
											variant={leading ? "default" : "outline"}
											className="w-full"
										>
											Schedule
										</Button>
									</form>
								)}
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
