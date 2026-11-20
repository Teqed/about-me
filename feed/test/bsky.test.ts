import assert from "node:assert/strict";
import { test } from "node:test";
import { rows, slim } from "../src/bsky.ts";
import type { AtRecord } from "../src/model.ts";
import { type Fields, listing, nth, response, row, texts } from "./helpers.ts";

test("the_five_newest_text_only_posts", () => {
	const found = rows(listing("posts.json"));
	assert.deepEqual(texts(found), [
		"getting caught blue-handed",
		"I am sooo thirsty what do I do",
		'saying "grr" and meaning it',
		"[realizing I dont care] I dont care",
		"we are adding gacha mechanics",
	]);
	assert.deepEqual(
		found[0],
		row(
			"posted",
			"getting caught blue-handed",
			"2026-11-18T23:54:38.101Z",
			"https://bsky.app/profile/quilling.dev/post/3n2mqxxigl22y",
		),
	);
});

test("posts_with_embeds_are_left_out", () => {
	assert.deepEqual(rows(listing("posts-embeds.json")), []);
});

function linkingPost(): AtRecord<Fields> {
	const post = response("posts-embeds.json").records.find(
		(post) => post.value.facets != null,
	);
	assert(post !== undefined, "a post with facets");
	return post;
}

test("a_link_facet_alone_leaves_a_post_out", () => {
	const post = linkingPost();
	post.value.embed = null;
	assert.deepEqual(rows({ records: [post] }), []);

	const facets = post.value.facets as { features: Fields[] }[];
	nth(nth(facets, 0).features, 0).$type = "app.bsky.richtext.facet#mention";
	const found = rows({ records: [post] });
	assert.equal(found.length, 1);
	assert.equal(
		nth(found, 0).text,
		"juliet added this to pdsls not even a day later so go use that instead",
	);
});

test("an_unreadable_post_is_skipped_alone", () => {
	const posts = response("posts.json");
	nth(posts.records, 0).value.createdAt = "the other day";
	nth(posts.records, 1).value.text = " \n ";
	const found = rows(posts);
	assert.equal(found.length, 5);
	assert.equal(nth(found, 0).text, 'saying "grr" and meaning it');
});

test("a_backdated_post_takes_its_date_s_place", () => {
	const posts = response("posts.json");
	nth(posts.records, 0).value.createdAt = "2026-11-01T00:00:00Z";
	const backdated = texts(rows(posts));
	assert.equal(backdated[0], "I am sooo thirsty what do I do");
	assert.equal(
		backdated[4],
		"is your belly button the normal kind or the freaky kind",
	);
	assert(!backdated.includes("getting caught blue-handed"));

	nth(posts.records, 0).value.createdAt = "2026-11-18T23:00:00Z";
	const found = rows(posts);
	assert.equal(nth(found, 1).text, "getting caught blue-handed");
	for (let i = 1; i < found.length; i++) {
		assert(Date.parse(nth(found, i - 1).t) >= Date.parse(nth(found, i).t));
	}
});

test("no_posts_is_no_rows", () => {
	assert.deepEqual(rows({ records: [] }), []);
});

function only(value: unknown): AtRecord[] {
	const uri =
		"at://did:plc:jrtgsidnmxaen4offglr5lsh/app.bsky.feed.post/3n2mqxxigl22y";
	return [{ uri, value }];
}

test("a_post_is_dated_by_its_instant_whatever_its_offset", () => {
	const posts = response("posts.json");
	nth(posts.records, 0).value.createdAt = "2026-11-19T08:00:00.5009+09:00";
	const found = rows(posts);
	assert.equal(nth(found, 0).text, "I am sooo thirsty what do I do");
	assert.equal(nth(found, 1).text, "getting caught blue-handed");
	assert.equal(nth(found, 1).t, "2026-11-18T23:00:00.500Z");
});

test("a_post_that_is_a_reply_or_is_not_a_post_at_all_is_left_out", () => {
	const post = { text: "hello", createdAt: "2026-11-18T23:54:38.101Z" };
	assert.equal(rows({ records: only(post) }).length, 1);
	assert.equal(rows({ records: only({ ...post, facets: "none" }) }).length, 1);
	assert.equal(rows({ records: only({ ...post, facets: [{}] }) }).length, 1);
	for (const left of [
		{ ...post, reply: { parent: {} } },
		{ ...post, embed: {} },
		{ ...post, text: 7 },
		{ text: "hello" },
		{ createdAt: "2026-11-18T23:54:38.101Z" },
		"hello",
		null,
	]) {
		assert.deepEqual(rows({ records: only(left) }), [], JSON.stringify(left));
	}
	const stray = [{ uri: "at://did:plc:jrtgsidnmxaen4offglr5lsh", value: post }];
	assert.deepEqual(rows({ records: stray }), []);
});

test("slimming_keeps_the_newest_posts_whole_text_and_time_and_nothing_else", () => {
	const posts = response("posts.json");
	nth(posts.records, 0).value.createdAt = "2026-11-18T23:00:00Z";
	const kept = slim(posts.records);
	assert.equal(kept.length, 5);
	assert.deepEqual(kept[1], {
		uri: "at://did:plc:jrtgsidnmxaen4offglr5lsh/app.bsky.feed.post/3n2mqxxigl22y",
		value: {
			createdAt: "2026-11-18T23:00:00Z",
			text: "getting caught blue-handed",
		},
	});
	const whole = "two lines\nof a [linked](https://example.org) post ";
	const two = slim(
		only({ text: whole, createdAt: "2026-11-18T23:54:38+00:00" }),
	);
	assert.deepEqual(nth(two, 0).value, {
		createdAt: "2026-11-18T23:54:38+00:00",
		text: whole,
	});
});
