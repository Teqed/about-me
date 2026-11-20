import { HANDLE, ME, ROWS } from "./config.ts";
import {
	atUri,
	field,
	instant,
	type Known,
	type Listing,
	parseAtUri,
	type Row,
	type State,
	stringField,
	timestamp,
	type Verb,
	type Want,
} from "./model.ts";
import * as pds from "./pds.ts";
import { line } from "./text.ts";

const TICKET = "org.tangled.track.ticket";
const COMMENT = "org.tangled.feed.comment";
const PATCH = "org.tangled.review.patch";
const MANIFEST = "org.tangled.repo.manifest";
const WORK = [TICKET, COMMENT, PATCH];

export interface Item {
	at: number;
	repo: string;
	subject: Subject | null;
}

interface Subject {
	uri: string;
	rkey: string;
}

interface Work {
	verb: Verb;
	text: string;
	path: string;
}

export function wanted(items: Item[], state: State, now: Date): Want[] {
	const dids = new Set<string>();
	const uris = new Set<string>();
	let usable = 0;
	for (const item of items) {
		if (usable === ROWS) {
			break;
		}
		const needed = needs(item, state);
		if (needed.some((uri) => state.records[uri]?.kind === "skipped")) {
			continue;
		}
		usable++;
		for (const uri of needed) {
			if (state.records[uri] === undefined) {
				uris.add(uri);
				if (pds.known(state, item.repo, now) === null) {
					dids.add(item.repo);
				}
			}
		}
	}
	const wants: Want[] = [];
	for (const did of [...dids].sort()) {
		wants.push({ kind: "pds", did });
	}
	for (const uri of [...uris].sort()) {
		wants.push({ kind: "record", uri });
	}
	return wants;
}

export function remember(state: State, uri: string, value: unknown): void {
	const collection = parseAtUri(uri)?.collection;
	state.records[uri] = read(collection, value) ?? { kind: "skipped" };
}

export function skip(state: State, uri: string): void {
	state.records[uri] = { kind: "skipped" };
}

export function skipRepo(state: State, did: string): void {
	skip(state, manifestUri(did));
}

export function activity(items: Item[], state: State): Row[] {
	const rows: Row[] = [];
	for (const item of items) {
		const found = row(item, state);
		if (found !== null) {
			rows.push(found);
		}
	}
	return rows;
}

export function forget(state: State, items: Item[]): void {
	const records: State["records"] = {};
	const addresses: State["pds"] = {};
	keep(addresses, state.pds, ME);
	for (const item of items) {
		keep(addresses, state.pds, item.repo);
		for (const uri of needs(item, state)) {
			keep(records, state.records, uri);
		}
	}
	state.records = records;
	state.pds = addresses;
}

function keep<T>(
	kept: { [key: string]: T },
	from: { [key: string]: T },
	key: string,
): void {
	const value = Object.hasOwn(from, key) ? from[key] : undefined;
	if (value !== undefined) {
		kept[key] = value;
	}
}

export function items(attestations: Listing, stars: Listing): Item[] {
	const items: Item[] = [];
	for (const record of attestations.records) {
		const uri = stringField(record.value, "subject", "uri") ?? "";
		const subject = parseAtUri(uri);
		const at = instant(stringField(record.value, "createdAt"));
		if (subject !== null && WORK.includes(subject.collection) && at !== null) {
			const { did, rkey } = subject;
			items.push({ at, repo: did, subject: { uri, rkey } });
		}
	}
	for (const record of stars.records) {
		const repo = stringField(record.value, "subject", "identity");
		const at = instant(stringField(record.value, "createdAt"));
		if (repo !== null && at !== null) {
			items.push({ at, repo, subject: null });
		}
	}
	return items.sort((a, b) => b.at - a.at);
}

function needs(item: Item, state: State): string[] {
	const uris = [manifestUri(item.repo)];
	if (item.subject !== null) {
		const known = state.records[item.subject.uri];
		if (known?.kind === "patch") {
			uris.push(ticketUri(item.repo, known.ticket));
		}
		uris.push(item.subject.uri);
	}
	return uris;
}

function isRkey(text: string): boolean {
	return text !== "" && !text.includes("/");
}

function manifestUri(repo: string): string {
	return atUri({ did: repo, collection: MANIFEST, rkey: "self" });
}

function ticketUri(repo: string, number: string): string {
	return atUri({ did: repo, collection: TICKET, rkey: number });
}

function read(collection: string | undefined, value: unknown): Known | null {
	if (collection === TICKET) {
		const title = line(stringField(value, "title", "text") ?? "");
		const pull = field(value, "targetBranch") != null;
		return title === null ? null : { kind: "ticket", title, pull };
	}
	if (collection === COMMENT) {
		const on = parseAtUri(stringField(value, "subject", "uri") ?? "");
		const text = line(stringField(value, "body", "text") ?? "");
		if (on?.collection !== TICKET || text === null) {
			return null;
		}
		return { kind: "comment", text, ticket: on.rkey };
	}
	if (collection === PATCH) {
		const ticket = stringField(value, "ticket");
		return ticket !== null && isRkey(ticket) ? { kind: "patch", ticket } : null;
	}
	if (collection === MANIFEST) {
		const owner = stringField(value, "declaration", "owner");
		const name = stringField(value, "declaration", "name");
		return owner === null || name === null
			? null
			: { kind: "repo", owner, name };
	}
	return null;
}

function row(item: Item, state: State): Row | null {
	const repo = state.records[manifestUri(item.repo)];
	if (repo?.kind !== "repo") {
		return null;
	}
	const owner = repo.owner === ME ? HANDLE : repo.owner;
	const home = `https://tangled.org/${owner}/${repo.name}`;
	const t = timestamp(item.at);
	if (item.subject === null) {
		return { verb: "starred", text: repo.name, t, href: home };
	}
	const done = work(item.repo, item.subject, state);
	if (done === null) {
		return null;
	}
	const text = `${repo.name}: ${done.text}`;
	return { verb: done.verb, text, t, href: home + done.path };
}

function work(repo: string, subject: Subject, state: State): Work | null {
	const { uri, rkey } = subject;
	const known = state.records[uri];
	if (known?.kind === "ticket") {
		return known.pull
			? { verb: "pull", text: known.title, path: `/pulls/${rkey}` }
			: { verb: "ticket", text: known.title, path: `/issues/${rkey}` };
	}
	if (known?.kind === "comment") {
		const path = `/issues/${known.ticket}#comment-${rkey}`;
		return { verb: "comment", text: known.text, path };
	}
	if (known?.kind === "patch") {
		const pull = state.records[ticketUri(repo, known.ticket)];
		if (pull?.kind !== "ticket") {
			return null;
		}
		const path = `/pulls/${known.ticket}`;
		return { verb: "revised", text: pull.title, path };
	}
	return null;
}
