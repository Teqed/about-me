import { ATOM_TRIES, HANDLE } from "./config.ts";
import {
	type Commit,
	instant,
	type Pin,
	type Row,
	type Timestamp,
	timestamp,
} from "./model.ts";
import { firstLine } from "./text.ts";

const TID_DIGITS = "234567abcdefghijklmnopqrstuvwxyz";
const TID_END = 1n << 64n;

export function revTime(rev: string): Timestamp | null {
	if (rev.length !== 13) {
		return null;
	}
	let tid = 0n;
	for (const digit of rev) {
		const value = TID_DIGITS.indexOf(digit);
		if (value < 0) {
			return null;
		}
		tid = tid * 32n + BigInt(value);
	}
	if (tid >= TID_END) {
		return null;
	}
	const microseconds = tid >> 10n;
	return timestamp(Number(microseconds / 1000n));
}

export function newestCommit(atom: string): Commit | null {
	for (const entry of atom.split("<entry>").slice(1)) {
		const commit = readEntry(entry);
		if (commit !== null) {
			return commit;
		}
	}
	return null;
}

function readEntry(entry: string): Commit | null {
	const href = between(entry, '<link href="', '"');
	if (href === null || !href.includes("/commit/")) {
		return null;
	}
	const message = firstLine(element(entry, "content") ?? "");
	const at = instant(element(entry, "updated"));
	if (message === "" || at === null) {
		return null;
	}
	return { message, href, t: timestamp(at) };
}

function between(text: string, open: string, close: string): string | null {
	const start = text.indexOf(open);
	if (start < 0) {
		return null;
	}
	const end = text.indexOf(close, start + open.length);
	return end < 0 ? null : text.slice(start + open.length, end);
}

function element(xml: string, name: string): string | null {
	const tag = xml.indexOf(`<${name}`);
	const open = tag < 0 ? -1 : xml.indexOf(">", tag);
	const close = open < 0 ? -1 : xml.indexOf(`</${name}>`, open);
	if (close < 0) {
		return null;
	}
	const text = xml.slice(open + 1, close).trim();
	if (text.startsWith("<![CDATA[") && text.endsWith("]]>")) {
		return text.slice("<![CDATA[".length, -"]]>".length).trim();
	}
	return text;
}

export function seen(previous: Pin | undefined, rev: string): Pin {
	if (previous?.rev === rev) {
		return { ...previous };
	}
	return { rev, commit: previous?.commit ?? null, current: false, tries: 0 };
}

export function wantsAtom(pin: Pin): boolean {
	return !pin.current && pin.tries < ATOM_TRIES;
}

export function readAtom(pin: Pin, atom: string): Pin {
	const commit = newestCommit(atom);
	if (commit !== null && commit.href !== pin.commit?.href) {
		return { ...pin, commit, current: true };
	}
	return { ...pin, tries: pin.tries + 1 };
}

export function row(name: string, pin: Pin): Row | null {
	if (pin.commit !== null) {
		const { message, href, t } = pin.commit;
		return { verb: "pushed", text: `${name}: ${message}`, t, href };
	}
	const t = revTime(pin.rev);
	if (t === null) {
		return null;
	}
	const href = `https://tangled.org/${HANDLE}/${name}`;
	return { verb: "pushed", text: name, t, href };
}
