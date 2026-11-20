import { HOME_PDS, KNOT, ME, PINS } from "../src/config.ts";
import worker from "../src/index.ts";
import type { AtRecord, Feeds, State } from "../src/model.ts";
import { fixture, json } from "./helpers.ts";

export const REPO = "did:plc:jj6ajj6duxnlthwtnob4qyuv";
export const POSTS = "app.bsky.feed.post";
export const ATTESTATIONS = "org.tangled.graph.attestation";
export const STARS = "org.tangled.feed.star";

const RECORDS = [
	"manifest",
	"comment-3n2coo4x56fqu",
	"comment-3n2chprpezdqu",
	"comment-3n2cbitrta2qu",
	"comment-3n27n2ynaeequ",
	"patch",
	"ticket-646",
];

export interface Put {
	bucket: string;
	key: string;
	options: unknown;
}

export interface World {
	rev: string;
	etags: { [collection: string]: string | null };
	bodies: { [collection: string]: string };
	pinRevs: { [did: string]: string };
	atoms: { [name: string]: string };
	pds: { [did: string]: string };
	records: { [uri: string]: AtRecord };
	answer: ((url: string) => Response | null) | null;
	stateUnreadable: boolean;
	state: string | null;
	feeds: string | null;
}

export interface Run {
	line: string;
	requests: string[];
	puts: Put[];
	feeds: Feeds;
	state: State;
}

export function world(): World {
	const records: World["records"] = {};
	for (const name of RECORDS) {
		const record = json<AtRecord>(`records/${name}.json`);
		records[record.uri] = record;
	}
	const [nixos, ratlogin] = PINS;
	return {
		rev: "3n2pj4njjbu22",
		etags: { [POSTS]: 'W/"p1"', [ATTESTATIONS]: 'W/"a1"', [STARS]: 'W/"s1"' },
		bodies: {
			[POSTS]: fixture("posts.json"),
			[ATTESTATIONS]: fixture("attestations.json"),
			[STARS]: fixture("stars.json"),
		},
		pinRevs: {
			[nixos?.[1] ?? ""]: json<{ rev: string }>("rev-nixos-config.json").rev,
			[ratlogin?.[1] ?? ""]: json<{ rev: string }>("rev-ratlogin.json").rev,
		},
		atoms: {
			"nixos-config": fixture("nixos-config.atom"),
			ratlogin: fixture("ratlogin.atom"),
		},
		pds: { [ME]: HOME_PDS, [REPO]: KNOT },
		records,
		answer: null,
		stateUnreadable: false,
		state: null,
		feeds: null,
	};
}

export function failing(status: number, body = "busy"): Response {
	return new Response(body, { status });
}

export function xrpcError(error: string, status = 400): Response {
	return Response.json({ error, message: error }, { status });
}

function document(did: string, endpoint: string): Response {
	const service = { id: "#atproto_pds", serviceEndpoint: endpoint };
	return Response.json({ id: did, service: [service] });
}

function latestCommit(world: World, did: string | null): Response {
	const rev = did === ME ? world.rev : world.pinRevs[did ?? ""];
	return rev === undefined
		? xrpcError("RepoNotFound")
		: Response.json({ cid: "bafy", rev });
}

function listing(world: World, request: Request, collection: string): Response {
	const etag = world.etags[collection] ?? null;
	if (etag !== null && request.headers.get("If-None-Match") === etag) {
		return new Response(null, { status: 304 });
	}
	const headers = new Headers();
	if (etag !== null) {
		headers.set("ETag", etag);
	}
	return new Response(world.bodies[collection] ?? "", { headers });
}

function record(world: World, query: URLSearchParams): Response {
	const uri = `at://${query.get("repo")}/${query.get("collection")}/${query.get("rkey")}`;
	const found = world.records[uri];
	return found === undefined
		? xrpcError("RecordNotFound")
		: Response.json(found);
}

function serve(world: World, request: Request): Response {
	const url = new URL(request.url);
	const query = url.searchParams;
	if (url.host === "plc.directory") {
		const did = decodeURIComponent(url.pathname.slice(1));
		const endpoint = world.pds[did];
		return endpoint === undefined
			? failing(404, "DID not registered")
			: document(did, endpoint);
	}
	if (url.pathname === "/xrpc/com.atproto.sync.getLatestCommit") {
		return latestCommit(world, query.get("did"));
	}
	if (url.pathname === "/xrpc/com.atproto.repo.listRecords") {
		return listing(world, request, query.get("collection") ?? "");
	}
	if (url.pathname === "/xrpc/com.atproto.repo.getRecord") {
		return record(world, query);
	}
	const name = url.pathname.split("/")[2] ?? "";
	const atom = url.pathname.endsWith("/feed.atom")
		? world.atoms[name]
		: undefined;
	return atom === undefined ? failing(404, "not found") : new Response(atom);
}

export async function withFetch<T>(
	answer: (request: Request) => Response,
	work: (sent: Request[]) => Promise<T>,
): Promise<T> {
	const real = globalThis.fetch;
	const sent: Request[] = [];
	const fake = async (request: Request): Promise<Response> => {
		sent.push(request);
		return answer(request);
	};
	globalThis.fetch = fake as typeof fetch;
	try {
		return await work(sent);
	} finally {
		globalThis.fetch = real;
	}
}

function bucket(world: World, name: "state" | "feeds", puts: Put[]): R2Bucket {
	const fake = {
		get: async (key: string) => {
			if (name === "state" && world.stateUnreadable) {
				throw new Error("the state bucket is away");
			}
			const text = key === `${name}.json` ? world[name] : null;
			return text === null ? null : { text: async () => text };
		},
		put: async (key: string, text: string, options: unknown) => {
			world[name] = text;
			puts.push({ bucket: name, key, options });
		},
	};
	return fake as unknown as R2Bucket;
}

async function logged(work: () => Promise<void>): Promise<string> {
	const real = console.log;
	const lines: string[] = [];
	console.log = (line: string) => {
		lines.push(line);
	};
	try {
		await work();
	} finally {
		console.log = real;
	}
	return lines.join("\n");
}

export async function run(world: World): Promise<Run> {
	const puts: Put[] = [];
	const env = {
		STATE: bucket(world, "state", puts),
		FEED: bucket(world, "feeds", puts),
	};
	const answer = (request: Request) =>
		world.answer?.(request.url) ?? serve(world, request);
	return withFetch(answer, async (sent) => {
		const line = await logged(() =>
			worker.scheduled(
				{} as ScheduledController,
				env as unknown as Env,
				{} as ExecutionContext,
			),
		);
		return {
			line,
			requests: sent.map((request) => request.url),
			puts,
			feeds: JSON.parse(world.feeds ?? "null"),
			state: JSON.parse(world.state ?? "null"),
		};
	});
}

export function count(run: Run, part: string): number {
	return run.requests.filter((url) => url.includes(part)).length;
}
