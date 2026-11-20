import assert from "node:assert/strict";
import { test } from "node:test";
import {
	atUri,
	emptyFeeds,
	emptyState,
	type Feeds,
	field,
	instant,
	parseAtUri,
	readState,
	stringField,
	timestamp,
} from "../src/model.ts";
import { HOME_PDS, ME, PINS } from "../src/config.ts";
import { type Fields, json, nth } from "./helpers.ts";

test("feeds_json_is_the_shape_the_page_reads", () => {
	const feeds: Feeds = {
		bsky: {
			ok_at: "2026-11-19T03:40:00Z",
			rows: [
				{
					verb: "posted",
					text: "first line of the post",
					t: "2026-11-18T22:01:12.101Z",
					href: "https://bsky.app/profile/quilling.dev/post/3n2",
				},
			],
		},
		tangled: emptyFeeds().tangled,
	};
	const expected = {
		bsky: {
			ok_at: "2026-11-19T03:40:00Z",
			rows: [
				{
					verb: "posted",
					text: "first line of the post",
					t: "2026-11-18T22:01:12.101Z",
					href: "https://bsky.app/profile/quilling.dev/post/3n2",
				},
			],
		},
		tangled: { ok_at: null, rows: [] },
	};
	assert.deepEqual(JSON.parse(JSON.stringify(feeds)), expected);
	assert.deepEqual(emptyFeeds(), {
		bsky: { ok_at: null, rows: [] },
		tangled: { ok_at: null, rows: [] },
	});
	assert.notEqual(emptyFeeds().bsky.rows, emptyFeeds().bsky.rows);
});

test("state_survives_being_saved", () => {
	const state = emptyState();
	state.rev = "3n2fph2mpzl22";
	state.cache["https://pds.example/listing"] = {
		etag: 'W/"22db"',
		listing: { records: [] },
	};
	state.pins["did:plc:dgh55jj6tttztejcqnmcsz2h"] = {
		rev: "3n2fph2mpzl22",
		commit: null,
		current: false,
		tries: 2,
	};
	state.records["at://did:plc:a/org.tangled.track.ticket/1"] = {
		kind: "ticket",
		title: "a pull",
		pull: true,
	};
	state.records["at://did:plc:a/org.tangled.feed.comment/3n2"] = {
		kind: "skipped",
	};
	const saved = JSON.stringify(state);
	assert.deepEqual(readState(JSON.parse(saved)), state);
});

test("a_state_saved_before_a_field_existed_still_loads", () => {
	const state = readState({ rev: "3n2fph2mpzl22", etags: {} });
	assert.equal(state.rev, "3n2fph2mpzl22");
	assert.deepEqual(state.records, {});
	assert.deepEqual(state, { ...emptyState(), rev: "3n2fph2mpzl22" });
});

test("at_uris_split_into_their_three_parts_and_back", () => {
	const uri =
		"at://did:plc:jj6ajj6duxnlthwtnob4qyuv/org.tangled.track.ticket/646";
	const parsed = parseAtUri(uri);
	assert(parsed !== null);
	assert.equal(parsed.did, "did:plc:jj6ajj6duxnlthwtnob4qyuv");
	assert.equal(parsed.collection, "org.tangled.track.ticket");
	assert.equal(parsed.rkey, "646");
	assert.equal(atUri(parsed), uri);
});

test("what_does_not_name_one_record_is_not_parsed", () => {
	for (const notARecord of [
		"",
		"https://tangled.org/quilling.dev",
		"at://did:plc:jj6ajj6duxnlthwtnob4qyuv",
		"at://did:plc:jj6ajj6duxnlthwtnob4qyuv/org.tangled.track.ticket",
		"at://did:plc:jj6ajj6duxnlthwtnob4qyuv/org.tangled.track.ticket/",
		"at://did:plc:jj6ajj6duxnlthwtnob4qyuv/org.tangled.track.ticket/646/extra",
		"at:///org.tangled.track.ticket/646",
		"at://did:plc:jj6ajj6duxnlthwtnob4qyuv//646",
		"at://did:plc:jj6ajj6duxnlthwtnob4qyuv/org.tangled.track.ticket/646/",
		"see at://did:plc:jj6ajj6duxnlthwtnob4qyuv/org.tangled.track.ticket/646",
		"did:plc:jj6ajj6duxnlthwtnob4qyuv/org.tangled.track.ticket/646",
		"ta://did:plc:jj6ajj6duxnlthwtnob4qyuv/org.tangled.track.ticket/646",
	]) {
		assert.equal(parseAtUri(notARecord), null, JSON.stringify(notARecord));
	}
});

test("an_empty_state_knows_nothing", () => {
	const empty = { rev: null, cache: {}, records: {}, pds: {}, pins: {} };
	assert.deepEqual(emptyState(), empty);
	assert.deepEqual(readState({}), empty);
	assert.notEqual(emptyState().records, emptyState().records);
});

const POSTS_URL = `${HOME_PDS}/xrpc/com.atproto.repo.listRecords?repo=${ME}&collection=app.bsky.feed.post&limit=30`;
const NOT_YET = "did:plc:nocommityet";

function written(): Fields {
	return json("state.json");
}

function parent(state: Fields, path: string[]): [Fields, string] {
	let target = state;
	for (const key of path.slice(0, -1)) {
		const inner = target[key];
		assert(typeof inner === "object" && inner !== null, key);
		target = inner as Fields;
	}
	return [target, nth(path, path.length - 1)];
}

function put(state: Fields, path: string[], value: unknown): Fields {
	const [target, key] = parent(state, path);
	target[key] = value;
	return state;
}

function remove(state: Fields, path: string[]): Fields {
	const [target, key] = parent(state, path);
	assert(key in target, key);
	delete target[key];
	return state;
}

test("a_state_json_written_by_the_rust_job_reads_as_it_is", () => {
	const state = readState(written());
	assert.deepEqual(state, written());
	assert.equal(state.rev, "3n2pj4njjbu22");
	assert.equal(Object.keys(state.cache).length, 3);
	assert.equal(state.cache[POSTS_URL]?.etag, 'W/"1f6c-posts"');
	assert.equal(state.cache[POSTS_URL]?.listing.records.length, 5);
	assert.deepEqual(
		Object.values(state.records)
			.map((known) => known.kind)
			.sort(),
		[
			"comment",
			"comment",
			"comment",
			"comment",
			"patch",
			"repo",
			"skipped",
			"ticket",
			"ticket",
		],
	);
	assert.deepEqual(state.pds["did:plc:jj6ajj6duxnlthwtnob4qyuv"], {
		url: "https://knot1.tangled.sh",
		at: "2026-11-19T03:40:00Z",
	});
	assert.deepEqual(state.pins["did:plc:rciyrnqejntqhoxlpxtl2oml"], {
		rev: "3n2fph2mpzl22",
		commit: {
			message: "reject compromised eMudhra intermediates",
			href: "https://tangled.org/quilling.dev/ratlogin/commit/cb14b5e2494d2b840ced0b2fb73d9f30b1f2a777",
			t: "2026-10-20T21:26:11Z",
		},
		current: false,
		tries: 1,
	});
	assert.equal(state.pins[NOT_YET]?.commit, null);
});

test("reading_a_state_takes_a_copy_and_leaves_out_what_it_does_not_know", () => {
	const saved = written();
	const state = readState(saved);
	assert.notEqual(state.cache, saved.cache);
	assert.notEqual(state.records, saved.records);
	assert.notEqual(state.pds, saved.pds);
	assert.notEqual(state.pins, saved.pins);

	const extended = written();
	put(extended, ["etags"], {});
	put(extended, ["cache", POSTS_URL, "at"], "2026-11-20T01:30:40.473Z");
	put(extended, ["cache", POSTS_URL, "listing", "cursor"], "3n2mn2tg5ms2y");
	put(extended, ["cache", POSTS_URL, "listing", "records", "0", "cid"], "a");
	put(extended, ["records", "at://a/b/c"], { kind: "skipped", why: "gone" });
	put(extended, ["pds", ME, "handle"], "quilling.dev");
	put(extended, ["pins", NOT_YET, "branch"], "main");
	put(extended, ["pins", PINS[0]?.[1] ?? "", "commit", "author"], "teq");
	remove(extended, ["pins", NOT_YET, "commit"]);
	const expected = put(written(), ["records", "at://a/b/c"], {
		kind: "skipped",
	});
	assert.deepEqual(readState(extended), expected);
});

test("a_state_missing_any_one_part_has_that_part_empty", () => {
	for (const part of ["cache", "records", "pds", "pins"]) {
		const expected = put(written(), [part], {});
		assert.deepEqual(readState(remove(written(), [part])), expected, part);
	}
	const unread = put(written(), ["rev"], null);
	assert.deepEqual(readState(remove(written(), ["rev"])), unread);
	assert.deepEqual(readState(unread), unread);
});

const RECORD = ["records", "at://a/b/c"];
const PIN = ["pins", PINS[1]?.[1] ?? ""];
const BREAKS: [what: string, path: string[], value?: unknown][] = [
	["a rev that is not text", ["rev"], 7],
	["a cache that is not a map", ["cache"], []],
	["a cache that is nothing", ["cache"], null],
	["records that are text", ["records"], "none"],
	["pds addresses that are nothing", ["pds"], null],
	["pins that are a number", ["pins"], 2],
	["a cached listing that is nothing", ["cache", POSTS_URL], null],
	["a cached listing without an etag", ["cache", POSTS_URL, "etag"]],
	["a cached listing without a listing", ["cache", POSTS_URL, "listing"]],
	[
		"a cached listing without records",
		["cache", POSTS_URL, "listing", "records"],
	],
	[
		"a cached listing with records that are not a list",
		["cache", POSTS_URL, "listing", "records"],
		{},
	],
	[
		"a cached record without a uri",
		["cache", POSTS_URL, "listing", "records", "4", "uri"],
	],
	[
		"a cached record without a value",
		["cache", POSTS_URL, "listing", "records", "4", "value"],
	],
	[
		"a cached record that is text",
		["cache", POSTS_URL, "listing", "records", "4"],
		"at://a/b/c",
	],
	["a record of an unknown kind", RECORD, { kind: "reaction" }],
	["a record of no kind", RECORD, { title: "a", pull: true }],
	["a record that is text", RECORD, "skipped"],
	["a ticket without a title", RECORD, { kind: "ticket", pull: true }],
	[
		"a ticket that does not say whether it is a pull",
		RECORD,
		{ kind: "ticket", title: "a" },
	],
	[
		"a ticket that says so in text",
		RECORD,
		{ kind: "ticket", title: "a", pull: "true" },
	],
	["a comment without text", RECORD, { kind: "comment", ticket: "1" }],
	["a comment without a ticket", RECORD, { kind: "comment", text: "a" }],
	["a patch with a number for a ticket", RECORD, { kind: "patch", ticket: 1 }],
	["a repo without an owner", RECORD, { kind: "repo", name: "a" }],
	["a repo without a name", RECORD, { kind: "repo", owner: "a" }],
	["a pds that is text", ["pds", ME], "https://pds.example"],
	["a pds without a url", ["pds", ME, "url"]],
	["a pds read at no time", ["pds", ME, "at"], "yesterday"],
	["a pds without the time it was read", ["pds", ME, "at"]],
	["a pin that is text", PIN, "3n2fph2mpzl22"],
	["a pin without a rev", [...PIN, "rev"]],
	["a pin that does not say whether it is current", [...PIN, "current"]],
	["a pin that says so with a number", [...PIN, "current"], 0],
	["a pin without tries", [...PIN, "tries"]],
	["a pin with half a try", [...PIN, "tries"], 0.5],
	["a pin with fewer than no tries", [...PIN, "tries"], -1],
	["a pin with tries in text", [...PIN, "tries"], "1"],
	["a commit that is text", [...PIN, "commit"], "a commit"],
	["a commit without a message", [...PIN, "commit", "message"]],
	["a commit without a link", [...PIN, "commit", "href"]],
	["a commit made at no time", [...PIN, "commit", "t"], "just now"],
	["a commit without a time", [...PIN, "commit", "t"]],
];

test("a_state_with_anything_unreadable_in_it_starts_empty", () => {
	for (const whole of ["state", 7, null, undefined, [], [written()]]) {
		assert.deepEqual(readState(whole), emptyState(), JSON.stringify(whole));
	}
	for (const [what, path, value] of BREAKS) {
		const broken =
			value === undefined
				? remove(written(), path)
				: put(written(), path, value);
		assert.deepEqual(readState(broken), emptyState(), what);
	}
});

test("a_field_is_read_only_from_an_object", () => {
	const value = { subject: { uri: "at://a/b/c", count: 2 }, list: ["a"] };
	assert.equal(field(value, "subject", "uri"), "at://a/b/c");
	assert.equal(field(value, "subject", "count"), 2);
	assert.equal(field(value, "subject"), value.subject);
	assert.equal(field(value, "subject", "missing"), undefined);
	assert.equal(field(value, "missing", "uri"), undefined);
	assert.equal(field(value, "list", "length"), undefined);
	assert.equal(field("text", "length"), undefined);
	assert.equal(field(null, "uri"), undefined);
	assert.equal(stringField(value, "subject", "uri"), "at://a/b/c");
	assert.equal(stringField(value, "subject", "count"), null);
	assert.equal(stringField(value, "subject"), null);
	assert.equal(stringField(value, "missing"), null);
});

test("a_time_is_read_as_rfc_3339_and_written_in_utc", () => {
	const at = Date.UTC(2026, 10, 18, 23, 54, 38, 101);
	for (const same of [
		"2026-11-18T23:54:38.101Z",
		"2026-11-18T23:54:38.101999Z",
		"2026-11-18T23:54:38.101999999Z",
		"2026-11-18T23:54:38.101+00:00",
		"2026-11-19T08:54:38.101+09:00",
		"2026-11-18T18:24:38.101-05:30",
	]) {
		assert.equal(instant(same), at, same);
	}
	assert.equal(
		instant("2026-11-16T04:38:32Z"),
		Date.UTC(2026, 10, 16, 4, 38, 32),
	);
	assert.equal(
		instant("2024-02-29T23:30:00-05:00"),
		Date.UTC(2024, 2, 1, 4, 30),
	);
	assert.equal(
		instant("2026-12-31T23:59:59Z"),
		Date.UTC(2026, 11, 31, 23, 59, 59),
	);
	assert.equal(instant("2026-11-18T23:54:38.1Z"), at - 1);
	assert.equal(timestamp(at), "2026-11-18T23:54:38.101Z");
	assert.equal(
		timestamp(Date.UTC(2026, 10, 16, 4, 38, 32)),
		"2026-11-16T04:38:32.000Z",
	);
});

test("what_only_javascript_would_take_for_a_time_is_not_one", () => {
	for (const notATime of [
		"",
		"the other day",
		"2026-11-18",
		"2026-11-18T23:54:38",
		"2026-11-18T23:54:38.Z",
		"2026-11-18T23:54:38.1019999999Z",
		"2026-11-18T23:54:38+9:00",
		"2026-11-18T23:54:38Z and then some",
		" 2026-11-18T23:54:38Z",
		"2026-13-18T23:54:38Z",
		"2026-11-18T24:00:00Z",
		"2026-11-18T23:60:00Z",
		"2026-02-29T00:00:00Z",
		"2026-02-30T12:00:00Z",
		"2026-04-31T23:30:00-05:00",
		"2026-11-32T00:00:00Z",
		"2026-11-00T00:00:00Z",
		"November 18, 2026 23:54:38 UTC",
		"Wed, 18 Nov 2026 23:54:38 GMT",
		"post 1",
		1795046078101,
		null,
		undefined,
		{},
	]) {
		assert.equal(instant(notATime), null, JSON.stringify(notATime));
	}
});

test("a_time_is_spelled_the_way_atproto_spells_it", () => {
	for (const looselySpelled of [
		"2026-11-18T23:54Z",
		"2026-11-18T23:54:38,5Z",
		"2026-11-18T23:54:38+0900",
		"2026-11-18T23:54:38+09",
		"2026-11-18 23:54:38Z",
		"2026-11-18t23:54:38Z",
		"2026-11-18T23:54:38z",
		"20261118T235438Z",
		"2026-11-18T23:54:38Z[UTC]",
		"+002026-11-18T23:54:38Z",
	]) {
		assert.equal(instant(looselySpelled), null, looselySpelled);
	}
});
