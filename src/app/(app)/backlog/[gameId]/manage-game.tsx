import { RefreshCwIcon, TagIcon, XIcon } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { refreshGameMetadata, updateGameArtwork } from "@/server/games";
import { addTagToGame, removeTagFromGame } from "@/server/tags";

/**
 * Curation tools, moved off the library cards (where they were rendered
 * hidden on every card) to the one page where you'd use them. Status
 * changes stay up top on the game page; this is tags, metadata, and art.
 */
export function ManageGame({
	gameId,
	isVideo,
	hasBggId,
	tags,
	allTags,
	coverUrl,
	headerUrl,
}: {
	gameId: string;
	isVideo: boolean;
	hasBggId: boolean;
	tags: { id: string; name: string }[];
	allTags: string[];
	coverUrl: string | null;
	headerUrl: string | null;
}) {
	return (
		<Card className="p-0">
			<details className="group px-6 py-4">
				<summary className="cursor-pointer text-sm font-medium tracking-wide uppercase select-none">
					Manage — tags, metadata, artwork
				</summary>
				<div className="mt-4 flex flex-col gap-5">
					<div className="flex flex-col gap-2">
						<p className="text-sm font-medium">Tags</p>
						<div className="flex flex-wrap items-center gap-1.5">
							{tags.length === 0 && <span className="text-muted-foreground text-xs">No tags yet.</span>}
							{tags.map((tag) => (
								<Badge key={tag.id} variant="secondary" className="gap-0.5 pr-1">
									{tag.name}
									<ActionForm action={removeTagFromGame.bind(null, gameId, tag.id)}>
										<button type="submit" aria-label={`Remove tag ${tag.name}`} className="hover:text-destructive flex cursor-pointer">
											<XIcon className="size-3" />
										</button>
									</ActionForm>
								</Badge>
							))}
						</div>
						<ActionForm action={addTagToGame.bind(null, gameId)} formClassName="flex items-center gap-1" resetOnSuccess>
							<Input name="tag" required maxLength={30} list={`tags-${gameId}`} placeholder="add tag" aria-label="Add tag" className="h-8 w-40 text-xs" />
							<datalist id={`tags-${gameId}`}>
								{allTags.map((name) => (
									<option key={name} value={name} />
								))}
							</datalist>
							<Button size="sm" variant="ghost" aria-label="Add tag">
								<TagIcon className="size-3.5" />
							</Button>
						</ActionForm>
					</div>

					{(isVideo || hasBggId) && (
						<div className="flex flex-col gap-1">
							<ActionForm action={refreshGameMetadata.bind(null, gameId)}>
								<Button size="sm" variant="outline">
									<RefreshCwIcon className="size-3.5" />
									Refresh metadata
								</Button>
							</ActionForm>
							<p className="text-muted-foreground text-xs">
								Re-fetches {isVideo ? "Steam / HowLongToBeat" : "BoardGameGeek"} details; overwrites fetched fields.
							</p>
						</div>
					)}

					<ActionForm action={updateGameArtwork.bind(null, gameId)} formClassName="grid gap-2 sm:grid-cols-2" block>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor={`cover-${gameId}`} className="text-xs">
								Cover image URL
							</Label>
							<Input id={`cover-${gameId}`} name="coverUrl" type="url" defaultValue={coverUrl ?? ""} placeholder="https://…" className="h-8 text-xs" />
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor={`header-${gameId}`} className="text-xs">
								Header image URL
							</Label>
							<Input id={`header-${gameId}`} name="headerUrl" type="url" defaultValue={headerUrl ?? ""} placeholder="https://…" className="h-8 text-xs" />
						</div>
						<Button size="sm" className="self-start">
							Save artwork
						</Button>
					</ActionForm>
				</div>
			</details>
		</Card>
	);
}
