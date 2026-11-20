import { BUDGET } from "./config.ts";

export type Read =
	| { kind: "fresh"; body: string; etag: string | null }
	| { kind: "unchanged" }
	| { kind: "notFound"; status: number }
	| { kind: "repoNotFound" }
	| { kind: "httpNotFound" }
	| { kind: "unknown"; reason: string };

export class Client {
	requests = 0;
	unchanged = 0;

	get(url: string, etag: string | null = null): Promise<Read> {
		return this.read(url, etag, 256 * 1024, false);
	}

	getPrefix(url: string, limit: number): Promise<Read> {
		return this.read(url, null, limit, true);
	}

	private async read(
		url: string,
		etag: string | null,
		limit: number,
		prefix: boolean,
	): Promise<Read> {
		if (this.requests >= BUDGET)
			return { kind: "unknown", reason: "budget exhausted" };
		const controller = new AbortController();
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, 5000);
		try {
			const headers = new Headers({
				"User-Agent": "quilling.dev-feed (+https://quilling.dev)",
			});
			if (etag !== null) headers.set("If-None-Match", etag);
			const request = new Request(url, { headers, signal: controller.signal });
			this.requests++;
			const response = await fetch(request);
			if (response.status === 304) {
				this.unchanged++;
				return { kind: "unchanged" };
			}
			if (!response.ok && ![400, 404, 410].includes(response.status))
				return { kind: "unknown", reason: `HTTP ${response.status}` };
			const reader = response.body?.getReader();
			const chunks: Uint8Array[] = [];
			let size = 0;
			if (reader) {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					const remaining = limit - size;
					chunks.push(value.subarray(0, remaining));
					size += Math.min(value.length, remaining);
					if (value.length > remaining || (prefix && size === limit)) {
						if (!prefix)
							return {
								kind: "unknown",
								reason: `response exceeds ${limit} bytes`,
							};
						break;
					}
				}
			}
			const bytes = new Uint8Array(size);
			let offset = 0;
			for (const chunk of chunks) {
				bytes.set(chunk, offset);
				offset += chunk.length;
			}
			const body = new TextDecoder().decode(bytes);
			if (response.status === 400 || response.status === 404) {
				let error: unknown;
				try {
					error = (JSON.parse(body) as { error?: unknown } | null)?.error;
				} catch {}
				if (error === "RecordNotFound")
					return { kind: "notFound", status: response.status };
				if (error === "RepoNotFound") return { kind: "repoNotFound" };
			}
			if (response.status === 404 || response.status === 410)
				return { kind: "httpNotFound" };
			if (!response.ok)
				return { kind: "unknown", reason: `HTTP ${response.status}` };
			return { kind: "fresh", body, etag: response.headers.get("ETag") };
		} catch (error) {
			return { kind: "unknown", reason: timedOut ? "timeout" : String(error) };
		} finally {
			clearTimeout(timer);
			controller.abort();
		}
	}
}
