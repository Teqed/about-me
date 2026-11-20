export type Timestamp = string;

export type Verb =
	| "posted"
	| "pull"
	| "ticket"
	| "comment"
	| "revised"
	| "starred"
	| "pushed";

export interface Row {
	verb: Verb;
	text: string;
	t: Timestamp;
	href: string;
}

export interface Section {
	ok_at: Timestamp | null;
	rows: Row[];
}

export interface Feeds {
	bsky: Section;
	tangled: Section;
}

export interface AtRecord<T = unknown> {
	uri: string;
	value: T;
}

export interface Listing<T = unknown> {
	records: AtRecord<T>[];
}

export interface Cached {
	etag: string;
	listing: Listing;
}

export type Known =
	| { kind: "ticket"; title: string; pull: boolean }
	| { kind: "comment"; text: string; ticket: string }
	| { kind: "patch"; ticket: string }
	| { kind: "repo"; owner: string; name: string }
	| { kind: "skipped" };

export interface Pds {
	url: string;
	at: Timestamp;
}

export interface Commit {
	message: string;
	href: string;
	t: Timestamp;
}

export interface Pin {
	rev: string;
	commit: Commit | null;
	current: boolean;
	tries: number;
}

export interface State {
	rev: string | null;
	cache: { [url: string]: Cached };
	records: { [uri: string]: Known };
	pds: { [did: string]: Pds };
	pins: { [did: string]: Pin };
}

export type Want =
	| { kind: "pds"; did: string }
	| { kind: "record"; uri: string };

export interface AtUri {
	did: string;
	collection: string;
	rkey: string;
}

const RFC3339 =
	/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/;

export function emptyFeeds(): Feeds {
	return {
		bsky: { ok_at: null, rows: [] },
		tangled: { ok_at: null, rows: [] },
	};
}

export function emptyState(): State {
	return { rev: null, cache: {}, records: {}, pds: {}, pins: {} };
}

export function field(value: unknown, key: string, inner?: string): unknown {
	const found = isObject(value) ? value[key] : undefined;
	return inner === undefined ? found : field(found, inner);
}

export function stringField(
	value: unknown,
	key: string,
	inner?: string,
): string | null {
	const found = field(value, key, inner);
	return typeof found === "string" ? found : null;
}

export function instant(value: unknown): number | null {
	if (typeof value !== "string" || !RFC3339.test(value)) {
		return null;
	}
	const ms = Date.parse(value);
	return Number.isNaN(ms) || !isRealDay(value.slice(0, 10)) ? null : ms;
}

function isRealDay(date: string): boolean {
	return date.slice(8) <= "28" || timestamp(Date.parse(date)).startsWith(date);
}

export function timestamp(ms: number): Timestamp {
	return new Date(ms).toISOString();
}

export function readState(json: unknown): State {
	return readWhole(json) ?? emptyState();
}

export function parseAtUri(uri: string): AtUri | null {
	if (!uri.startsWith("at://")) {
		return null;
	}
	const parts = uri.slice("at://".length).split("/");
	const [did, collection, rkey] = parts;
	if (parts.length !== 3 || !did || !collection || !rkey) {
		return null;
	}
	return { did, collection, rkey };
}

export function atUri(uri: AtUri): string {
	return `at://${uri.did}/${uri.collection}/${uri.rkey}`;
}

function isObject(value: unknown): value is { [key: string]: unknown } {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readWhole(json: unknown): State | null {
	if (!isObject(json)) {
		return null;
	}
	const rev = json.rev ?? null;
	if (rev !== null && typeof rev !== "string") {
		return null;
	}
	const cache = readMap(json.cache, readCached);
	const records = readMap(json.records, readKnown);
	const pds = readMap(json.pds, readPds);
	const pins = readMap(json.pins, readPin);
	if (cache === null || records === null || pds === null || pins === null) {
		return null;
	}
	return { rev, cache, records, pds, pins };
}

function readMap<T>(
	json: unknown,
	read: (json: unknown) => T | null,
): { [key: string]: T } | null {
	if (json === undefined) {
		return {};
	}
	if (!isObject(json)) {
		return null;
	}
	const map: { [key: string]: T } = {};
	for (const key of Object.keys(json)) {
		const value = read(json[key]);
		if (value === null) {
			return null;
		}
		map[key] = value;
	}
	return map;
}

function readCached(json: unknown): Cached | null {
	const etag = stringField(json, "etag");
	const records = field(json, "listing", "records");
	if (etag === null || !Array.isArray(records)) {
		return null;
	}
	const listing: Listing = { records: [] };
	for (const record of records) {
		const uri = stringField(record, "uri");
		const value = field(record, "value");
		if (uri === null || value === undefined) {
			return null;
		}
		listing.records.push({ uri, value });
	}
	return { etag, listing };
}

function readKnown(json: unknown): Known | null {
	const kind = field(json, "kind");
	if (kind === "ticket") {
		const title = stringField(json, "title");
		const pull = field(json, "pull");
		if (title === null || typeof pull !== "boolean") {
			return null;
		}
		return { kind, title, pull };
	}
	if (kind === "comment") {
		const text = stringField(json, "text");
		const ticket = stringField(json, "ticket");
		return text === null || ticket === null ? null : { kind, text, ticket };
	}
	if (kind === "patch") {
		const ticket = stringField(json, "ticket");
		return ticket === null ? null : { kind, ticket };
	}
	if (kind === "repo") {
		const owner = stringField(json, "owner");
		const name = stringField(json, "name");
		return owner === null || name === null ? null : { kind, owner, name };
	}
	return kind === "skipped" ? { kind } : null;
}

function readPds(json: unknown): Pds | null {
	const url = stringField(json, "url");
	const at = stringField(json, "at");
	if (url === null || at === null || instant(at) === null) {
		return null;
	}
	return { url, at };
}

function readPin(json: unknown): Pin | null {
	const rev = stringField(json, "rev");
	const current = field(json, "current");
	const tries = field(json, "tries");
	const saved = field(json, "commit") ?? null;
	const commit = saved === null ? null : readCommit(saved);
	if (rev === null || typeof current !== "boolean" || !isCount(tries)) {
		return null;
	}
	if (saved !== null && commit === null) {
		return null;
	}
	return { rev, commit, current, tries };
}

function isCount(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function readCommit(json: unknown): Commit | null {
	const message = stringField(json, "message");
	const href = stringField(json, "href");
	const t = stringField(json, "t");
	if (message === null || href === null || t === null || instant(t) === null) {
		return null;
	}
	return { message, href, t };
}
