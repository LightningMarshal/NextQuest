import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { deleteGame, mergeGame } from "@/server/game-admin";

/**
 * Admin-only clean-up (Phase 23): merge a duplicate into the entry that
 * should survive, or delete a spam/typo entry outright. Collapsed by
 * default and behind a confirmation tick — both are permanent. The server
 * actions re-check everything; this only explains and collects.
 */
export function AdminGameTools({
	gameId,
	title,
	deleteBlocker,
	otherGames,
}: {
	gameId: string;
	title: string;
	/** Why this game can't be deleted, or null if it can. */
	deleteBlocker: string | null;
	otherGames: { id: string; title: string; status: string }[];
}) {
	return (
		<Card className="border-destructive/30 p-0">
			<details className="group px-6 py-4">
				<summary className="cursor-pointer text-sm font-medium tracking-wide uppercase select-none">
					Admin — merge a duplicate, or delete
				</summary>
				<div className="mt-4 flex flex-col gap-6">
					<section className="flex flex-col gap-2" aria-labelledby="merge-heading">
						<h3 id="merge-heading" className="text-sm font-medium">
							Merge into another game
						</h3>
						<p className="text-muted-foreground text-xs">
							For duplicates. Sessions, comments, ratings, tags and &ldquo;I&apos;d play this&rdquo; marks move to the
							game you pick, which keeps its own status and history. Then &ldquo;{title}&rdquo; is removed.
						</p>
						{otherGames.length === 0 ? (
							<p className="text-muted-foreground text-xs">There&apos;s no other game to merge into.</p>
						) : (
							<ActionForm action={mergeGame.bind(null, gameId)} formClassName="flex flex-col gap-2" block>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="merge-target" className="text-xs">
										Keep this game
									</Label>
									<NativeSelect id="merge-target" name="targetId" required defaultValue="" className="sm:max-w-sm">
										<option value="" disabled>
											Pick the game to keep…
										</option>
										{otherGames.map((game) => (
											<option key={game.id} value={game.id}>
												{game.title} ({game.status})
											</option>
										))}
									</NativeSelect>
								</div>
								<label className="flex items-center gap-2 text-xs">
									<input type="checkbox" name="confirm" value="yes" required className="accent-destructive size-4" />
									Merge &ldquo;{title}&rdquo; into it — this can&apos;t be undone
								</label>
								<Button size="sm" variant="outline" className="self-start">
									Merge
								</Button>
							</ActionForm>
						)}
					</section>

					<section className="flex flex-col gap-2 border-t pt-4" aria-labelledby="delete-heading">
						<h3 id="delete-heading" className="text-sm font-medium">
							Delete
						</h3>
						{deleteBlocker ? (
							<p className="text-muted-foreground text-xs">{deleteBlocker}</p>
						) : (
							<>
								<p className="text-muted-foreground text-xs">
									For spam, typos and accidents. Removes the game with its tags, comments and marks. Upcoming
									sessions that named it stay, without a game.
								</p>
								<ActionForm action={deleteGame.bind(null, gameId)} formClassName="flex flex-col gap-2" block>
									<label className="flex items-center gap-2 text-xs">
										<input type="checkbox" name="confirm" value="yes" required className="accent-destructive size-4" />
										Delete &ldquo;{title}&rdquo; permanently
									</label>
									<Button size="sm" variant="destructive" className="self-start">
										Delete game
									</Button>
								</ActionForm>
							</>
						)}
					</section>
				</div>
			</details>
		</Card>
	);
}
