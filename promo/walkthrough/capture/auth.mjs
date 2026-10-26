// Sign a demo user in for the capture browser without OAuth: insert a Better
// Auth session row and hand back the signed session cookie (same format as
// better-call's signCookieValue: `${token}.${base64(HMAC-SHA256)}`, URI-encoded).
// Local promo tooling only.
import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";

export function devVar(name, file = ".dev.vars") {
	const line = fs.readFileSync(file, "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
	return line ? line.slice(name.length + 1).trim() : undefined;
}

export async function sessionCookie(pool, userId) {
	const token = `promo${crypto.randomBytes(16).toString("hex")}`;
	await pool.query("insert into session (id, expires_at, token, user_id) values ($1, now() + interval '7 days', $1, $2)", [token, userId]);
	const secret = devVar("BETTER_AUTH_SECRET");
	const sig = crypto.createHmac("sha256", secret).update(token).digest("base64");
	return { name: "better-auth.session_token", value: encodeURIComponent(`${token}.${sig}`), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" };
}

export function pool(target = process.env.SHIM_TARGET ?? "postgresql://postgres@localhost:5433/nextquest?host=/tmp") {
	return new pg.Pool({ connectionString: target, max: 4 });
}
