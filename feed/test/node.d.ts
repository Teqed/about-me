declare module "node:test" {
	export function test(name: string, fn: () => void | Promise<void>): void;
	export function describe(name: string, fn: () => void): void;
}

declare module "node:assert/strict" {
	const assert: {
		(value: unknown, message?: string): asserts value;
		ok(value: unknown, message?: string): asserts value;
		equal<T>(
			actual: unknown,
			expected: T,
			message?: string,
		): asserts actual is T;
		notEqual(actual: unknown, expected: unknown, message?: string): void;
		deepEqual<T>(
			actual: unknown,
			expected: T,
			message?: string,
		): asserts actual is T;
		notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
		match(value: string, pattern: RegExp, message?: string): void;
		throws(fn: () => unknown, message?: string): void;
	};
	export default assert;
}

declare module "node:fs" {
	export function readFileSync(path: string | URL, encoding: "utf8"): string;
}

interface ImportMeta {
	url: string;
}
