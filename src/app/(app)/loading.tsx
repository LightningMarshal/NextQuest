// Group-level loading skeleton: every (app) page is force-dynamic with
// per-request DB queries, so navigation otherwise gives no feedback until
// the server answers. One generic shape (heading + stat row + card grid)
// approximates all four pages well enough to signal "content is coming".
function Block({ className }: { className: string }) {
	return <div className={`bg-muted animate-pulse rounded-lg ${className}`} />;
}

export default function AppLoading() {
	return (
		<div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading page">
			<div className="flex flex-col gap-2">
				<Block className="h-9 w-48" />
				<Block className="h-4 w-72" />
			</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }, (_, index) => (
					<Block key={index} className="h-24" />
				))}
			</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 3 }, (_, index) => (
					<Block key={index} className="h-64" />
				))}
			</div>
		</div>
	);
}
