// Local dev without a Neon account: a tiny Neon HTTP-protocol server over a
// plain Postgres, so the app's real @neondatabase/serverless driver runs
// unmodified. Speaks what the driver sends: array mode + raw text output,
// one query per POST, or {queries: [...]} run as one transaction (db.batch).
//
//   SHIM_TARGET=postgresql://postgres@localhost:5432/nextquest node scripts/neon-http-shim.mjs
//   then in .dev.vars:  NEON_HTTP_PROXY_ENDPOINT=http://127.0.0.1:4445/sql
//   (DATABASE_URL just needs to be a well-formed postgres URL; the shim
//   ignores it and connects to SHIM_TARGET.)
//
// Local tooling only — never deploy it, never point it at production.
import http from "node:http";

import pg from "pg";

const PORT = Number(process.env.SHIM_PORT ?? 4445);
const TARGET = process.env.SHIM_TARGET ?? "postgresql://postgres@localhost:5432/nextquest";
const pool = new pg.Pool({ connectionString: TARGET, max: 10 });
// Hand every value back as text; the driver does its own type parsing.
const rawTypes = { getTypeParser: () => (value) => value };

async function run(client, { query, params }) {
	const result = await client.query({ text: query, values: params ?? [], rowMode: "array", types: rawTypes });
	return {
		fields: result.fields.map((field) => ({ name: field.name, dataTypeID: field.dataTypeID })),
		command: result.command,
		rowCount: result.rowCount,
		rows: result.rows,
		rowAsArray: true,
	};
}

http
	.createServer(async (req, res) => {
		let body = "";
		for await (const chunk of req) body += chunk;
		const client = await pool.connect();
		try {
			const payload = JSON.parse(body);
			let out;
			if (Array.isArray(payload.queries)) {
				await client.query("BEGIN");
				try {
					const results = [];
					for (const query of payload.queries) results.push(await run(client, query));
					await client.query("COMMIT");
					out = { results };
				} catch (error) {
					await client.query("ROLLBACK");
					throw error;
				}
			} else {
				out = await run(client, payload);
			}
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify(out));
		} catch (error) {
			// Neon returns 400 + the Postgres error fields; the driver rethrows them.
			res.writeHead(400, { "content-type": "application/json" });
			res.end(JSON.stringify({ message: error.message, code: error.code, detail: error.detail, constraint: error.constraint }));
		} finally {
			client.release();
		}
	})
	.listen(PORT, "127.0.0.1", () => console.log(`neon-http shim on 127.0.0.1:${PORT} -> ${TARGET}`));
