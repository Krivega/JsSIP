// Stable 8.x public API. Internal TypeScript sources intentionally remain stricter.
/**
 * -param {String} [scheme]
 * -param {String} [user]
 * -param {String} host
 * -param {String} [port]
 * -param {Object} [parameters]
 * -param {Object} [headers]
 *
 */
declare class URI {
	/**
	 * Parse the given string and returns a JsSIP.URI instance or undefined if
	 * it is an invalid URI.
	 */
	static parse(uri: string): URI | undefined;
	constructor(
		scheme: URI.URIScheme | undefined,
		user: string | undefined,
		host: string,
		port?: number | null,
		parameters?: URI.Parameters,
		headers?: URI.Headers
	);
	get scheme(): string;
	set scheme(value: string);
	get user(): string;
	set user(value: string | undefined);
	get host(): string;
	set host(value: string);
	get port(): number;
	set port(value: number | string | null | undefined);
	setParam(key: string, value?: string | number | null): void;
	getParam<T = unknown>(key: string): T;
	hasParam(key: string): boolean;
	deleteParam(parameter: string): string | null | undefined;
	clearParams(): void;
	setHeader(name: string, value: string | string[]): void;
	getHeader(name: string): string[];
	hasHeader(name: string): boolean;
	deleteHeader(header: string): string[] | undefined;
	clearHeaders(): void;
	clone(): this;
	toString(): string;
	toAor(show_port?: boolean): string;
}
declare namespace URI {
	type URIScheme = 'sip' | string;
	type Parameters = Record<string, string | null>;
	type Headers = Record<string, string | string[]>;
}
export = URI;
