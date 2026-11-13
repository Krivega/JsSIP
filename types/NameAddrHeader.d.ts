// Stable 8.x public API. Internal TypeScript sources intentionally remain stricter.
import URI = require('./URI');
declare class NameAddrHeader {
	/**
	 * Parse the given string and returns a NameAddrHeader instance or undefined if
	 * it is an invalid NameAddrHeader.
	 */
	static parse(name_addr_header: string): NameAddrHeader | undefined;
	constructor(
		uri: URI,
		display_name?: string,
		parameters?: URI.Parameters | null
	);
	get uri(): URI;
	get display_name(): string;
	set display_name(value: string | number | undefined);
	setParam(key: string, value?: string | number | null): void;
	getParam<T = unknown>(key: string): T;
	hasParam(key: string): boolean;
	deleteParam(parameter: string): string | null | undefined;
	clearParams(): void;
	clone(): this;
	toString(): string;
}
export = NameAddrHeader;
