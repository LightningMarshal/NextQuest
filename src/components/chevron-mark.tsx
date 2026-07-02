/* NextQuest logo: two forward chevrons.
   First chevron = currentColor (foreground), second = cyan primary.
   Pure SVG — safe in both server and client components. The same two
   chevrons on a #0B0D11 rounded square are used for the favicon/app-icon
   (public/favicon.svg). */
export function ChevronMark({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 58 58" fill="none" className={className} aria-hidden="true">
			<polyline
				points="14,16 26,29 14,42"
				stroke="currentColor"
				strokeWidth="6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<polyline
				points="28,16 40,29 28,42"
				className="stroke-primary"
				strokeWidth="6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
