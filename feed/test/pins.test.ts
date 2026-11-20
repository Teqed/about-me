import assert from "node:assert/strict";
import { test } from "node:test";
import { ATOM_TRIES } from "../src/config.ts";
import type { Pin } from "../src/model.ts";
import {
	newestCommit,
	readAtom,
	revTime,
	row,
	seen,
	wantsAtom,
} from "../src/pins.ts";
import { fixture, json, time } from "./helpers.ts";

const NEWEST =
	"https://tangled.org/quilling.dev/nixos-config/commit/7dea9ea092e6b5a677093493d8e43e031d249e33";
const BEFORE_IT =
	"https://tangled.org/quilling.dev/nixos-config/commit/d8bbf84d77e6f07781e1494be12ce4439226db0c";

function rev(name: string): string {
	return json<{ rev: string }>(name).rev;
}

function before(text: string, mark: string): string {
	const at = text.indexOf(mark);
	assert(at >= 0, mark);
	return text.slice(0, at);
}

function after(text: string, mark: string): string {
	const at = text.indexOf(mark);
	assert(at >= 0, mark);
	return text.slice(at + mark.length);
}

function feedBeforeThePush(): string {
	return after(fixture("nixos-config.atom"), "</entry>");
}

function entry(link: string, updated: string, content: string): string {
	return `<entry><link href="${link}"/><updated>${updated}</updated>${content}</entry>`;
}

test("a_tid_is_the_time_it_was_made", () => {
	assert.equal(
		revTime(rev("rev-nixos-config.json")),
		time("2026-11-16T04:38:39.050737Z"),
	);
	assert.equal(
		revTime(rev("rev-ratlogin.json")),
		time("2026-10-28T20:57:22.717797Z"),
	);
	assert.equal(revTime("3n2mqxxigl22y"), time("2026-11-18T23:54:38.1Z"));
});

test("what_is_not_a_tid_has_no_time", () => {
	for (const notATid of [
		"",
		"self",
		"3n2fph2mpzl2",
		"3n2fph2mpzl222",
		"3n2fph2mpzl21",
		"zzzzzzzzzzzzz",
	]) {
		assert.equal(revTime(notATid), null, JSON.stringify(notATid));
	}
});

test("a_tid_holds_sixty_four_bits_and_no_more", () => {
	assert.equal(revTime("2222222222222"), "1970-01-01T00:00:00.000Z");
	assert.equal(revTime("222222222222z"), "1970-01-01T00:00:00.000Z");
	assert.equal(revTime("22222222223zz"), "1970-01-01T00:00:00.000Z");
	assert.equal(revTime("222222222zb22"), "1970-01-01T00:00:00.000Z");
	assert.equal(revTime("222222222zc22"), "1970-01-01T00:00:00.001Z");
	assert.equal(revTime("jzzzzzzzzzzzz"), "2540-11-07T23:35:09.481Z");
	assert.equal(revTime("k222222222222"), null);
	assert.equal(revTime("3n2fph2mpzl2\u{1f600}"), null);
	assert.equal(revTime("3n2fph2mpzl\u{1f600}"), null);
});

test("the_newest_commit_is_read_from_the_start_of_a_feed", () => {
	const commit = newestCommit(fixture("nixos-config.atom"));
	assert(commit !== null, "a commit");
	assert.equal(commit.message, "foundry autostart worlds");
	assert.equal(commit.href, NEWEST);
	assert.equal(commit.t, time("2026-11-16T04:38:32Z"));
});

test("a_tag_is_not_a_commit", () => {
	const atom = fixture("ratlogin.atom");
	const commit = newestCommit(atom);
	assert(commit !== null, "a commit");
	assert.equal(commit.message, "reject compromised eMudhra intermediates");
	assert.equal(
		commit.href,
		"https://tangled.org/quilling.dev/ratlogin/commit/cb14b5e2494d2b840ced0b2fb73d9f30b1f2a777",
	);
	assert.equal(commit.t, time("2026-10-20T21:26:11Z"));

	assert.equal(newestCommit(before(atom, "</entry>")), null);
});

test("a_feed_cut_inside_its_first_commit_has_none_yet", () => {
	const cut = before(fixture("nixos-config.atom"), "</content>");
	assert.equal(newestCommit(cut), null);
	assert.equal(newestCommit(""), null);

	const commit = newestCommit(`${cut}</content>`);
	assert(commit !== null, "a commit");
	assert.equal(commit.message, "foundry autostart worlds");
});

test("a_commit_without_a_time_is_passed_over", () => {
	const whole = fixture("nixos-config.atom");
	const atom = whole.replace(
		"2026-11-16T04:38:32.000Z</updated>\n        <content",
		"just now</updated>\n        <content",
	);
	assert.notEqual(atom, whole);
	const commit = newestCommit(atom);
	assert(commit !== null, "a commit");
	assert.equal(commit.href, BEFORE_IT);
});

test("a_first_sighting_learns_its_commit", () => {
	const first = seen(undefined, rev("rev-nixos-config.json"));
	assert(wantsAtom(first));
	const nameOnly = row("nixos-config", first);
	assert(nameOnly !== null, "a row");
	assert.equal(nameOnly.text, "nixos-config");
	assert.equal(nameOnly.t, time("2026-11-16T04:38:39.050737Z"));
	assert.equal(nameOnly.href, "https://tangled.org/quilling.dev/nixos-config");

	const pin = readAtom(first, fixture("nixos-config.atom"));
	assert(pin.current && !wantsAtom(pin));
	const pushed = row("nixos-config", pin);
	assert(pushed !== null, "a row");
	assert.equal(pushed.verb, "pushed");
	assert.equal(pushed.text, "nixos-config: foundry autostart worlds");
	assert.equal(pushed.t, time("2026-11-16T04:38:32Z"));
	assert.equal(pushed.href, NEWEST);
});

test("the_same_rev_changes_nothing", () => {
	const same = rev("rev-nixos-config.json");
	const pin = readAtom(seen(undefined, same), fixture("nixos-config.atom"));
	assert.deepEqual(seen(pin, same), pin);
});

test("a_new_rev_shows_its_commit_once_the_feed_has_it", () => {
	const earlier = readAtom(
		seen(undefined, "3n2fmk2aaaa22"),
		feedBeforeThePush(),
	);
	const rowBefore = row("nixos-config", earlier);
	assert(rowBefore !== null, "a row");
	assert.equal(
		rowBefore.text,
		"nixos-config: jupiter foundry access for noctuae",
	);
	assert.equal(rowBefore.t, time("2026-11-16T03:46:41Z"));
	assert.equal(rowBefore.href, BEFORE_IT);

	const pushed = seen(earlier, rev("rev-nixos-config.json"));
	assert(!pushed.current && wantsAtom(pushed));
	assert.deepEqual(row("nixos-config", pushed), rowBefore);

	const waiting = readAtom(pushed, feedBeforeThePush());
	assert(!waiting.current && wantsAtom(waiting));
	assert.equal(waiting.tries, 1);
	assert.deepEqual(row("nixos-config", waiting), rowBefore);

	const pin = readAtom(waiting, fixture("nixos-config.atom"));
	assert(pin.current && !wantsAtom(pin));
	const found = row("nixos-config", pin);
	assert(found !== null, "a row");
	assert.equal(found.text, "nixos-config: foundry autostart worlds");
	assert.equal(found.t, time("2026-11-16T04:38:32Z"));
});

test("a_rev_without_a_commit_changes_nothing_that_shows", () => {
	const atom = fixture("ratlogin.atom");
	const earlier = readAtom(seen(undefined, "3myxnbo4l5722"), atom);
	const rowBefore = row("ratlogin", earlier);
	assert(rowBefore !== null, "a row");
	assert.equal(
		rowBefore.text,
		"ratlogin: reject compromised eMudhra intermediates",
	);

	let pin = seen(earlier, "3n2fph2mpzl22");
	for (let tries = 0; tries < ATOM_TRIES; tries++) {
		assert(wantsAtom(pin));
		pin = readAtom(pin, atom);
		assert.deepEqual(row("ratlogin", pin), rowBefore);
	}
	assert(!wantsAtom(pin) && !pin.current);
});

test("a_pin_with_neither_a_commit_nor_a_tid_has_no_row", () => {
	const pin: Pin = { rev: "self", commit: null, current: false, tries: 0 };
	assert.equal(row("nixos-config", pin), null);

	pin.commit = {
		message: "a message",
		href: NEWEST,
		t: time("2026-11-16T04:38:32Z"),
	};
	assert.equal(row("nixos-config", pin)?.text, "nixos-config: a message");
});

test("a_pin_seen_again_is_a_pin_of_its_own", () => {
	const pin = readAtom(seen(undefined, "3n2fmk2aaaa22"), feedBeforeThePush());
	const again = seen(pin, "3n2fmk2aaaa22");
	assert.notEqual(again, pin);
	assert.deepEqual(seen(pin, "3n2fph2mpzl22"), {
		rev: "3n2fph2mpzl22",
		commit: pin.commit,
		current: false,
		tries: 0,
	});
	assert.deepEqual(seen(undefined, "3n2fph2mpzl22"), {
		rev: "3n2fph2mpzl22",
		commit: null,
		current: false,
		tries: 0,
	});
	const tried = readAtom(pin, feedBeforeThePush());
	assert.deepEqual(tried, { ...pin, tries: 1 });
	assert.deepEqual(seen(tried, "3n2fph2mpzl22").tries, 0);
});

test("an_entry_is_a_commit_only_with_a_commit_link_a_message_and_a_time", () => {
	const link = "https://tangled.org/quilling.dev/ratlogin/commit/cb14b5e";
	const at = "2026-10-20T21:26:11+00:00";
	const whole = entry(link, at, "<content>a message</content>");
	assert.deepEqual(newestCommit(`<feed>${whole}</feed>`), {
		message: "a message",
		href: link,
		t: time(at),
	});
	const tag = `<link href="${link.replace("/commit/", "/tags/")}"/>`;
	const linkedTwice = whole.replace("<updated>", `${tag}<updated>`);
	assert.equal(newestCommit(linkedTwice)?.href, link);
	const cut = `<entry><content>a</content><updated>${at}</updated><link href="${link}`;
	for (const [what, atom] of [
		["no entry", whole.replace("<entry>", "")],
		[
			"a tag",
			entry(link.replace("/commit/", "/tags/"), at, "<content>a</content>"),
		],
		["no link", whole.replace("<link href=", "<link rel=")],
		["an open link", `<entry><link href="${link}`],
		["no content", entry(link, at, "")],
		["empty content", entry(link, at, "<content></content>")],
		["blank content", entry(link, at, "<content> <![CDATA[ \n ]]> </content>")],
		["open content", entry(link, at, "<content")],
		["no time", whole.replace("<updated>", "<published>")],
		["content never opened", whole.replace("<content>", "")],
		["a link cut short", cut],
		["a tag before the commit", whole.replace("<link", `${tag}<link`)],
	] as const) {
		assert.equal(newestCommit(atom), null, what);
		assert.equal(newestCommit(atom + whole)?.message, "a message", what);
	}
});

test("a_message_is_the_first_line_of_the_content_out_of_its_wrapping", () => {
	const link = "https://tangled.org/quilling.dev/ratlogin/commit/cb14b5e";
	const at = "2026-10-20T21:26:11Z";
	const rest = `<link href="${link}"/></entry>`;
	const opening = `<entry><content>opening</content><updated>${at}</updated>${rest}`;
	assert.equal(newestCommit(opening)?.message, "opening");
	const dated = `<entry><updated>${at}</updated><content>dated</content>${rest}`;
	assert.equal(newestCommit(dated)?.message, "dated");
	for (const [content, message] of [
		["<content>plain</content>", "plain"],
		['<content type="html">\n  typed  \n</content>', "typed"],
		["<content><![CDATA[wrapped]]></content>", "wrapped"],
		["<content> <![CDATA[ padded \r\nbody]]> </content>", "padded "],
		["<content><![CDATA[half wrapped</content>", "<![CDATA[half wrapped"],
		["<content>half unwrapped]]></content>", "half unwrapped]]>"],
		["<content>first</content><content>second</content>", "first"],
	] as const) {
		const commit = newestCommit(entry(link, at, content));
		assert.equal(commit?.message, message, content);
	}
});
