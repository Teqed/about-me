import assert from "node:assert/strict";
import { test } from "node:test";
import { BUDGET, HOME_PDS, ME, PINS } from "../src/config.ts";
import { Client, type Read } from "../src/fetch.ts";
import type { Known, Row, State } from "../src/model.ts";
import { json, nth, texts } from "./helpers.ts";
import {
	ATTESTATIONS,
	count,
	failing,
	POSTS,
	REPO,
	type Run,
	run,
	STARS,
	type World,
	withFetch,
	world,
	xrpcError,
} from "./world.ts";

const BSKY = [
	"getting caught blue-handed",
	"I am sooo thirsty what do I do",
	'saying "grr" and meaning it',
	"[realizing I dont care] I dont care",
	"we are adding gacha mechanics",
];
const TANGLED = [
	"pushed nixos-config: foundry autostart worlds",
	"comment tranquil-pds: yea the todo comment does seem to pretty clearly indicate they are going this direction too. I think youre right",
	"comment tranquil-pds: yes, we should do away with the grace period!",
	"comment tranquil-pds: range stuff: sure! we can pass through range. actually after the next tower-http release we can probably do if-range. if we also implement range for blobs that may be useful. for now we can just ignore range when we see if-range headers",
	"pushed ratlogin: reject compromised eMudhra intermediates",
];
const NIXOS = nth([...PINS], 0)[1];
const RATLOGIN = nth([...PINS], 1)[1];
const MANIFEST = `at://${REPO}/org.tangled.repo.manifest/self`;
const NEWEST_COMMENT = "org.tangled.feed.comment/3n2coo4x56fqu";

function verbs(rows: Row[]): string[] {
	return rows.map((row) => `${row.verb} ${row.text}`);
}

function kinds(state: State): { [path: string]: Known["kind"] } {
	const found: { [path: string]: Known["kind"] } = {};
	for (const [uri, known] of Object.entries(state.records)) {
		found[uri.split("/").slice(3).join("/")] = known.kind;
	}
	return found;
}

function putsOf(run: Run): string[] {
	return run.puts.map((put) => put.bucket);
}

function get(response: () => Response): Promise<Read> {
	return withFetch(response, () => new Client().get("https://pds.example/x"));
}

function chunk(index: number): string {
	return String(index % 10).repeat(1024);
}

function chunked(chunks: number, pulled: { count: number }): Response {
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			pulled.count++;
			if (pulled.count > chunks) {
				controller.close();
			} else {
				controller.enqueue(new TextEncoder().encode(chunk(pulled.count)));
			}
		},
	});
	return new Response(body);
}

function only(part: string, answer: () => Response): World["answer"] {
	return (url) => (url.includes(part) ? answer() : null);
}

function withNewPost(w: World): void {
	const posts = JSON.parse(w.bodies[POSTS] ?? "");
	posts.records.unshift({
		uri: `at://${ME}/${POSTS}/3n2pzzzzzzz2y`,
		value: { text: "a brand new post", createdAt: "2026-11-20T02:00:00.000Z" },
	});
	w.bodies[POSTS] = JSON.stringify(posts);
	w.etags[POSTS] = 'W/"p2"';
	w.rev = "3n2pj6aaaaa22";
}

function savedByRust(w: World): State {
	const state = json<State>("state.json");
	const now = new Date().toISOString();
	state.pds = {
		[ME]: { url: HOME_PDS, at: now },
		[REPO]: { url: "https://knot1.tangled.sh", at: now },
	};
	delete state.pins["did:plc:nocommityet"];
	w.pinRevs[NIXOS] = "3n2fph2mpzl22";
	w.pinRevs[RATLOGIN] = "3n2fph2mpzl22";
	w.state = JSON.stringify(state);
	return state;
}

test("only_explicit_xrpc_missing_errors_are_permanent", async () => {
	assert.deepEqual(await get(() => xrpcError("RepoNotFound", 400)), {
		kind: "repoNotFound",
	});
	assert.deepEqual(await get(() => xrpcError("RecordNotFound", 404)), {
		kind: "notFound",
		status: 404,
	});
	assert.deepEqual(await get(() => xrpcError("RecordNotFound", 400)), {
		kind: "notFound",
		status: 400,
	});
	assert.deepEqual(await get(() => failing(404, "not found")), {
		kind: "httpNotFound",
	});
	assert.deepEqual(await get(() => xrpcError("InvalidRequest", 404)), {
		kind: "httpNotFound",
	});
	assert.deepEqual(await get(() => failing(410, "gone")), {
		kind: "httpNotFound",
	});
	assert.deepEqual(await get(() => xrpcError("RecordNotFound", 410)), {
		kind: "httpNotFound",
	});
	assert.deepEqual(await get(() => failing(400, "other")), {
		kind: "unknown",
		reason: "HTTP 400",
	});
	assert.deepEqual(await get(() => xrpcError("RecordNotFound", 500)), {
		kind: "unknown",
		reason: "HTTP 500",
	});
	assert.deepEqual(await get(() => new Response("{}")), {
		kind: "fresh",
		body: "{}",
		etag: null,
	});
	assert.deepEqual(await get(() => new Response(null)), {
		kind: "fresh",
		body: "",
		etag: null,
	});
});

test("request_budget_is_a_hard_limit", async () => {
	await withFetch(
		() => new Response("{}"),
		async (sent) => {
			const client = new Client();
			for (let request = 0; request < BUDGET; request++) {
				assert.equal((await client.get("https://pds.example/x")).kind, "fresh");
			}
			const exhausted = { kind: "unknown", reason: "budget exhausted" };
			assert.deepEqual(await client.get("https://pds.example/x"), exhausted);
			assert.deepEqual(
				await client.getPrefix("https://pds.example/x", 16),
				exhausted,
			);
			assert.equal(client.requests, BUDGET);
			assert.equal(sent.length, BUDGET);
		},
	);
});

test("a_read_sends_its_etag_and_counts_what_has_not_changed", async () => {
	await withFetch(
		(request) =>
			request.headers.get("If-None-Match") === 'W/"e"'
				? new Response(null, { status: 304 })
				: new Response("fresh", { headers: { ETag: 'W/"e"' } }),
		async (sent) => {
			const client = new Client();
			const first = await client.get("https://pds.example/x");
			assert.deepEqual(first, { kind: "fresh", body: "fresh", etag: 'W/"e"' });
			const again = await client.get("https://pds.example/x", 'W/"e"');
			assert.deepEqual(again, { kind: "unchanged" });
			assert.equal(client.requests, 2);
			assert.equal(client.unchanged, 1);
			assert.equal(nth(sent, 0).headers.get("If-None-Match"), null);
			assert.match(nth(sent, 0).headers.get("User-Agent") ?? "", /quilling/);
		},
	);
});

test("a_request_that_cannot_be_made_is_an_error_and_costs_nothing", async () => {
	await withFetch(
		() => {
			throw new Error("connection refused");
		},
		async () => {
			const client = new Client();
			const refused = await client.get("https://pds.example/x");
			assert.equal(refused.kind, "unknown");
			assert.equal(client.requests, 1);
			const invalid = await client.get("undefined/xrpc/x");
			assert.equal(invalid.kind, "unknown");
			assert.equal(client.requests, 1);
		},
	);
});

test("a_prefix_is_cut_at_its_limit_and_the_rest_is_left_unread", async () => {
	const pulled = { count: 0 };
	const read = await withFetch(
		() => chunked(100, pulled),
		() => new Client().getPrefix("https://tangled.org/x/feed.atom", 16 * 1024),
	);
	assert.equal(read.kind, "fresh");
	assert.equal(read.kind === "fresh" && read.body.length, 16 * 1024);
	assert(pulled.count < 20, `${pulled.count} chunks pulled`);

	const short = await withFetch(
		() => chunked(3, { count: 0 }),
		() => new Client().getPrefix("https://tangled.org/x/feed.atom", 16 * 1024),
	);
	assert.equal(
		short.kind === "fresh" && short.body,
		chunk(1) + chunk(2) + chunk(3),
	);
});

test("a_whole_read_refuses_a_body_past_its_limit", async () => {
	const most = await get(() => chunked(256, { count: 0 }));
	assert.equal(most.kind === "fresh" && most.body.length, 256 * 1024);
	assert.deepEqual(await get(() => chunked(257, { count: 0 })), {
		kind: "unknown",
		reason: "response exceeds 262144 bytes",
	});
});

test("a_cold_start_reads_everything_once_and_saves_both_files", async () => {
	const w = world();
	const cold = await run(w);
	assert.equal(cold.requests.length, 17);
	assert.equal(count(cold, "plc.directory"), 2);
	assert.equal(count(cold, "listRecords"), 3);
	assert.equal(count(cold, "getRecord"), 7);
	assert.equal(count(cold, "getLatestCommit"), 3);
	assert.equal(count(cold, "feed.atom"), 2);
	assert.match(cold.line, /^feed: requests=17 304=0 /);
	assert(!cold.line.includes("feeds.json"), cold.line);
	assert.deepEqual(texts(cold.feeds.bsky.rows), BSKY);
	assert.deepEqual(verbs(cold.feeds.tangled.rows), TANGLED);
	assert.equal(cold.feeds.bsky.ok_at, cold.feeds.tangled.ok_at);
	assert(Date.now() - Date.parse(cold.feeds.bsky.ok_at ?? "") < 60_000);
	assert.deepEqual(cold.puts, [
		{
			bucket: "feeds",
			key: "feeds.json",
			options: {
				httpMetadata: {
					contentType: "application/json",
					cacheControl: "public, max-age=600",
				},
			},
		},
		{
			bucket: "state",
			key: "state.json",
			options: { httpMetadata: { contentType: "application/json" } },
		},
	]);
	assert.equal(cold.state.rev, w.rev);
	assert.equal(Object.keys(cold.state.cache).length, 3);
	assert.deepEqual(Object.keys(cold.state.pds).sort(), [REPO, ME]);
	assert.equal(cold.state.pins[NIXOS]?.current, true);
	assert.equal(Object.keys(cold.state.records).length, 7);
	assert((w.state ?? "").length < 12 * 1024);
});

test("an_unchanged_rev_asks_three_questions_and_leaves_the_state_alone", async () => {
	const w = world();
	const cold = await run(w);
	const saved = w.state;
	for (const steady of [await run(w), await run(w)]) {
		assert.equal(steady.requests.length, 3);
		assert.equal(count(steady, "getLatestCommit"), 3);
		assert.match(steady.line, /unchanged rev: listings reused/);
		assert.match(steady.line, /rows changed=false/);
		assert(!putsOf(steady).includes("state"));
		assert.equal(w.state, saved);
		assert.deepEqual(steady.feeds.bsky.rows, cold.feeds.bsky.rows);
		assert.deepEqual(steady.feeds.tangled.rows, cold.feeds.tangled.rows);
	}
});

test("a_new_rev_asks_for_the_listings_again_with_their_etags", async () => {
	const w = world();
	const cold = await run(w);
	w.rev = "3n2pj5aaaaa22";
	const unchanged = await run(w);
	assert.equal(unchanged.requests.length, 6);
	assert.match(unchanged.line, /requests=6 304=3 /);
	assert.equal(unchanged.state.rev, "3n2pj5aaaaa22");
	assert.deepEqual(unchanged.state.cache, cold.state.cache);
	assert.deepEqual(unchanged.feeds.bsky.rows, cold.feeds.bsky.rows);
	assert.equal((await run(w)).requests.length, 3);

	withNewPost(w);
	const posted = await run(w);
	assert.match(posted.line, /requests=6 304=2 .*rows changed=true/);
	assert.deepEqual(texts(posted.feeds.bsky.rows), [
		"a brand new post",
		...BSKY.slice(0, 4),
	]);
	assert.deepEqual(posted.feeds.tangled.rows, cold.feeds.tangled.rows);
});

test("the_first_run_after_the_rust_job_reads_no_listing_and_no_record", async () => {
	const w = world();
	const saved = savedByRust(w);
	const first = await run(w);
	assert.equal(first.requests.length, 4);
	assert.equal(count(first, "getLatestCommit"), 3);
	assert.equal(count(first, "ratlogin/feed.atom"), 1);
	assert.match(first.line, /unchanged rev: listings reused/);
	assert.deepEqual(texts(first.feeds.bsky.rows), BSKY);
	assert.deepEqual(verbs(first.feeds.tangled.rows), TANGLED);
	assert.deepEqual(first.state.cache, saved.cache);
	assert.deepEqual(first.state.pins[NIXOS], saved.pins[NIXOS]);
	assert.equal(first.state.pins[RATLOGIN]?.tries, 2);
	assert.equal(Object.keys(first.state.records).length, 7);
});

test("a_listing_that_fails_keeps_its_panel_and_the_rev_unread", async () => {
	const w = world();
	const cold = await run(w);
	const saved = w.state;
	w.rev = "3n2pj7aaaaa22";
	w.answer = (url) => (url.includes(STARS) ? failing(503) : null);
	const failed = await run(w);
	assert.equal(failed.requests.length, 4);
	assert.equal(w.state, saved);
	assert.deepEqual(failed.feeds.tangled, cold.feeds.tangled);
	assert.notEqual(failed.feeds.bsky.ok_at, null);
	assert.deepEqual(putsOf(failed), ["feeds"]);

	w.answer = (url) => (url.includes(POSTS) ? failing(503) : null);
	const unposted = await run(w);
	assert.deepEqual(unposted.feeds.bsky, failed.feeds.bsky);
	assert.match(unposted.line, new RegExp(`${POSTS}: HTTP 503`));
	assert.equal(unposted.state.rev, cold.state.rev);

	w.answer = null;
	const healed = await run(w);
	assert.equal(healed.state.rev, "3n2pj7aaaaa22");
	assert.match(healed.line, /requests=6 304=3 /);
});

test("a_listing_of_the_wrong_shape_is_a_listing_that_failed", async () => {
	for (const body of [
		"not json",
		"null",
		'{"records":"none"}',
		'{"records":[null]}',
		'{"records":[{"uri":5,"value":{}}]}',
		'{"records":[{"uri":"at://a/b/c"}]}',
		'{"records":[{"uri":"at://a/b/c","value":{}},{"uri":5,"value":{}}]}',
	]) {
		const w = world();
		w.answer = (url) =>
			url.includes(ATTESTATIONS) ? new Response(body) : null;
		const odd = await run(w);
		assert.equal(odd.requests.length, 5, body);
		assert.deepEqual(odd.feeds.tangled, { ok_at: null, rows: [] }, body);
		assert.deepEqual(texts(odd.feeds.bsky.rows), BSKY, body);
		assert.equal(odd.state.rev, null, body);
		assert.deepEqual(odd.state.records, {}, body);
	}
});

test("a_listing_with_nothing_in_it_is_still_a_listing", async () => {
	const w = world();
	w.bodies[ATTESTATIONS] = '{"records":[]}';
	w.bodies[STARS] = '{"records":[],"cursor":null}';
	const quiet = await run(w);
	assert.equal(quiet.state.rev, w.rev);
	assert.notEqual(quiet.feeds.tangled.ok_at, null);
	assert.deepEqual(verbs(quiet.feeds.tangled.rows), [
		nth(TANGLED, 0),
		nth(TANGLED, 4),
	]);
});

test("a_rev_that_is_not_text_is_no_rev", async () => {
	for (const body of ['{"rev":7}', '"3n2pj4njjbu22"', "null", "[]", "{}"]) {
		const w = world();
		const cold = await run(w);
		w.answer = only(`getLatestCommit?did=${ME}`, () => new Response(body));
		const unsure = await run(w);
		assert.match(unsure.line, /requests=6 304=3 /, body);
		assert.equal(unsure.state.rev, cold.state.rev, body);
		assert.deepEqual(unsure.feeds.tangled.rows, cold.feeds.tangled.rows, body);
	}
});

test("a_listing_without_an_etag_is_read_again_every_run", async () => {
	const w = world();
	w.etags[STARS] = null;
	const cold = await run(w);
	assert.match(cold.line, new RegExp(`${STARS}: no ETag`));
	assert.equal(Object.keys(cold.state.cache).length, 2);
	assert.deepEqual(verbs(cold.feeds.tangled.rows), TANGLED);
	const next = await run(w);
	assert.match(next.line, /requests=6 304=2 /);
	assert.deepEqual(next.feeds.tangled.rows, cold.feeds.tangled.rows);
});

test("only_a_record_the_server_says_is_missing_is_skipped_for_good", async () => {
	const w = world();
	w.answer = (url) => {
		if (!url.includes("getRecord")) {
			return null;
		}
		if (url.includes("review.patch")) {
			return failing(502);
		}
		if (url.includes("3n2chprpezdqu")) {
			return failing(404, "not found");
		}
		return url.includes("3n2cbitrta2qu") ? xrpcError("RecordNotFound") : null;
	};
	const flaky = await run(w);
	assert.deepEqual(kinds(flaky.state), {
		"org.tangled.feed.comment/3n27n2ynaeequ": "comment",
		"org.tangled.feed.comment/3n2cbitrta2qu": "skipped",
		"org.tangled.feed.comment/3n2coo4x56fqu": "comment",
		"org.tangled.repo.manifest/self": "repo",
	});
	assert.equal(count(flaky, "review.patch"), 2);
	assert.equal(count(flaky, "3n2chprpezdqu"), 1);
	assert.match(flaky.line, /HTTP 502/);
	assert.match(flaky.line, /tangled: 3 wants remain/);

	w.answer = null;
	const healthy = await run(w);
	const known = kinds(healthy.state);
	assert.equal(known["org.tangled.feed.comment/3n2chprpezdqu"], "comment");
	assert.equal(known["org.tangled.feed.comment/3n2cbitrta2qu"], "skipped");
	assert.equal(known["org.tangled.track.ticket/646"], "ticket");
	assert.equal(count(healthy, "3n2cbitrta2qu"), 0);
	assert(
		verbs(healthy.feeds.tangled.rows).some((row) => row.startsWith("revised ")),
	);
});

test("a_record_that_cannot_be_read_as_one_is_skipped", async () => {
	for (const body of ["not json", "null", "7", '{"uri":"at://a/b/c"}']) {
		const w = world();
		w.answer = only("rkey=3n2coo4x56fqu", () => new Response(body));
		const odd = await run(w);
		assert.equal(kinds(odd.state)[NEWEST_COMMENT], "skipped", body);
		assert.equal(odd.feeds.tangled.rows.length, 5, body);
		assert.equal(odd.state.rev, w.rev, body);
	}
});

test("a_repository_is_given_up_only_when_its_did_cannot_be_found", async () => {
	for (const [answer, givenUp] of [
		[() => failing(404, "DID not registered"), true],
		[() => failing(410, "gone"), true],
		[() => xrpcError("RepoNotFound", 400), true],
		[() => xrpcError("RecordNotFound", 404), true],
		[() => xrpcError("RecordNotFound", 400), false],
		[() => failing(503), false],
		[() => Response.json({ service: [] }), false],
		[() => new Response("not json"), false],
	] as const) {
		const w = world();
		w.answer = only(`plc.directory/${REPO}`, answer);
		const asked = await run(w);
		const what = await answer().text();
		assert.equal(count(asked, `plc.directory/${REPO}`), 1, what);
		assert.equal(count(asked, `getRecord?repo=${REPO}`), 0, what);
		assert.equal(
			asked.state.records[MANIFEST]?.kind === "skipped",
			givenUp,
			what,
		);
	}
});

test("a_want_that_names_no_record_is_skipped_without_a_request", async () => {
	const w = world();
	const star = {
		uri: `at://${ME}/${STARS}/3n2pzzzzzzz2a`,
		value: {
			subject: { identity: "odd/name" },
			createdAt: "2026-11-20T00:00:00Z",
		},
	};
	w.bodies[STARS] = JSON.stringify({ records: [star] });
	w.pds["odd/name"] = "https://knot1.tangled.sh";
	const odd = await run(w);
	assert.equal(count(odd, "plc.directory/odd/name"), 1);
	assert.equal(count(odd, "repo=odd"), 0);
	assert.deepEqual(
		odd.state.records["at://odd/name/org.tangled.repo.manifest/self"],
		{ kind: "skipped" },
	);
	assert.equal(odd.requests.length, 18);
});

test("a_repository_nobody_can_place_is_skipped_with_everything_in_it", async () => {
	const w = world();
	w.pds = { [ME]: HOME_PDS };
	const gone = await run(w);
	assert.equal(count(gone, "getRecord"), 0);
	assert.deepEqual(gone.state.records[MANIFEST], { kind: "skipped" });
	assert.deepEqual(Object.keys(gone.state.pds), [ME]);
	assert.deepEqual(verbs(gone.feeds.tangled.rows), [
		nth(TANGLED, 0),
		nth(TANGLED, 4),
	]);
	assert.equal((await run(w)).requests.length, 3);
});

test("a_repository_the_knot_no_longer_has_is_skipped_too", async () => {
	const w = world();
	w.answer = (url) =>
		url.includes("getRecord") ? xrpcError("RepoNotFound") : null;
	const gone = await run(w);
	assert.equal(count(gone, `getRecord?repo=${REPO}`), 1);
	assert.deepEqual(kinds(gone.state), {
		"org.tangled.repo.manifest/self": "skipped",
	});
});

test("wants_stop_where_the_pins_requests_begin", async () => {
	const w = world();
	const stars = [];
	for (let star = 10; star < 35; star++) {
		stars.push({
			uri: `at://${ME}/${STARS}/${star}`,
			value: {
				subject: { identity: `did:plc:repo${star}` },
				createdAt: `2026-11-19T00:00:${star}Z`,
			},
		});
	}
	w.bodies[STARS] = JSON.stringify({ records: stars });
	w.records = {};
	w.pds = new Proxy(
		{},
		{ get: (_, did) => (did === ME ? HOME_PDS : "https://knot1.tangled.sh") },
	);
	const starved = await run(w);
	assert.equal(starved.requests.length, BUDGET);
	assert.match(starved.line, /tangled: budget reserved for pins/);
	assert.deepEqual(
		starved.requests.slice(-4).map((url) => url.includes("feed.atom")),
		[false, true, false, true],
	);
	assert.deepEqual(verbs(starved.feeds.tangled.rows), [
		nth(TANGLED, 0),
		nth(TANGLED, 4),
	]);
	const next = await run(w);
	assert(next.requests.length > 3 && next.requests.length <= BUDGET);
});

test("a_pin_whose_feed_is_away_shows_by_name_and_asks_again", async () => {
	const w = world();
	w.answer = (url) => (url.includes("feed.atom") ? failing(503) : null);
	const away = await run(w);
	assert.deepEqual(away.state.pins[NIXOS], {
		rev: w.pinRevs[NIXOS],
		commit: null,
		current: false,
		tries: 0,
	});
	assert.deepEqual(
		verbs(away.feeds.tangled.rows).filter((row) => row.startsWith("pushed ")),
		["pushed nixos-config", "pushed ratlogin"],
	);
	w.answer = null;
	const back = await run(w);
	assert.equal(count(back, "feed.atom"), 2);
	assert.deepEqual(verbs(back.feeds.tangled.rows), TANGLED);

	for (const answer of [() => failing(503), () => new Response('{"rev":7}')]) {
		w.answer = only(`getLatestCommit?did=${NIXOS}`, answer);
		const unseen = await run(w);
		assert.equal(count(unseen, `getLatestCommit?did=${RATLOGIN}`), 1);
		assert.deepEqual(unseen.state.pins, back.state.pins);
		assert.deepEqual(unseen.feeds.tangled.rows, back.feeds.tangled.rows);
	}
});

test("a_pins_feed_is_read_as_far_as_sixteen_kibibytes_and_no_further", async () => {
	const link = "https://tangled.org/quilling.dev/nixos-config/commit/abc";
	const entry = `<entry><link href="${link}"/><updated>2026-11-19T00:00:00Z</updated><content>fits</content>`;
	const fits = " ".repeat(16 * 1024 - entry.length) + entry;

	const w = world();
	w.atoms["nixos-config"] = `${fits}</entry>`;
	const whole = await run(w);
	assert.equal(whole.state.pins[NIXOS]?.commit?.href, link);
	assert(verbs(whole.feeds.tangled.rows).includes("pushed nixos-config: fits"));

	const v = world();
	v.atoms["nixos-config"] = ` ${fits}</entry>`;
	const cut = await run(v);
	assert.equal(cut.state.pins[NIXOS]?.commit, null);
	assert.equal(cut.state.pins[NIXOS]?.tries, 1);
	assert(verbs(cut.feeds.tangled.rows).includes("pushed nixos-config"));
});

test("without_a_plc_answer_the_home_pds_is_the_one_in_the_config", async () => {
	const w = world();
	w.answer = (url) =>
		url.includes(`plc.directory/${ME}`) ? failing(503) : null;
	const lost = await run(w);
	assert.match(lost.line, /home PDS: HTTP 503; using fallback/);
	assert.equal(count(lost, `${HOME_PDS}/xrpc/`), 4);
	assert.deepEqual(texts(lost.feeds.bsky.rows), BSKY);
	assert.equal(lost.state.pds[ME], undefined);
});

test("files_that_cannot_be_understood_are_started_again", async () => {
	const w = world();
	w.state = "{not json";
	w.feeds = '{"bsky":{"rows":"x"}}';
	const fresh = await run(w);
	assert.equal(fresh.requests.length, 17);
	assert.match(fresh.line, /feeds\.json: .*starting fresh/);
	assert.deepEqual(texts(fresh.feeds.bsky.rows), BSKY);
	assert.deepEqual(verbs(fresh.feeds.tangled.rows), TANGLED);
	assert.equal(fresh.state.rev, w.rev);
});

test("a_published_file_missing_a_panel_never_leaves_one_out", async () => {
	for (const published of [
		"null",
		"7",
		"{}",
		'{"bsky":{"ok_at":null,"rows":[]}}',
		'{"tangled":{"ok_at":null,"rows":[]}}',
		'{"bsky":{"ok_at":null,"rows":[]},"tangled":{"ok_at":null,"rows":"x"}}',
		'{"bsky":{"ok_at":null,"rows":"x"},"tangled":{"ok_at":null,"rows":[]}}',
	]) {
		const w = world();
		w.feeds = published;
		w.answer = (url) => (url.includes("listRecords") ? failing(503) : null);
		const kept = await run(w);
		assert.deepEqual(
			kept.feeds,
			{ bsky: { ok_at: null, rows: [] }, tangled: { ok_at: null, rows: [] } },
			published,
		);
	}
});

test("a_state_bucket_that_cannot_be_read_stops_the_run", async () => {
	const w = world();
	await run(w);
	const [state, feeds] = [w.state, w.feeds];
	w.stateUnreadable = true;
	const stopped = await run(w);
	assert.equal(stopped.requests.length, 0);
	assert.deepEqual(stopped.puts, []);
	assert.match(stopped.line, /the state bucket is away/);
	assert.deepEqual([w.state, w.feeds], [state, feeds]);
});
