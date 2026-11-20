import { PDS_TTL_MS } from "./config.ts";
import { field, type State, stringField } from "./model.ts";

export function known(state: State, did: string, now: Date): string | null {
	const pds = Object.hasOwn(state.pds, did) ? state.pds[did] : undefined;
	if (pds === undefined) {
		return null;
	}
	return now.getTime() - Date.parse(pds.at) < PDS_TTL_MS ? pds.url : null;
}

export function remember(
	state: State,
	did: string,
	document: unknown,
	now: Date,
): void {
	const url = endpoint(document);
	if (url !== null) {
		state.pds[did] = { url, at: now.toISOString() };
	}
}

function endpoint(document: unknown): string | null {
	const services = field(document, "service");
	if (!Array.isArray(services)) {
		return null;
	}
	for (const service of services) {
		if (field(service, "id") === "#atproto_pds") {
			return stringField(service, "serviceEndpoint");
		}
	}
	return null;
}
