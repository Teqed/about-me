import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyFeeds, type Row, type Section } from "../src/model.ts";
import { settle, tangled } from "../src/select.ts";
import { row, texts, time } from "./helpers.ts";

function on(day: number, text: string): Row {
	const verb = text.startsWith("pin") ? "pushed" : "comment";
	const date = String(day).padStart(2, "0");
	return row(verb, text, `2026-11-${date}T12:00:00Z`, "");
}

test("pins_pushed_out_take_the_oldest_places", () => {
	const activity = [
		on(16, "a"),
		on(15, "b"),
		on(14, "c"),
		on(13, "d"),
		on(12, "e"),
		on(11, "f"),
	];
	const pins = [on(3, "pin one"), on(2, "pin two")];
	assert.deepEqual(texts(tangled(activity, pins)), [
		"a",
		"b",
		"c",
		"pin one",
		"pin two",
	]);
});

test("pins_already_in_change_nothing", () => {
	const activity = [
		on(16, "a"),
		on(14, "b"),
		on(12, "c"),
		on(10, "d"),
		on(8, "e"),
	];
	const pins = [on(15, "pin one"), on(13, "pin two")];
	assert.deepEqual(texts(tangled(activity, pins)), [
		"a",
		"pin one",
		"b",
		"pin two",
		"c",
	]);
});

test("one_pin_in_and_one_pushed_out", () => {
	const activity = [
		on(16, "a"),
		on(14, "b"),
		on(12, "c"),
		on(10, "d"),
		on(8, "e"),
	];
	const pins = [on(15, "pin one"), on(1, "pin two")];
	assert.deepEqual(texts(tangled(activity, pins)), [
		"a",
		"pin one",
		"b",
		"c",
		"pin two",
	]);
});

test("old_pins_follow_what_little_there_is", () => {
	const activity = [on(16, "a"), on(14, "b")];
	const pins = [on(2, "pin two"), on(3, "pin one")];
	assert.deepEqual(texts(tangled(activity, pins)), [
		"a",
		"b",
		"pin one",
		"pin two",
	]);
	assert.deepEqual(texts(tangled([], pins)), ["pin one", "pin two"]);
});

test("rows_come_out_newest_first_whatever_order_they_came_in", () => {
	const activity = [
		on(10, "d"),
		on(16, "a"),
		on(8, "e"),
		on(12, "c"),
		on(14, "b"),
		on(6, "f"),
	];
	assert.deepEqual(texts(tangled(activity, [])), ["a", "b", "c", "d", "e"]);
	assert.deepEqual(texts(activity), ["d", "a", "e", "c", "b", "f"]);
});

function previous(): Section {
	return {
		ok_at: time("2026-11-19T03:30:00Z"),
		rows: [on(16, "a"), on(14, "b")],
	};
}

test("a_failed_read_keeps_the_previous_panel", () => {
	const now = new Date("2026-11-19T03:40:00Z");
	assert.deepEqual(settle(previous(), null, now), previous());
	const never = emptyFeeds().bsky;
	assert.deepEqual(settle(never, null, now), emptyFeeds().bsky);
});

test("a_good_read_replaces_it_even_with_nothing", () => {
	const now = new Date("2026-11-19T03:40:00Z");
	const fresh = settle(previous(), [on(17, "new")], now);
	assert.equal(fresh.ok_at, time("2026-11-19T03:40:00Z"));
	assert.deepEqual(texts(fresh.rows), ["new"]);

	const empty = settle(previous(), [], now);
	assert.equal(empty.ok_at, time("2026-11-19T03:40:00Z"));
	assert.deepEqual(empty.rows, []);
});

test("rows_are_ordered_by_their_instants_not_their_spelling", () => {
	const spelled = (text: string, t: string): Row => ({ ...on(1, text), t });
	const activity = [
		spelled("noon in tokyo", "2026-11-16T12:00:00+09:00"),
		spelled("the second after", "2026-11-16T03:00:01Z"),
		spelled("half a second after", "2026-11-16T03:00:00.500Z"),
		spelled("noon in new york", "2026-11-15T12:00:00-05:00"),
	];
	assert.deepEqual(texts(tangled(activity, [])), [
		"the second after",
		"half a second after",
		"noon in tokyo",
		"noon in new york",
	]);
});

test("rows_of_the_same_instant_keep_their_order_with_pins_first", () => {
	const activity = [on(16, "a"), on(16, "b"), on(16, "c")];
	const pins = [on(16, "pin one"), on(16, "pin two")];
	assert.deepEqual(texts(tangled(activity, pins)), [
		"pin one",
		"pin two",
		"a",
		"b",
		"c",
	]);
});

test("more_pins_than_rows_leave_no_room_beside_them", () => {
	const pins = [1, 2, 3, 4, 5, 6, 7].map((day) => on(day, `pin ${day}`));
	assert.deepEqual(texts(tangled([on(16, "a")], pins)), [
		"pin 7",
		"pin 6",
		"pin 5",
		"pin 4",
		"pin 3",
	]);
});
