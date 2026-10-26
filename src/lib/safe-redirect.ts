// Post-sign-in return paths arrive from the URL (`?next=`), so they are
// attacker-controlled: only same-origin absolute paths survive. "//evil.com"
// and "/\evil.com" are protocol-relative in browsers, so they're rejected too.

export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
	if (!value || typeof value !== "string") return fallback;
	if (value.length > 500) return fallback;
	if (!value.startsWith("/")) return fallback;
	if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
	// Control characters (incl. encoded newlines) have no place in a path.
	if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
	return value;
}

/** `/sign-in?next=<path>` for a gate redirect, dropping a pointless `next=/`. */
export function signInHref(next: string | null | undefined): string {
	const path = safeNextPath(next, "/");
	return path === "/" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(path)}`;
}
