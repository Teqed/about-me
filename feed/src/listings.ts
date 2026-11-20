import * as bsky from "./bsky.ts";
import { ME } from "./config.ts";
import { type AtRecord, field, type Listing, type State } from "./model.ts";

export interface Source {
	collection: string;
	limit: number;
}

export const POSTS: Source = { collection: "app.bsky.feed.post", limit: 30 };
export const ATTESTATIONS: Source = {
	collection: "org.tangled.graph.attestation",
	limit: 20,
};
export const STARS: Source = { collection: "org.tangled.feed.star", limit: 10 };

export interface Listings {
	posts: Listing;
	attestations: Listing;
	stars: Listing;
}

export function url(source: Source, pds: string): string {
	return `${pds}/xrpc/com.atproto.repo.listRecords?repo=${ME}&collection=${source.collection}&limit=${source.limit}`;
}

export function slim(source: Source, listing: Listing): Listing {
	if (source.collection === POSTS.collection) {
		return { records: bsky.slim(listing.records) };
	}
	const key = source.collection === STARS.collection ? "identity" : "uri";
	const records: AtRecord[] = [];
	for (const record of listing.records) {
		records.push({ uri: record.uri, value: subject(record.value, key) });
	}
	return { records };
}

function subject(value: unknown, key: string): unknown {
	return {
		createdAt: field(value, "createdAt") ?? null,
		subject: { [key]: field(value, "subject", key) ?? null },
	};
}

export function cached(
	state: State,
	pds: string,
	rev: string | null,
): Listings | null {
	if (rev === null || rev !== state.rev) {
		return null;
	}
	const posts = state.cache[url(POSTS, pds)];
	const attestations = state.cache[url(ATTESTATIONS, pds)];
	const stars = state.cache[url(STARS, pds)];
	if (!posts || !attestations || !stars) {
		return null;
	}
	return {
		posts: posts.listing,
		attestations: attestations.listing,
		stars: stars.listing,
	};
}

export function rememberRev(
	state: State,
	rev: string | null,
	allRead: boolean,
): void {
	if (rev !== null && allRead) {
		state.rev = rev;
	}
}
