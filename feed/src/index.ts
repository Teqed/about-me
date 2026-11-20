import * as bsky from "./bsky.ts";
import * as config from "./config.ts";
import { Client } from "./fetch.ts";
import * as listings from "./listings.ts";
import { emptyFeeds, parseAtUri, readState } from "./model.ts";
import type { Feeds, Listing, Row, State, Want } from "./model.ts";
import * as pds from "./pds.ts";
import * as pins from "./pins.ts";
import * as select from "./select.ts";
import * as tangled from "./tangled.ts";

type Result<T> = { value: T; error?: never } | { value?: never; error: string };

async function json(client: Client, url: string): Promise<Result<unknown>> {
	const read = await client.get(url);
	if (read.kind === "fresh") {
		try {
			return { value: JSON.parse(read.body) };
		} catch (error) {
			return { error: String(error) };
		}
	}
	if (read.kind === "unchanged") return { error: "unexpected 304" };
	if (read.kind === "unknown") return { error: read.reason };
	return { error: "not found" };
}

function revision(value: unknown): string | null {
	if (
		value &&
		typeof value === "object" &&
		"rev" in value &&
		typeof value.rev === "string"
	)
		return value.rev;
	return null;
}

async function listing(
	client: Client,
	state: State,
	home: string,
	source: listings.Source,
	notes: string[],
): Promise<Result<Listing>> {
	const url = listings.url(source, home);
	const cached = state.cache[url];
	const read = await client.get(url, cached?.etag ?? null);
	if (read.kind === "unchanged")
		return cached
			? { value: cached.listing }
			: { error: "304 without cached listing" };
	if (read.kind === "unknown")
		return { error: `${source.collection}: ${read.reason}` };
	if (read.kind !== "fresh")
		return { error: `${source.collection}: not found` };
	let parsed: Listing;
	try {
		parsed = JSON.parse(read.body) as Listing;
		if (
			!parsed ||
			!Array.isArray(parsed.records) ||
			parsed.records.some(
				(record) =>
					!record || typeof record.uri !== "string" || !("value" in record),
			)
		)
			throw new Error("invalid listing");
	} catch (error) {
		return { error: `${source.collection}: ${String(error)}` };
	}
	const value = listings.slim(source, parsed);
	if (read.etag !== null)
		state.cache[url] = { etag: read.etag, listing: value };
	else {
		notes.push(`${source.collection}: no ETag`);
		delete state.cache[url];
	}
	return { value };
}

async function homePds(
	client: Client,
	state: State,
	now: Date,
	notes: string[],
): Promise<string> {
	const known = pds.known(state, config.ME, now);
	if (known !== null) return known;
	const document = await json(client, `https://plc.directory/${config.ME}`);
	if (document.error !== undefined)
		notes.push(`home PDS: ${document.error}; using fallback`);
	else pds.remember(state, config.ME, document.value, now);
	return state.pds[config.ME]?.url ?? config.HOME_PDS;
}

async function fetchRecord(
	client: Client,
	state: State,
	uri: string,
): Promise<string | null> {
	const at = parseAtUri(uri);
	if (!at) {
		tangled.skip(state, uri);
		return "invalid AT URI; skipped";
	}
	const server = Object.hasOwn(state.pds, at.did)
		? state.pds[at.did]
		: undefined;
	if (!server) return "PDS unknown";
	const read = await client.get(
		`${server.url}/xrpc/com.atproto.repo.getRecord?repo=${at.did}&collection=${at.collection}&rkey=${at.rkey}`,
	);
	if (read.kind === "fresh") {
		let value: unknown;
		try {
			value = JSON.parse(read.body);
		} catch {
			tangled.skip(state, uri);
			return "unreadable record JSON; skipped";
		}
		if (value !== null && typeof value === "object" && "value" in value) {
			tangled.remember(state, uri, value.value);
			return null;
		}
		tangled.skip(state, uri);
		return "missing record value; skipped";
	}
	if (read.kind === "repoNotFound") {
		tangled.skipRepo(state, at.did);
		return "repository not found; skipped";
	}
	if (read.kind === "notFound") {
		tangled.skip(state, uri);
		return "record not found; skipped";
	}
	if (read.kind === "httpNotFound") return "HTTP 404 or 410";
	if (read.kind === "unchanged") return "unexpected 304";
	return read.reason;
}

async function fetchWant(
	client: Client,
	state: State,
	want: Want,
	now: Date,
): Promise<string | null> {
	if (want.kind === "record") return fetchRecord(client, state, want.uri);
	const read = await client.get(`https://plc.directory/${want.did}`);
	if (read.kind === "fresh") {
		try {
			pds.remember(state, want.did, JSON.parse(read.body), now);
			return null;
		} catch (error) {
			return String(error);
		}
	}
	if (
		read.kind === "httpNotFound" ||
		read.kind === "repoNotFound" ||
		(read.kind === "notFound" && read.status === 404)
	) {
		tangled.skipRepo(state, want.did);
		return "repository not found; skipped";
	}
	if (read.kind === "notFound") return "record not found";
	if (read.kind === "unchanged") return "unexpected 304";
	return read.reason;
}

async function fetchWants(
	client: Client,
	state: State,
	work: tangled.Item[],
	now: Date,
	notes: string[],
): Promise<void> {
	const attempted = new Set<string>();
	while (true) {
		const wanted = tangled.wanted(work, state, now);
		if (!wanted.length) break;
		if (client.requests >= config.BUDGET - config.PINS.length * 2) {
			notes.push("tangled: budget reserved for pins");
			break;
		}
		const want = wanted.find((item) => !attempted.has(JSON.stringify(item)));
		if (!want) break;
		attempted.add(JSON.stringify(want));
		const error = await fetchWant(client, state, want, now);
		if (error)
			notes.push(
				`${want.kind === "pds" ? `Pds(${JSON.stringify(want.did)})` : `Record(${JSON.stringify(want.uri)})`}: ${error}`,
			);
	}
}

async function fetchPins(
	client: Client,
	state: State,
	notes: string[],
): Promise<void> {
	for (const [name, did] of config.PINS) {
		const result = await json(
			client,
			`${config.KNOT}/xrpc/com.atproto.sync.getLatestCommit?did=${did}`,
		);
		const rev = revision(result.value);
		if (rev === null) {
			notes.push(`${name}: rev unavailable`);
			continue;
		}
		let pin = pins.seen(state.pins[did], rev);
		if (pins.wantsAtom(pin)) {
			const read = await client.getPrefix(
				`https://tangled.org/${config.HANDLE}/${name}/feed.atom`,
				16 * 1024,
			);
			if (read.kind === "fresh") pin = pins.readAtom(pin, read.body);
			else notes.push(`${name}: atom unavailable`);
		}
		state.pins[did] = pin;
	}
}

async function refresh(
	env: Env,
	client: Client,
	notes: string[],
): Promise<void> {
	const stateText = (await (await env.STATE.get("state.json"))?.text()) ?? null;
	let state: State;
	try {
		state = readState(stateText === null ? {} : JSON.parse(stateText));
	} catch {
		state = readState({});
	}
	const oldText = (await (await env.FEED.get("feeds.json"))?.text()) ?? null;
	let old: Feeds = emptyFeeds();
	if (oldText !== null) {
		try {
			const parsed = JSON.parse(oldText) as Feeds;
			if (
				!parsed?.bsky ||
				!parsed?.tangled ||
				!Array.isArray(parsed.bsky.rows) ||
				!Array.isArray(parsed.tangled.rows)
			)
				throw new Error("invalid feeds");
			old = parsed;
		} catch (error) {
			notes.push(`feeds.json: ${String(error)}; starting fresh`);
		}
	}
	const now = new Date();
	const home = await homePds(client, state, now, notes);
	const rev = revision(
		(
			await json(
				client,
				`${home}/xrpc/com.atproto.sync.getLatestCommit?did=${config.ME}`,
			)
		).value,
	);
	const cached = listings.cached(state, home, rev);
	let posts: Result<Listing>,
		attestations: Result<Listing>,
		stars: Result<Listing>;
	if (cached) {
		notes.push("unchanged rev: listings reused");
		posts = { value: cached.posts };
		attestations = { value: cached.attestations };
		stars = { value: cached.stars };
	} else {
		posts = await listing(client, state, home, listings.POSTS, notes);
		attestations = await listing(
			client,
			state,
			home,
			listings.ATTESTATIONS,
			notes,
		);
		stars = await listing(client, state, home, listings.STARS, notes);
		listings.rememberRev(
			state,
			rev,
			posts.error === undefined &&
				attestations.error === undefined &&
				stars.error === undefined,
		);
	}
	const feeds: Feeds = { ...old };
	if (posts.error !== undefined) notes.push(posts.error);
	else feeds.bsky = select.settle(old.bsky, bsky.rows(posts.value), now);
	if (attestations.error === undefined && stars.error === undefined) {
		const work = tangled.items(attestations.value, stars.value);
		await fetchWants(client, state, work, now, notes);
		await fetchPins(client, state, notes);
		const remaining = tangled.wanted(work, state, now);
		tangled.forget(state, work);
		const pinRows: Row[] = [];
		for (const [name, did] of config.PINS) {
			const pin = state.pins[did];
			const row = pin && pins.row(name, pin);
			if (row) pinRows.push(row);
		}
		feeds.tangled = select.settle(
			old.tangled,
			select.tangled(tangled.activity(work, state), pinRows),
			now,
		);
		if (remaining.length)
			notes.push(`tangled: ${remaining.length} wants remain`);
	} else {
		if (attestations.error !== undefined) notes.push(attestations.error);
		if (stars.error !== undefined) notes.push(stars.error);
		notes.push("tangled listings unavailable");
	}
	const feedText = JSON.stringify(feeds);
	if (feedText !== oldText)
		await env.FEED.put("feeds.json", feedText, {
			httpMetadata: {
				contentType: "application/json",
				cacheControl: "public, max-age=600",
			},
		});
	const nextState = JSON.stringify(state);
	if (nextState !== stateText)
		await env.STATE.put("state.json", nextState, {
			httpMetadata: { contentType: "application/json" },
		});
	notes.push(
		`rows changed=${JSON.stringify(feeds.bsky.rows) !== JSON.stringify(old.bsky.rows) || JSON.stringify(feeds.tangled.rows) !== JSON.stringify(old.tangled.rows)}`,
	);
}

export default {
	async scheduled(_controller, env, _ctx): Promise<void> {
		const client = new Client();
		const notes: string[] = [];
		try {
			await refresh(env, client, notes);
		} catch (error) {
			notes.push(String(error));
		}
		console.log(
			`feed: requests=${client.requests} 304=${client.unchanged} ${notes.join("; ")}`,
		);
	},
} satisfies ExportedHandler<Env>;
