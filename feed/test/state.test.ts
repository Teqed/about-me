import assert from "node:assert/strict";
import { test } from "node:test";
import { rows } from "../src/bsky.ts";
import { HOME_PDS, ME, PINS } from "../src/config.ts";
import { cached } from "../src/listings.ts";
import { readState } from "../src/model.ts";
import * as pds from "../src/pds.ts";
import * as pins from "../src/pins.ts";
import { tangled } from "../src/select.ts";
import { activity, forget, items, wanted } from "../src/tangled.ts";
import { json, listing, row, texts } from "./helpers.ts";

function now(): Date {
	return new Date("2026-11-20T01:40:00Z");
}

test("the_first_run_after_the_rust_job_reads_nothing_again", () => {
	const state = readState(json("state.json"));
	assert.equal(pds.known(state, ME, now()), "https://knot1.tangled.sh");

	const listings = cached(state, HOME_PDS, "3n2pj4njjbu22");
	assert(listings !== null, "cached listings");
	assert.deepEqual(rows(listings.posts), rows(listing("posts.json")));

	const { attestations, stars } = listings;
	assert.deepEqual(wanted(items(attestations, stars), state, now()), []);
	assert.deepEqual(
		activity(items(attestations, stars), state),
		activity(items(listing("attestations.json"), listing("stars.json")), state),
	);
	assert.equal(activity(items(attestations, stars), state).length, 7);

	for (const [, did] of PINS) {
		const pin = state.pins[did];
		assert(pin !== undefined, did);
		assert.deepEqual(pins.seen(pin, pin.rev), pin);
	}
});

test("the_rows_of_a_rust_state_are_the_rows_the_rust_job_showed", () => {
	const state = readState(json("state.json"));
	const listings = cached(state, HOME_PDS, state.rev);
	assert(listings !== null, "cached listings");
	const pinned = [];
	for (const [name, did] of PINS) {
		const pin = state.pins[did];
		assert(pin !== undefined, did);
		const pushed = pins.row(name, pin);
		assert(pushed !== null, name);
		pinned.push(pushed);
	}
	assert.deepEqual(pinned, [
		{
			verb: "pushed",
			text: "nixos-config: foundry autostart worlds",
			t: "2026-11-16T04:38:32Z",
			href: "https://tangled.org/quilling.dev/nixos-config/commit/7dea9ea092e6b5a677093493d8e43e031d249e33",
		},
		{
			verb: "pushed",
			text: "ratlogin: reject compromised eMudhra intermediates",
			t: "2026-10-20T21:26:11Z",
			href: "https://tangled.org/quilling.dev/ratlogin/commit/cb14b5e2494d2b840ced0b2fb73d9f30b1f2a777",
		},
	]);
	const shown = tangled(
		activity(items(listings.attestations, listings.stars), state),
		pinned,
	);
	assert.deepEqual(texts(shown), [
		"nixos-config: foundry autostart worlds",
		"tranquil-pds: yea the todo comment does seem to pretty clearly indicate they are going this direction too. I think youre right",
		"tranquil-pds: yes, we should do away with the grace period!",
		"tranquil-pds: range stuff: sure! we can pass through range. actually after the next tower-http release we can probably do if-range. if we also implement range for blobs that may be useful. for now we can just ignore range when we see if-range headers",
		"ratlogin: reject compromised eMudhra intermediates",
	]);
	assert.deepEqual(
		pins.row(
			"someday",
			state.pins["did:plc:nocommityet"] ?? pins.seen(undefined, ""),
		),
		row(
			"pushed",
			"someday",
			"2026-11-18T23:54:38.1Z",
			"https://tangled.org/quilling.dev/someday",
		),
	);
});

test("forgetting_leaves_a_rust_state_as_it_was_but_for_what_nothing_leads_to", () => {
	const state = readState(json("state.json"));
	const listings = cached(state, HOME_PDS, state.rev);
	assert(listings !== null, "cached listings");
	forget(state, items(listings.attestations, listings.stars));
	const kept = readState(json("state.json"));
	const dropped = "at://did:plc:jj6ajj6duxnlthwtnob4qyuv/org.tangled";
	delete kept.records[`${dropped}.feed.reaction/3n2jgar76we6n`];
	delete kept.records[`${dropped}.track.ticket/690`];
	assert.deepEqual(state, kept);
	assert.equal(state.pds[ME]?.at, "2026-11-20T01:30:40.473Z");
});
