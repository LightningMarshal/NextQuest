"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	CheckIcon,
	Loader2Icon,
	PencilIcon,
	PlusIcon,
	RefreshCwIcon,
	SearchIcon,
	XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GameSearchResult } from "@/lib/metadata";
import { proposeGame } from "@/server/games";
import {
	previewCandidate,
	searchGameCandidates,
	type PreviewCandidateResult,
	type SearchCandidatesResult,
} from "@/server/metadata-search";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<string, string> = { steam: "Steam", hltb: "HLTB" };

function SubmitButton() {
	const { pending } = useFormStatus();
	return (
		<Button className="glow-primary" disabled={pending}>
			{pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
			{pending ? "Fetching metadata…" : "Propose"}
		</Button>
	);
}

function SourceStatus({ preview }: { preview: PreviewCandidateResult }) {
	return (
		<span className="flex items-center gap-2">
			{(["steam", "hltb"] as const).map((provider) => {
				const ok = preview.sources.includes(provider);
				const failed = preview.failures.includes(provider);
				return (
					<span
						key={provider}
						className={cn(
							"flex items-center gap-1 text-xs",
							ok ? "text-success" : failed ? "text-destructive" : "text-muted-foreground"
						)}
					>
						{ok ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
						{PROVIDER_LABELS[provider]}
						{!ok && !failed && " (no match)"}
					</span>
				);
			})}
		</span>
	);
}

export function ProposeForm() {
	const formRef = useRef<HTMLFormElement>(null);
	const [manualMode, setManualMode] = useState(false);

	// --- title search ---------------------------------------------------
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchCandidatesResult | null>(null);
	const [searching, setSearching] = useState(false);
	const [listOpen, setListOpen] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Server-action responses can land out of order — only the latest
	// request's result may render (debounce alone doesn't guarantee that).
	const searchSeq = useRef(0);

	// --- selected candidate + preview ------------------------------------
	const [selected, setSelected] = useState<GameSearchResult | null>(null);
	const [preview, setPreview] = useState<PreviewCandidateResult | null>(null);
	const [previewing, setPreviewing] = useState(false);
	const [previewFailed, setPreviewFailed] = useState(false);

	const [submitError, setSubmitError] = useState<string | null>(null);

	function handleQueryChange(value: string) {
		setQuery(value);
		setSelected(null);
		setPreview(null);
		setPreviewFailed(false);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		if (value.trim().length < 2) {
			setResults(null);
			setListOpen(false);
			setSearching(false);
			return;
		}
		setSearching(true);
		debounceRef.current = setTimeout(async () => {
			const seq = ++searchSeq.current;
			try {
				const found = await searchGameCandidates(value.trim());
				if (seq !== searchSeq.current) return;
				setResults(found);
				setListOpen(true);
			} catch {
				if (seq !== searchSeq.current) return;
				setResults({ candidates: [], failures: ["steam", "hltb"] });
				setListOpen(true);
			} finally {
				if (seq === searchSeq.current) setSearching(false);
			}
		}, 400);
	}

	async function loadPreview(candidate: GameSearchResult) {
		setPreviewing(true);
		setPreviewFailed(false);
		try {
			const result = await previewCandidate({
				title: candidate.title,
				steamAppId: candidate.providerId === "steam" ? Number(candidate.externalId) : undefined,
				hltbId: candidate.providerId === "hltb" ? candidate.externalId : undefined,
			});
			setPreview(result);
		} catch {
			setPreviewFailed(true);
		} finally {
			setPreviewing(false);
		}
	}

	function selectCandidate(candidate: GameSearchResult) {
		searchSeq.current += 1; // invalidate in-flight searches
		setSelected(candidate);
		setQuery(candidate.title);
		setListOpen(false);
		setSubmitError(null);
		void loadPreview(candidate);
	}

	function clearSelection() {
		setSelected(null);
		setPreview(null);
		setPreviewFailed(false);
		setQuery("");
	}

	function resetAll() {
		clearSelection();
		setResults(null);
		setSubmitError(null);
		formRef.current?.reset();
	}

	async function handleAction(formData: FormData) {
		setSubmitError(null);
		try {
			await proposeGame(formData);
			resetAll();
		} catch (error) {
			setSubmitError(error instanceof Error ? error.message : "Something went wrong — try again.");
		}
	}

	const meta = preview?.metadata;
	const previewArt = meta?.headerUrl ?? meta?.coverUrl ?? selected?.coverUrl;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Propose a game</CardTitle>
				<CardDescription>
					Search by title and pick a match — art, genres, review scores, and playtime
					(HowLongToBeat) fill in automatically. If the lookups fail you can retry or enter the
					details yourself.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form ref={formRef} action={handleAction} className="flex flex-col gap-4">
					{!manualMode && (
						<>
							<div className="relative flex flex-col gap-1.5">
								<Label htmlFor="propose-search">Title</Label>
								<div className="relative">
									<SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
									<Input
										id="propose-search"
										value={query}
										onChange={(event) => handleQueryChange(event.target.value)}
										onFocus={() => {
											if (results && !selected) setListOpen(true);
										}}
										onKeyDown={(event) => {
											if (event.key === "Escape") setListOpen(false);
											// The search box is not the submit trigger.
											if (event.key === "Enter") event.preventDefault();
										}}
										placeholder="Deep Rock Galactic"
										maxLength={200}
										autoComplete="off"
										role="combobox"
										aria-expanded={listOpen}
										aria-controls="propose-search-results"
										className="pl-9"
									/>
									{searching && (
										<Loader2Icon className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
									)}
								</div>
								{listOpen && results && (
									<div
										id="propose-search-results"
										role="listbox"
										className="border-border bg-popover absolute top-full z-20 mt-1 flex max-h-80 w-full flex-col overflow-y-auto rounded-lg border shadow-md"
									>
										{results.candidates.map((candidate) => (
											<button
												key={`${candidate.providerId}-${candidate.externalId}`}
												type="button"
												role="option"
												aria-selected="false"
												onClick={() => selectCandidate(candidate)}
												className="hover:bg-accent/50 flex cursor-pointer items-center gap-3 px-3 py-2 text-left"
											>
												{candidate.coverUrl ? (
													// Transient external thumbnails (Steam tiny_image / HLTB
													// covers) — hosts aren't in next.config remotePatterns.
													// eslint-disable-next-line @next/next/no-img-element
													<img
														src={candidate.coverUrl}
														alt=""
														className="h-10 w-20 shrink-0 rounded object-cover"
														loading="lazy"
													/>
												) : (
													<div className="bg-muted h-10 w-20 shrink-0 rounded" />
												)}
												<span className="min-w-0 flex-1 truncate text-sm">
													{candidate.title}
													{candidate.releaseYear && (
														<span className="text-muted-foreground"> ({candidate.releaseYear})</span>
													)}
												</span>
												<Badge variant="outline" className="shrink-0 text-[10px]">
													{PROVIDER_LABELS[candidate.providerId] ?? candidate.providerId}
												</Badge>
											</button>
										))}
										{results.candidates.length === 0 && (
											<p className="text-muted-foreground px-3 py-2 text-sm">No matches found.</p>
										)}
										{results.failures.length > 0 && (
											<p className="text-destructive border-border border-t px-3 py-2 text-xs">
												{results.failures.map((f) => PROVIDER_LABELS[f] ?? f).join(" and ")} search
												failed — results may be incomplete.
											</p>
										)}
										<button
											type="button"
											onClick={() => {
												setListOpen(false);
												setManualMode(true);
											}}
											className="text-muted-foreground hover:text-foreground border-border cursor-pointer border-t px-3 py-2 text-left text-xs"
										>
											Can&rsquo;t find it? Enter the details manually →
										</button>
									</div>
								)}
							</div>

							{selected && (
								<div className="border-border bg-card/50 flex flex-col gap-3 rounded-lg border p-3">
									<div className="flex items-start gap-3">
										{previewArt ? (
											// Preview art is transient too — stored art is rendered with
											// next/image after the proposal is saved.
											// eslint-disable-next-line @next/next/no-img-element
											<img
												src={previewArt}
												alt={selected.title}
												className="h-20 w-40 shrink-0 rounded object-cover"
											/>
										) : (
											<div className="bg-muted h-20 w-40 shrink-0 rounded" />
										)}
										<div className="min-w-0 flex-1">
											<div className="flex items-center justify-between gap-2">
												<p className="truncate text-sm font-semibold">
													{meta?.title ?? selected.title}
													{selected.releaseYear && (
														<span className="text-muted-foreground font-normal">
															{" "}
															({selected.releaseYear})
														</span>
													)}
												</p>
												<Button
													type="button"
													size="icon"
													variant="ghost"
													className="size-7"
													aria-label="Clear selection"
													onClick={clearSelection}
												>
													<XIcon className="size-4" />
												</Button>
											</div>
											{previewing ? (
												<p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
													<Loader2Icon className="size-3 animate-spin" /> Fetching metadata…
												</p>
											) : previewFailed ? (
												<p className="text-destructive mt-1 text-xs">Preview failed.</p>
											) : preview ? (
												<>
													<p className="stat text-muted-foreground mt-1 text-xs">
														{[
															meta?.hltbMainExtra ?? meta?.hltbMain
																? `${meta.hltbMainExtra ?? meta.hltbMain}h`
																: null,
															meta?.steamReviewScore != null ? `${meta.steamReviewScore}%` : null,
															meta?.metacriticScore != null ? `MC ${meta.metacriticScore}` : null,
															meta?.genres?.slice(0, 3).join(", ") || null,
														]
															.filter(Boolean)
															.join(" · ")}
													</p>
													{meta?.description && (
														<p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
															{meta.description}
														</p>
													)}
												</>
											) : null}
										</div>
									</div>
									<div className="flex flex-wrap items-center justify-between gap-2">
										{preview ? <SourceStatus preview={preview} /> : <span />}
										<div className="flex items-center gap-2">
											{!previewing && (previewFailed || (preview?.failures.length ?? 0) > 0) && (
												<Button type="button" size="sm" variant="outline" onClick={() => loadPreview(selected)}>
													<RefreshCwIcon className="size-3.5" />
													Retry lookups
												</Button>
											)}
											<Button
												type="button"
												size="sm"
												variant="ghost"
												onClick={() => setManualMode(true)}
											>
												<PencilIcon className="size-3.5" />
												Enter manually instead
											</Button>
										</div>
									</div>
									{/* The server refetches from these ids on submit; preview is advisory. */}
									<input type="hidden" name="title" value={selected.title} />
									{selected.providerId === "steam" && (
										<input type="hidden" name="steamAppId" value={selected.externalId} />
									)}
									{selected.providerId === "hltb" && (
										<input type="hidden" name="hltbId" value={selected.externalId} />
									)}
								</div>
							)}
						</>
					)}

					{manualMode && (
						<>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="propose-title">Title</Label>
									<Input
										id="propose-title"
										name="title"
										required
										maxLength={200}
										defaultValue={selected?.title ?? query}
										placeholder="Deep Rock Galactic"
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="propose-steam">Steam link or app id (optional)</Label>
									<Input
										id="propose-steam"
										name="steam"
										placeholder="https://store.steampowered.com/app/548430/…"
									/>
								</div>
							</div>
							<button
								type="button"
								onClick={() => {
									setManualMode(false);
									clearSelection();
								}}
								className="text-muted-foreground hover:text-foreground -mt-2 cursor-pointer self-start text-xs underline underline-offset-4"
							>
								← Back to search
							</button>
						</>
					)}

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="propose-pitch">Pitch (optional)</Label>
						<textarea
							id="propose-pitch"
							name="pitch"
							rows={2}
							maxLength={2000}
							placeholder="Why should the group play this?"
							className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
						/>
					</div>

					{submitError && <p className="text-destructive text-sm">{submitError}</p>}

					<div>
						{manualMode || selected ? (
							<SubmitButton />
						) : (
							<p className="text-muted-foreground text-xs">
								Pick a search result to propose it, or{" "}
								<button
									type="button"
									onClick={() => setManualMode(true)}
									className="hover:text-foreground cursor-pointer underline underline-offset-4"
								>
									enter the details manually
								</button>
								.
							</p>
						)}
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
