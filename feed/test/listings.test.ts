import assert from "node:assert/strict";
import { test } from "node:test";
import { rows } from "../src/bsky.ts";
import { HOME_PDS, ROWS } from "../src/config.ts";
import {
	ATTESTATIONS,
	cached,
	POSTS,
	rememberRev,
	STARS,
	type Source,
	slim,
	url,
} from "../src/listings.ts";
import {
	emptyState,
	type Listing,
	readState,
	type State,
} from "../src/model.ts";
import { fixture, listing, nth } from "./helpers.ts";

const REV = "3n2n756t6kv2a";
const SOURCES: [Source, string][] = [
	[POSTS, "posts.json"],
	[ATTESTATIONS, "attestations.json"],
	[STARS, "stars.json"],
];

function readAt(rev: string): State {
	const state = emptyState();
	state.rev = rev;
	for (const [source, name] of SOURCES) {
		state.cache[url(source, HOME_PDS)] = {
			etag: 'W/"an-etag"',
			listing: listing(name),
		};
	}
	return state;
}

function size(listing: Listing): number {
	return JSON.stringify(listing).length;
}

test("a_listing_is_asked_for_by_collection_and_limit", () => {
	assert.equal(
		url(STARS, HOME_PDS),
		"https://shimeji.us-east.host.bsky.network/xrpc/com.atproto.repo.listRecords" +
			"?repo=did:plc:jrtgsidnmxaen4offglr5lsh&collection=org.tangled.feed.star&limit=10",
	);
});

test("an_unchanged_rev_reuses_the_cached_listings", () => {
	const listings = cached(readAt(REV), HOME_PDS, REV);
	assert(listings !== null, "cached listings");
	assert.deepEqual(listings.posts, listing("posts.json"));
	assert.deepEqual(listings.attestations, listing("attestations.json"));
	assert.deepEqual(listings.stars, listing("stars.json"));
});

test("a_new_or_unread_rev_reads_them_again", () => {
	const state = readAt(REV);
	assert.equal(cached(state, HOME_PDS, "3n2n8aaaaaa2a"), null);
	assert.equal(cached(state, HOME_PDS, null), null);
	const never = readAt(REV);
	never.rev = null;
	assert.equal(cached(never, HOME_PDS, null), null);
});

test("a_cache_that_is_not_whole_reads_them_again", () => {
	for (const [source] of SOURCES) {
		const missing = readAt(REV);
		delete missing.cache[url(source, HOME_PDS)];
		assert.equal(cached(missing, HOME_PDS, REV), null, source.collection);
	}

	assert.equal(cached(readAt(REV), "https://pds.example", REV), null);
});

test("the_rev_is_remembered_only_when_every_listing_was_read", () => {
	const newer = "3n2n8aaaaaa2a";

	const read = readAt(REV);
	rememberRev(read, newer, true);
	assert.equal(read.rev, newer);

	const failed = readAt(REV);
	rememberRev(failed, newer, false);
	assert.equal(failed.rev, REV);
	assert.equal(cached(failed, HOME_PDS, newer), null);

	const unknown = readAt(REV);
	rememberRev(unknown, null, true);
	assert.equal(unknown.rev, REV);
});

test("slimmed_posts_give_the_same_rows_in_a_fraction_of_the_space", () => {
	const full = listing("posts.json");
	const slimmed = slim(POSTS, full);
	assert.deepEqual(rows(slimmed), rows(full));
	assert(slimmed.records.length <= ROWS);
	assert(size(slimmed) * 8 < fixture("posts.json").length);
});

test("slimmed_attestations_and_stars_keep_only_subject_and_time", () => {
	for (const [source, name] of SOURCES.slice(1)) {
		const full = listing(name);
		const slimmed = slim(source, full);
		assert.equal(slimmed.records.length, full.records.length);
		assert(size(slimmed) * 2 < fixture(name).length);
		for (const record of slimmed.records) {
			assert.deepEqual(Object.keys(record), ["uri", "value"]);
			assert.deepEqual(Object.keys(record.value as object), [
				"createdAt",
				"subject",
			]);
		}
	}
});

test("a_state_holding_slim_listings_survives_being_saved", () => {
	const state = readAt(REV);
	for (const [source, name] of SOURCES) {
		state.cache[url(source, HOME_PDS)] = {
			etag: 'W/"an-etag"',
			listing: slim(source, listing(name)),
		};
	}
	const saved = JSON.stringify(state);
	assert.deepEqual(readState(JSON.parse(saved)), state);
	assert(saved.length < 12 * 1024);
});

test("a_slim_listing_is_the_one_the_rust_job_kept", () => {
	const kept = readState(JSON.parse(fixture("state.json"))).cache;
	for (const [source, name] of SOURCES) {
		const slimmed = slim(source, listing(name));
		assert.deepEqual(slimmed, kept[url(source, HOME_PDS)]?.listing, name);
		assert.deepEqual(Object.keys(slimmed), ["records"]);
	}
});

test("a_slim_subject_keeps_its_own_field_or_nothing", () => {
	const star = {
		uri: "at://did:plc:jrtgsidnmxaen4offglr5lsh/org.tangled.feed.star/3mzjaeuzqho2a",
		value: {
			createdAt: "2026-11-04T20:54:27.243Z",
			subject: { identity: "did:plc:a", uri: "at://did:plc:a/b/c" },
		},
	};
	const byIdentity = {
		createdAt: star.value.createdAt,
		subject: { identity: "did:plc:a" },
	};
	const byUri = {
		createdAt: star.value.createdAt,
		subject: { uri: "at://did:plc:a/b/c" },
	};
	assert.deepEqual(
		nth(slim(STARS, { records: [star] }).records, 0).value,
		byIdentity,
	);
	assert.deepEqual(
		nth(slim(ATTESTATIONS, { records: [star] }).records, 0).value,
		byUri,
	);

	const bare = { uri: star.uri, value: "nothing" };
	assert.equal(
		JSON.stringify(slim(STARS, { records: [bare] })),
		JSON.stringify({
			records: [
				{
					uri: star.uri,
					value: { createdAt: null, subject: { identity: null } },
				},
			],
		}),
	);
});
