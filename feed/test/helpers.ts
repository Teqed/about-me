import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AtRecord, Listing, Row, Timestamp, Verb } from "../src/model.ts";

export interface Fields {
	[key: string]: unknown;
}

export interface Response {
	records: AtRecord<Fields>[];
}

export function fixture(name: string): string {
	return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

export function json<T>(name: string): T {
	return JSON.parse(fixture(name));
}

export function response(name: string): Response {
	return json(name);
}

export function listing(name: string): Listing {
	return json(name);
}

export function time(rfc3339: string): Timestamp {
	return new Date(rfc3339).toISOString();
}

export function row(verb: Verb, text: string, t: string, href: string): Row {
	return { verb, text, t: time(t), href };
}

export function nth<T>(list: T[], index: number): T {
	const item = list[index];
	assert(item !== undefined, `nothing at ${index}`);
	return item;
}

export function texts(rows: Row[]): string[] {
	return rows.map((row) => row.text);
}
