import assert from "node:assert/strict";
import { test } from "node:test";
import * as text from "../src/text.ts";

function line(input: string): string {
	return text.line(input) ?? "";
}

test("keeps_only_the_first_line", () => {
	assert.equal(line("\n  new round!\r\n\nby the power of axum"), "new round!");
	assert.equal(line(" \n "), "");
});

test("links_and_images_read_as_their_labels", () => {
	assert.equal(
		line("after the [next release](https://example.org/pull/754) we can"),
		"after the next release we can",
	);
	assert.equal(
		line("![a cat](cat.png) [one](1) and [two](2)"),
		"a cat one and two",
	);
	assert.equal(line("![](only-an-image.png)"), "");
});

test("brackets_that_are_not_links_stay", () => {
	assert.equal(
		line("[realizing I dont care] I dont care"),
		"[realizing I dont care] I dont care",
	);
	assert.equal(line("a [b] (c) [d](e"), "a [b] (c) [d](e");
	assert.equal(line("[not this] but [this](x)"), "[not this] but this");
});

test("a_line_with_nothing_to_show_is_no_line", () => {
	for (const nothing of [
		"",
		" \n ",
		"\r\n",
		"![](only-an-image.png)",
		" [](x) ",
	]) {
		assert.equal(text.line(nothing), null, JSON.stringify(nothing));
	}
});

test("what_is_left_around_a_link_is_trimmed_once_at_the_end", () => {
	assert.equal(line("see [](x) there"), "see  there");
	assert.equal(line("[docs](x)  \r\nmore"), "docs");
	assert.equal(line("wow! [so](x)![much](y)!"), "wow! somuch!");
	assert.equal(line("[a [b](c) d"), "a [b d");
	assert.equal(line("[a](b [c](d) e"), "a e");
	assert.equal(line("one\rline"), "one\rline");
});

test("the_first_line_ends_at_a_line_feed", () => {
	assert.equal(text.firstLine("one\ntwo\nthree"), "one");
	assert.equal(text.firstLine("one \r\ntwo"), "one ");
	assert.equal(text.firstLine("one\r"), "one\r");
	assert.equal(text.firstLine("one\rline\n"), "one\rline");
	assert.equal(text.firstLine("one\r\r\n"), "one\r");
	assert.equal(text.firstLine("\ntwo"), "");
	assert.equal(text.firstLine(""), "");
});
