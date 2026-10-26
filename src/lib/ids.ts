// Small shared guards for untrusted identifiers and secrets.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route params reach Postgres as `uuid` — anything else is a 404, not a 500. */
export function isUuid(value: unknown): value is string {
	return typeof value === "string" && UUID_RE.test(value);
}

/** Constant-time string comparison for shared secrets and tokens. */
export function timingSafeEqual(a: string, b: string): boolean {
	const encoder = new TextEncoder();
	const left = encoder.encode(a);
	const right = encoder.encode(b);
	// Length leaks are fine (tokens are fixed-length); content must not.
	let diff = left.length ^ right.length;
	const length = Math.max(left.length, right.length);
	for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
	return diff === 0;
}

/** Hex SHA-256 — invite tokens are stored hashed, never raw. */
export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** URL-safe random token (base64url, `bytes` of entropy). */
export function randomToken(bytes = 24): string {
	const buffer = crypto.getRandomValues(new Uint8Array(bytes));
	return btoa(String.fromCharCode(...buffer)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
