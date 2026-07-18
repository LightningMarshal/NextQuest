// CSV assembly for the data export (RFC 4180): pure functions only, used by
// the /api/export route and tests. JSON export needs no helper — it's a
// straight serialization of the assembled snapshot.

export type CsvValue = string | number | boolean | Date | null | undefined;

/** Quote a single CSV field per RFC 4180 (double up embedded quotes). */
export function escapeCsvValue(value: CsvValue): string {
	if (value === null || value === undefined) return "";
	const text =
		value instanceof Date ? value.toISOString() : typeof value === "string" ? value : String(value);
	if (/[",\r\n]/.test(text)) {
		return `"${text.replaceAll('"', '""')}"`;
	}
	return text;
}

/**
 * Rows to a CSV document: header line + one line per row, CRLF-delimited
 * (RFC 4180), with a trailing newline so files concatenate/append cleanly.
 */
export function toCsv(header: string[], rows: CsvValue[][]): string {
	const lines = [header, ...rows].map((row) => row.map(escapeCsvValue).join(","));
	return lines.join("\r\n") + "\r\n";
}
