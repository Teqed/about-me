import { HANDLE, ROWS } from "./config.ts";
import {
	type AtRecord,
	field,
	instant,
	type Listing,
	parseAtUri,
	type Row,
	stringField,
	timestamp,
} from "./model.ts";
import { line } from "./text.ts";

interface Post {
	uri: string;
	rkey: string;
	at: number;
	createdAt: string;
	text: string;
	line: string;
}

export function rows(posts: Listing): Row[] {
	return newest(posts.records).map((post) => ({
		verb: "posted",
		text: post.line,
		t: timestamp(post.at),
		href: `https://bsky.app/profile/${HANDLE}/post/${post.rkey}`,
	}));
}

export function slim(records: AtRecord[]): AtRecord[] {
	return newest(records).map((post) => ({
		uri: post.uri,
		value: { createdAt: post.createdAt, text: post.text },
	}));
}

function newest(records: AtRecord[]): Post[] {
	const posts: Post[] = [];
	for (const record of records) {
		const post = read(record);
		if (post !== null) {
			posts.push(post);
		}
	}
	posts.sort((a, b) => b.at - a.at);
	return posts.slice(0, ROWS);
}

function read(record: AtRecord): Post | null {
	const post = record.value;
	if (field(post, "reply") != null || field(post, "embed") != null) {
		return null;
	}
	const rkey = parseAtUri(record.uri)?.rkey;
	const text = stringField(post, "text");
	const createdAt = stringField(post, "createdAt");
	const at = instant(createdAt);
	if (hasLink(post) || rkey === undefined || text === null) {
		return null;
	}
	const first = line(text);
	if (createdAt === null || at === null || first === null) {
		return null;
	}
	return { uri: record.uri, rkey, at, createdAt, text, line: first };
}

function hasLink(post: unknown): boolean {
	for (const facet of list(field(post, "facets"))) {
		for (const feature of list(field(facet, "features"))) {
			if (field(feature, "$type") === "app.bsky.richtext.facet#link") {
				return true;
			}
		}
	}
	return false;
}

function list(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}
