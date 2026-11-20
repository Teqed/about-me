interface Link {
	before: string;
	label: string;
	after: string;
}

export function line(text: string): string | null {
	let rest = firstLine(text.trim());
	let out = "";
	for (let link = nextLink(rest); link !== null; link = nextLink(rest)) {
		out += link.before + link.label;
		rest = link.after;
	}
	const shown = (out + rest).trim();
	return shown === "" ? null : shown;
}

export function firstLine(text: string): string {
	const end = text.indexOf("\n");
	if (end < 0) {
		return text;
	}
	return text.slice(0, text[end - 1] === "\r" ? end - 1 : end);
}

function nextLink(text: string): Link | null {
	let open = -1;
	for (let at = 0; at < text.length; at++) {
		if (text[at] === "[" && open < 0) {
			open = at;
		} else if (text[at] === "]") {
			if (open >= 0 && text[at + 1] === "(") {
				return link(text, open, at);
			}
			open = -1;
		}
	}
	return null;
}

function link(text: string, open: number, close: number): Link | null {
	const end = text.indexOf(")", close);
	if (end < 0) {
		return null;
	}
	const image = text[open - 1] === "!" ? 1 : 0;
	return {
		before: text.slice(0, open - image),
		label: text.slice(open + 1, close),
		after: text.slice(end + 1),
	};
}
