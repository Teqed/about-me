import assert from "node:assert/strict";
import { test } from "node:test";
import { ME, PDS_TTL_MS } from "../src/config.ts";
import { ATTESTATIONS, STARS, slim } from "../src/listings.ts";
import {
	emptyState,
	type Listing,
	type State,
	type Want,
} from "../src/model.ts";
import * as pds from "../src/pds.ts";
import {
	activity,
	forget,
	items,
	remember,
	skip,
	skipRepo,
	wanted,
} from "../src/tangled.ts";
import {
	type Fields,
	json,
	listing,
	nth,
	response,
	row,
	texts,
	time,
} from "./helpers.ts";

const REPO = "did:plc:jj6ajj6duxnlthwtnob4qyuv";
const TRANQUIL =
	"https://tangled.org/did:web:tranquil.tranquil.farm/tranquil-pds";
const NOTHING: Listing = { records: [] };

function uri(collection: string, rkey: string): string {
	return `at://${REPO}/${collection}/${rkey}`;
}

function comment(rkey: string): string {
	return uri("org.tangled.feed.comment", rkey);
}

function ticket(number: string): string {
	return uri("org.tangled.track.ticket", number);
}

function manifest(): string {
	return uri("org.tangled.repo.manifest", "self");
}

function patch(): string {
	const cid = "bafyreibqxpl242n3s5czxwmbha2v2qz44jntibx4xgopirbf7dzlycblva";
	return uri("org.tangled.review.patch", cid);
}

function olderPatch(): string {
	const cid = "bafyreihoakzbgxezstdm2vjumx7j2bh2nty7p7elxgol3o2dbgp5ugylsy";
	return uri("org.tangled.review.patch", cid);
}

function listings(): [Listing, Listing] {
	return [listing("attestations.json"), listing("stars.json")];
}

function now(): Date {
	return new Date("2026-11-19T03:40:00Z");
}

function record(name: string): { uri: string; value: Fields } {
	return json(`records/${name}.json`);
}

function fetch(state: State, name: string): void {
	const response = record(name);
	remember(state, response.uri, response.value);
}

function located(): State {
	const state = emptyState();
	pds.remember(state, REPO, json("plc.json"), now());
	return state;
}

function caughtUp(): State {
	const state = located();
	for (const name of [
		"manifest",
		"comment-3n2coo4x56fqu",
		"comment-3n2chprpezdqu",
		"comment-3n2cbitrta2qu",
		"comment-3n27n2ynaeequ",
		"patch",
		"ticket-646",
	]) {
		fetch(state, name);
	}
	return state;
}

function records(uris: string[]): Want[] {
	return uris.map((uri) => ({ kind: "record", uri }));
}

function wantsRecord(wants: Want[], uri: string): boolean {
	return wants.some((want) => want.kind === "record" && want.uri === uri);
}

function wantsPds(wants: Want[], did: string): boolean {
	return wants.some((want) => want.kind === "pds" && want.did === did);
}

function attested(subject: string, createdAt: string): Listing {
	const uri = `at://${ME}/org.tangled.graph.attestation/3n2jgasmhn27w`;
	return {
		records: [{ uri, value: { subject: { uri: subject }, createdAt } }],
	};
}

test("a_cold_start_asks_only_for_what_the_newest_rows_need", () => {
	const [attestations, stars] = listings();
	const state = emptyState();
	const expected: Want[] = [
		{ kind: "pds", did: REPO },
		...records([
			comment("3n27n2ynaeequ"),
			comment("3n2cbitrta2qu"),
			comment("3n2chprpezdqu"),
			comment("3n2coo4x56fqu"),
			manifest(),
			patch(),
		]),
	];
	assert.deepEqual(wanted(items(attestations, stars), state, now()), expected);
	assert.deepEqual(activity(items(attestations, stars), state), []);
});

test("a_patch_asks_for_its_pull_once_it_has_been_read", () => {
	const [attestations, stars] = listings();
	const state = located();
	fetch(state, "patch");
	const wants = wanted(items(attestations, stars), state, now());
	assert(wantsRecord(wants, ticket("646")));
	assert(!wantsRecord(wants, patch()));
	assert(!wantsPds(wants, REPO));

	assert.deepEqual(wanted(items(attestations, stars), caughtUp(), now()), []);
});

test("every_kind_of_row_reads_as_the_contract_says", () => {
	const [attestations, stars] = listings();
	const rows = activity(items(attestations, stars), caughtUp());
	const expected = [
		row(
			"comment",
			"tranquil-pds: yea the todo comment does seem to pretty clearly indicate they are going this direction too. " +
				"I think youre right",
			"2026-11-14T23:46:42.540Z",
			`${TRANQUIL}/issues/689#comment-3n2coo4x56fqu`,
		),
		row(
			"comment",
			"tranquil-pds: yes, we should do away with the grace period!",
			"2026-11-14T21:42:22.635Z",
			`${TRANQUIL}/issues/689#comment-3n2chprpezdqu`,
		),
		row(
			"comment",
			"tranquil-pds: range stuff: sure! we can pass through range. actually after the next tower-http release we can " +
				"probably do if-range. if we also implement range for blobs that may be useful. for now we can " +
				"just ignore range when we see if-range headers",
			"2026-11-14T19:51:07.526Z",
			`${TRANQUIL}/issues/646#comment-3n2cbitrta2qu`,
		),
		row(
			"revised",
			"tranquil-pds: fix: cache headers and add etags",
			"2026-11-14T19:50:11.107Z",
			`${TRANQUIL}/pulls/646`,
		),
		row(
			"comment",
			"tranquil-pds: new round!",
			"2026-11-13T18:40:08.586Z",
			`${TRANQUIL}/issues/646#comment-3n27n2ynaeequ`,
		),
		row("starred", "tranquil-pds", "2026-11-04T20:54:27.243Z", TRANQUIL),
		row(
			"pull",
			"tranquil-pds: fix: cache headers and add etags",
			"2026-10-07T20:32:25Z",
			`${TRANQUIL}/pulls/646`,
		),
	];
	assert.deepEqual(rows, expected);
});

test("a_ticket_without_a_target_branch_is_an_issue", () => {
	const attestations = attested(ticket("690"), "2026-11-17T16:04:44.604Z");
	const state = emptyState();
	fetch(state, "manifest");
	fetch(state, "ticket-690");
	assert.deepEqual(activity(items(attestations, NOTHING), state), [
		row(
			"ticket",
			"tranquil-pds: Proposal for type-safe scopes",
			"2026-11-17T16:04:44.604Z",
			`${TRANQUIL}/issues/690`,
		),
	]);
});

test("my_own_repositories_link_by_handle", () => {
	const [attestations, stars] = listings();
	const state = caughtUp();
	const mine = { declaration: { owner: ME, name: "ratlogin" } };
	remember(state, manifest(), mine);
	const rows = activity(items(attestations, stars), state);
	assert.equal(
		nth(rows, 3).href,
		"https://tangled.org/quilling.dev/ratlogin/pulls/646",
	);
});

test("items_not_yet_read_are_left_out_and_wanted", () => {
	const [attestations, stars] = listings();
	const state = located();
	fetch(state, "manifest");
	fetch(state, "comment-3n2chprpezdqu");

	const rows = activity(items(attestations, stars), state);
	assert.deepEqual(texts(rows), [
		"tranquil-pds: yes, we should do away with the grace period!",
		"tranquil-pds",
	]);
	assert.deepEqual(
		wanted(items(attestations, stars), state, now()),
		records([
			comment("3n27n2ynaeequ"),
			comment("3n2cbitrta2qu"),
			comment("3n2coo4x56fqu"),
			patch(),
		]),
	);
});

test("a_record_nothing_can_be_made_of_is_skipped_for_good", () => {
	const [attestations, stars] = listings();
	const state = caughtUp();
	const newest = comment("3n2coo4x56fqu");
	remember(state, newest, { body: 7, subject: {} });
	assert.deepEqual(state.records[newest], { kind: "skipped" });

	const rows = activity(items(attestations, stars), state);
	assert.equal(rows.length, 6);
	assert.equal(
		nth(rows, 0).text,
		"tranquil-pds: yes, we should do away with the grace period!",
	);

	assert.deepEqual(
		wanted(items(attestations, stars), state, now()),
		records([olderPatch()]),
	);
});

test("a_comment_on_something_other_than_a_ticket_is_skipped", () => {
	const response = record("comment-3n2coo4x56fqu");
	(response.value.subject as Fields).uri = patch();
	const state = emptyState();
	remember(state, comment("3n2coo4x56fqu"), response.value);
	assert.deepEqual(state.records[comment("3n2coo4x56fqu")], {
		kind: "skipped",
	});
});

test("a_patch_that_names_no_pull_is_skipped", () => {
	const [attestations, stars] = listings();
	for (const notANumber of ["", "646/latest", 646, null]) {
		const state = caughtUp();
		const value = record("patch").value;
		value.ticket = notANumber;
		remember(state, patch(), value);
		assert.deepEqual(
			state.records[patch()],
			{ kind: "skipped" },
			JSON.stringify(notANumber),
		);
		assert.deepEqual(
			wanted(items(attestations, stars), state, now()),
			records([olderPatch()]),
		);
	}
});

test("a_record_the_server_does_not_have_is_skipped_too", () => {
	const [attestations, stars] = listings();
	const state = caughtUp();
	skip(state, patch());
	const wants = wanted(items(attestations, stars), state, now());
	assert(!wantsRecord(wants, patch()));
	const rows = activity(items(attestations, stars), state);
	assert(rows.every((row) => row.verb !== "revised"));
});

test("a_repository_that_is_gone_takes_its_items_with_it", () => {
	const [attestations, stars] = listings();
	const state = caughtUp();
	assert.equal(activity(items(attestations, stars), state).length, 7);
	skipRepo(state, REPO);
	assert.deepEqual(state.records[manifest()], { kind: "skipped" });
	assert.deepEqual(activity(items(attestations, stars), state), []);

	const wants = wanted(items(attestations, stars), state, now());
	assert.equal(wants.length, 10, JSON.stringify(wants));
	for (const want of wants) {
		if (want.kind === "pds") {
			assert.notEqual(want.did, REPO);
		} else {
			assert(!want.uri.includes(REPO));
			assert(want.uri.endsWith("/org.tangled.repo.manifest/self"));
		}
	}
});

test("reactions_are_never_rows", () => {
	const [attestations, stars] = listings();
	const state = caughtUp();
	fetch(state, "reaction");
	assert.deepEqual(
		state.records[uri("org.tangled.feed.reaction", "3n2jgar76we6n")],
		{ kind: "skipped" },
	);
	assert.equal(activity(items(attestations, stars), state).length, 7);
});

test("a_malformed_attestation_is_ignored", () => {
	const attestations = response("attestations.json");
	nth(attestations.records, 1).value.subject = "somewhere";
	nth(attestations.records, 3).value.createdAt = 20_261_114;
	const rows = activity(items(attestations, listing("stars.json")), caughtUp());
	assert.equal(rows.length, 5);
	assert.equal(nth(rows, 0).verb, "comment");
	assert.equal(nth(rows, 0).t, time("2026-11-14T19:51:07.526Z"));
});

test("a_pds_address_is_asked_for_again_after_a_day", () => {
	const [attestations, stars] = listings();
	const readAt = now();
	const state = located();
	assert.equal(state.pds[REPO]?.url, "https://knot1.tangled.sh");

	assert.equal(PDS_TTL_MS, 24 * 60 * 60 * 1000);
	const almost = new Date(readAt.getTime() + PDS_TTL_MS - 1000);
	assert.equal(pds.known(state, REPO, almost), "https://knot1.tangled.sh");
	assert(!wantsPds(wanted(items(attestations, stars), state, almost), REPO));

	const stale = new Date(readAt.getTime() + PDS_TTL_MS);
	assert.equal(pds.known(state, REPO, stale), null);
	assert.deepEqual(nth(wanted(items(attestations, stars), state, stale), 0), {
		kind: "pds",
		did: REPO,
	});

	assert.deepEqual(wanted(items(attestations, stars), caughtUp(), stale), []);
});

test("a_document_without_a_pds_is_not_remembered", () => {
	const state = emptyState();
	const document = json<{ service: Fields[] }>("plc.json");
	nth(document.service, 0).id = "#atproto_labeler";
	pds.remember(state, REPO, document, now());
	pds.remember(state, REPO, { message: "DID not registered" }, now());
	assert.deepEqual(state.pds, {});
});

test("forgetting_keeps_what_the_listings_still_lead_to", () => {
	const [attestations, stars] = listings();
	const state = caughtUp();
	pds.remember(state, ME, json("plc.json"), now());
	fetch(state, "reaction");
	const remembered = caughtUp();

	forget(state, items(attestations, stars));
	assert.deepEqual(state.records, remembered.records);
	assert.equal(Object.keys(state.pds).length, 2);

	forget(state, items(NOTHING, NOTHING));
	assert.deepEqual(state.records, {});
	assert.deepEqual(Object.keys(state.pds), [ME]);
});

test("slim_listings_decide_the_same_as_whole_ones", () => {
	const [attestations, stars] = listings();
	const slimAttestations = slim(ATTESTATIONS, attestations);
	const slimStars = slim(STARS, stars);
	for (const state of [emptyState, caughtUp]) {
		assert.deepEqual(
			wanted(items(slimAttestations, slimStars), state(), now()),
			wanted(items(attestations, stars), state(), now()),
		);
		assert.deepEqual(
			activity(items(slimAttestations, slimStars), state()),
			activity(items(attestations, stars), state()),
		);
		const [whole, slimmed] = [state(), state()];
		forget(whole, items(attestations, stars));
		forget(slimmed, items(slimAttestations, slimStars));
		assert.deepEqual(slimmed, whole);
	}
});

test("one_reading_of_the_listings_serves_every_round_of_a_run", () => {
	const names = [
		"manifest",
		"comment-3n2coo4x56fqu",
		"comment-3n2chprpezdqu",
		"comment-3n2cbitrta2qu",
		"comment-3n27n2ynaeequ",
		"patch",
		"ticket-646",
	];
	const [attestations, stars] = listings();
	const work = items(attestations, stars);
	const state = emptyState();
	const rounds = [];
	for (let round = 0; round < 4; round++) {
		const wants = wanted(work, state, now());
		rounds.push(wants.length);
		for (const want of wants) {
			if (want.kind === "pds") {
				pds.remember(state, want.did, json("plc.json"), now());
			} else {
				const name = names.find((name) => record(name).uri === want.uri);
				assert(name !== undefined, want.uri);
				fetch(state, name);
			}
		}
	}
	assert.deepEqual(rounds, [7, 1, 0, 0]);
	assert.equal(activity(work, state).length, 7);
	forget(state, work);
	assert.deepEqual(state, caughtUp());
	assert.deepEqual(activity(work, state), activity(work, caughtUp()));
});

test("a_pds_address_is_remembered_with_the_time_it_was_read", () => {
	const state = located();
	assert.deepEqual(state.pds, {
		[REPO]: {
			url: "https://knot1.tangled.sh",
			at: time("2026-11-19T03:40:00Z"),
		},
	});
	const earlier = new Date(now().getTime() - 1000);
	assert.equal(pds.known(state, REPO, earlier), "https://knot1.tangled.sh");
	assert.equal(pds.known(state, ME, now()), null);
});

test("the_pds_is_the_first_service_named_so_and_only_if_it_has_an_address", () => {
	const service = (id: string, serviceEndpoint: unknown) => ({
		id,
		serviceEndpoint,
	});
	const state = emptyState();
	pds.remember(
		state,
		REPO,
		{
			service: [
				service("#tangled_knot", "https://knot.example"),
				service("#atproto_pds", "https://first.example"),
				service("#atproto_pds", "https://second.example"),
			],
		},
		now(),
	);
	assert.equal(state.pds[REPO]?.url, "https://first.example");

	const unaddressed = emptyState();
	for (const document of [
		{
			service: [
				service("#atproto_pds", 7),
				service("#atproto_pds", "https://second.example"),
			],
		},
		{ service: { id: "#atproto_pds", serviceEndpoint: "https://pds.example" } },
		{ service: [null, "#atproto_pds"] },
		"did:plc:jj6ajj6duxnlthwtnob4qyuv",
		null,
	]) {
		pds.remember(unaddressed, REPO, document, now());
		assert.deepEqual(unaddressed.pds, {}, JSON.stringify(document));
	}
});

test("a_repository_named_like_part_of_an_object_is_only_a_name", () => {
	for (const name of [
		"constructor",
		"toString",
		"__proto__",
		"hasOwnProperty",
	]) {
		const state = caughtUp();
		assert.equal(pds.known(state, name, now()), null, name);
		const stars = {
			records: [
				{
					uri: "at://a/b/c",
					value: {
						subject: { identity: name },
						createdAt: "2026-11-19T00:00:00Z",
					},
				},
			],
		};
		assert.deepEqual(wanted(items(NOTHING, stars), state, now()), [
			{ kind: "pds", did: name },
			{ kind: "record", uri: `at://${name}/org.tangled.repo.manifest/self` },
		]);
		assert.deepEqual(activity(items(NOTHING, stars), state), [], name);
		forget(state, items(NOTHING, stars));
		assert.deepEqual(state.pds, {}, name);
		assert.deepEqual(state.records, {}, name);
	}
});

test("only_the_newest_five_usable_items_are_asked_about", () => {
	const [attestations, stars] = listings();
	const state = caughtUp();
	skip(state, comment("3n2coo4x56fqu"));
	skip(state, comment("3n2chprpezdqu"));
	assert.deepEqual(
		wanted(items(attestations, stars), state, now()),
		records([comment("3mzjajq5gyejb"), olderPatch()]),
	);
});

test("wants_are_pds_addresses_first_then_records_each_once_and_in_order", () => {
	const star = (identity: string, createdAt: string) => ({
		uri: "at://a/b/c",
		value: { subject: { identity }, createdAt },
	});
	const stars = {
		records: [
			star("did:plc:b", "2026-11-19T00:00:00Z"),
			star("did:plc:a", "2026-11-18T00:00:00Z"),
			star("did:plc:b", "2026-11-17T00:00:00Z"),
			star("did:plc:c", "2026-11-16T00:00:00Z"),
		],
	};
	const state = emptyState();
	pds.remember(state, "did:plc:c", json("plc.json"), now());
	assert.deepEqual(wanted(items(NOTHING, stars), state, now()), [
		{ kind: "pds", did: "did:plc:a" },
		{ kind: "pds", did: "did:plc:b" },
		{ kind: "record", uri: "at://did:plc:a/org.tangled.repo.manifest/self" },
		{ kind: "record", uri: "at://did:plc:b/org.tangled.repo.manifest/self" },
		{ kind: "record", uri: "at://did:plc:c/org.tangled.repo.manifest/self" },
	]);
});

test("a_revision_shows_only_beside_a_ticket_it_can_name", () => {
	const attestations = attested(patch(), "2026-11-14T19:50:11.107Z");
	const state = caughtUp();
	assert.equal(
		nth(activity(items(attestations, NOTHING), state), 0).verb,
		"revised",
	);

	fetch(state, "ticket-690");
	state.records[ticket("646")] = state.records[ticket("690")] ?? {
		kind: "skipped",
	};
	assert.deepEqual(texts(activity(items(attestations, NOTHING), state)), [
		"tranquil-pds: Proposal for type-safe scopes",
	]);
	assert.equal(
		nth(activity(items(attestations, NOTHING), state), 0).href,
		`${TRANQUIL}/pulls/646`,
	);

	for (const notATicket of [comment("3n2coo4x56fqu"), patch(), manifest()]) {
		const known = state.records[notATicket];
		assert(known !== undefined, notATicket);
		state.records[ticket("646")] = known;
		assert.deepEqual(
			activity(items(attestations, NOTHING), state),
			[],
			notATicket,
		);
	}
	delete state.records[ticket("646")];
	assert.deepEqual(activity(items(attestations, NOTHING), state), []);
	assert.deepEqual(
		wanted(items(attestations, NOTHING), state, now()),
		records([ticket("646")]),
	);
});

test("an_item_shows_only_once_its_repository_is_known_as_one", () => {
	const [attestations, stars] = listings();
	const state = caughtUp();
	state.records[manifest()] = {
		kind: "ticket",
		title: "not a repository",
		pull: false,
	};
	assert.deepEqual(activity(items(attestations, stars), state), []);
	delete state.records[manifest()];
	assert.deepEqual(activity(items(attestations, stars), state), []);
});

test("what_is_attested_must_be_a_ticket_a_comment_or_a_patch_made_at_some_time", () => {
	const state = caughtUp();
	const at = "2026-11-17T16:04:44.604Z";
	assert.equal(
		activity(items(attested(patch(), at), NOTHING), state).length,
		1,
	);
	for (const [subject, createdAt] of [
		[manifest(), at],
		[uri("org.tangled.feed.reaction", "3n2jgar76we6n"), at],
		[`${patch()}/extra`, at],
		[patch(), "the other day"],
	] as const) {
		const attestations = attested(subject, createdAt);
		assert.deepEqual(
			activity(items(attestations, NOTHING), state),
			[],
			subject,
		);
		assert.deepEqual(
			wanted(items(attestations, NOTHING), emptyState(), now()),
			[],
			subject,
		);
	}
	const undated = {
		records: [{ uri: "at://a/b/c", value: { subject: { identity: REPO } } }],
	};
	assert.deepEqual(activity(items(NOTHING, undated), state), []);
	const unnamed = {
		records: [{ uri: "at://a/b/c", value: { subject: {}, createdAt: at } }],
	};
	assert.deepEqual(activity(items(NOTHING, unnamed), state), []);
});

test("a_record_is_remembered_by_what_its_collection_says_it_is", () => {
	const state = emptyState();
	fetch(state, "ticket-646");
	fetch(state, "ticket-690");
	fetch(state, "comment-3n27n2ynaeequ");
	fetch(state, "patch");
	fetch(state, "manifest");
	assert.deepEqual(state.records, {
		[ticket("646")]: {
			kind: "ticket",
			title: "fix: cache headers and add etags",
			pull: true,
		},
		[ticket("690")]: {
			kind: "ticket",
			title: "Proposal for type-safe scopes",
			pull: false,
		},
		[comment("3n27n2ynaeequ")]: {
			kind: "comment",
			text: "new round!",
			ticket: "646",
		},
		[patch()]: { kind: "patch", ticket: "646" },
		[manifest()]: {
			kind: "repo",
			owner: "did:web:tranquil.tranquil.farm",
			name: "tranquil-pds",
		},
	});

	const pulls = emptyState();
	remember(pulls, ticket("1"), { title: { text: "a" }, targetBranch: null });
	remember(pulls, ticket("2"), { title: { text: "a" }, targetBranch: {} });
	remember(pulls, ticket("3"), { title: { text: "a" }, targetBranch: "" });
	remember(pulls, ticket("4"), { title: { text: "a" }, targetBranch: false });
	assert.deepEqual(
		Object.values(pulls.records).map(
			(known) => known.kind === "ticket" && known.pull,
		),
		[false, true, true, true],
	);

	const skipped = emptyState();
	remember(skipped, "not a uri", record("ticket-646").value);
	remember(skipped, ticket("1"), {
		title: { text: " \n " },
		targetBranch: "main",
	});
	remember(skipped, ticket("2"), { title: "a title" });
	remember(skipped, comment("3"), {
		subject: { uri: ticket("1") },
		body: { text: "" },
	});
	remember(skipped, comment("4"), {
		subject: { uri: "a ticket" },
		body: { text: "a" },
	});
	remember(skipped, comment("5"), { subject: { uri: ticket("1") } });
	remember(skipped, comment("6"), {
		subject: { uri: ticket("1") },
		body: { text: 7 },
	});
	remember(skipped, manifest(), { declaration: { owner: ME } });
	remember(skipped, patch(), { declaration: { name: "a" } });
	remember(skipped, "a manifest", record("manifest").value);
	remember(
		skipped,
		uri("org.tangled.feed.reaction", "3n2jgar76we6n"),
		record("manifest").value,
	);
	for (const [uri, known] of Object.entries(skipped.records)) {
		assert.deepEqual(known, { kind: "skipped" }, uri);
	}
	assert.equal(Object.keys(skipped.records).length, 11);
});
