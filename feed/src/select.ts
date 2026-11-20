import { ROWS } from "./config.ts";
import type { Row, Section } from "./model.ts";

interface Dated {
	at: number;
	row: Row;
}

export function tangled(activity: Row[], pins: Row[]): Row[] {
	const rows = newestFirst(dated(pins)).slice(0, ROWS);
	const beside = newestFirst(dated(activity)).slice(0, ROWS - rows.length);
	return newestFirst(rows.concat(beside)).map((dated) => dated.row);
}

function dated(rows: Row[]): Dated[] {
	return rows.map((row) => ({ at: Date.parse(row.t), row }));
}

function newestFirst(rows: Dated[]): Dated[] {
	return rows.toSorted((a, b) => b.at - a.at);
}

export function settle(
	previous: Section,
	fresh: Row[] | null,
	now: Date,
): Section {
	return fresh === null ? previous : { ok_at: now.toISOString(), rows: fresh };
}
