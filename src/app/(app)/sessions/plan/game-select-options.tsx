// Shared <option> list for the event forms' game selects: every game,
// grouped by where it sits in the lifecycle so "in rotation" stays on top
// (#32). Plain markup — usable from server and client components alike.

export type SelectableGame = {
	id: string;
	title: string;
	status: "proposed" | "backlog" | "playing" | "completed" | "abandoned" | "rejected";
};

const GROUPS: { label: string; statuses: SelectableGame["status"][] }[] = [
	{ label: "In rotation", statuses: ["playing", "backlog"] },
	{ label: "Proposed", statuses: ["proposed"] },
	{ label: "Played out", statuses: ["completed", "abandoned", "rejected"] },
];

export function GameSelectOptions({ games }: { games: SelectableGame[] }) {
	return (
		<>
			{GROUPS.map((group) => {
				const options = games.filter((game) => group.statuses.includes(game.status));
				if (options.length === 0) return null;
				return (
					<optgroup key={group.label} label={group.label}>
						{options.map((game) => (
							<option key={game.id} value={game.id}>
								{game.title}
							</option>
						))}
					</optgroup>
				);
			})}
		</>
	);
}
