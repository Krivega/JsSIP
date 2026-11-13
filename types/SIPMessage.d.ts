// Stable 8.x public API. Internal TypeScript sources intentionally remain stricter.
import type { EventEmitter } from 'events';
import * as Grammar from './Grammar';
import type { Transport } from './Transport';
import NameAddrHeader = require('./NameAddrHeader');
import URI = require('./URI');
/**
 * A single media description of a parsed SDP.
 */
export type SDPMediaDescription = {
	type: string;
	direction?: string;
	[key: string]: any;
};
/**
 * An SDP as returned by `sdp-transform`'s `parse()`.
 */
export type SDP = {
	media: SDPMediaDescription[];
	direction?: string;
	[key: string]: any;
};
/**
 * A header value as stored by an `OutgoingRequest`.
 *
 * NOTE: It is not just `string` because `Max-Forwards` is stored as the
 * `JsSIP_C.MAX_FORWARDS` number.
 */
export type OutgoingHeaderValue = string | number;
/**
 * A header entry as stored by an `IncomingMessage`.
 */
export type IncomingHeader = {
	raw: string;
	parsed?: Grammar.Grammar;
};
/**
 * Parameters that take priority over the `ua.configuration` ones.
 */
export type OutgoingRequestParams = {
	cseq?: number;
	call_id?: string;
	from_uri?: URI;
	from_tag?: string;
	from_display_name?: string;
	to_uri?: URI;
	to_tag?: string;
	to_display_name?: string;
	route_set?: OutgoingHeaderValue[];
};
/**
 * The client transaction an outgoing INVITE is bound to.
 *
 * TODO: Replace with `import type { InviteClientTransaction } from
 * './Transactions'` once `Transactions` is ported to TypeScript.
 */
export interface ClientTransactionLike {
	cancel(reason?: string): void;
}
/**
 * The server transaction an incoming request is bound to.
 *
 * TODO: Replace with the server transaction types from './Transactions' once
 * that module is ported to TypeScript.
 */
export interface ServerTransactionLike extends EventEmitter {
	state: number;
	receiveResponse(
		code: number,
		response: string,
		onSuccess?: () => void,
		onFailure?: () => void
	): void;
}
/**
 * The `UA` surface SIP messages depend on.
 *
 * TODO: Replace with `import type { UA } from './UA'` once `UA` is ported to
 * TypeScript. Note that `UA.d.ts` currently declares neither `configuration`
 * nor `transport`, even though `UA` exposes both as public getters, so that
 * gap must be closed first.
 *
 * TODO: The `configuration` shape below is `Config.Configuration` plus the
 * `jssip_id` that `UA` adds, so it can only be replaced once `UA` is ported.
 * Note it is not the `UAConfiguration` input type declared in `UA.d.ts`.
 */
export interface UALike {
	readonly configuration: {
		uri: URI;
		display_name?: string | null;
		jssip_id: string;
		session_timers?: boolean;
		use_preloaded_route?: boolean;
		user_agent?: string | null;
		extra_headers?: string[] | null;
	};
	readonly contact: {
		pub_gruu?: string | null;
		temp_gruu?: string | null;
	};
	readonly transport: Transport;
}
/**
 * -param {String} method request method
 * -param {String} ruri request uri
 * -param {UA} ua
 * -param {Object} params parameters that will have priority over ua.configuration parameters:
 * <br>
 *  - cseq, call_id, from_tag, from_uri, from_display_name, to_uri, to_tag, route_set
 * -param {Object} [headers] extra headers
 * -param {String} [body]
 */
export declare class OutgoingRequest {
	ua: UALike;
	headers: Record<string, OutgoingHeaderValue[]>;
	method: string;
	ruri: URI;
	body?: string;
	extraHeaders: string[];
	to: NameAddrHeader;
	from: NameAddrHeader;
	call_id: string;
	cseq: number;
	sdp?: SDP;
	transaction?: ClientTransactionLike | null;
	constructor(
		method: string,
		ruri: URI,
		ua: UALike,
		params?: OutgoingRequestParams | null,
		extraHeaders?: string[] | null,
		body?: string
	);
	/**
	 * Replace the the given header by the given value.
	 * -param {String} name header name
	 * -param {String | Array} value header value
	 */
	setHeader(
		name: string,
		value: OutgoingHeaderValue | OutgoingHeaderValue[]
	): void;
	/**
	 * Get the value of the given header name at the given position.
	 * -param {String} name header name
	 * -returns {String|undefined} Returns the specified header, null if header doesn't exist.
	 */
	getHeader(name: string): OutgoingHeaderValue | undefined;
	/**
	 * Get the header/s of the given name.
	 * -param {String} name header name
	 * -returns {Array} Array with all the headers of the specified name.
	 */
	getHeaders(name: string): OutgoingHeaderValue[];
	/**
	 * Verify the existence of the given header.
	 * -param {String} name header name
	 * -returns {boolean} true if header with given name exists, false otherwise
	 */
	hasHeader(name: string): boolean;
	/**
	 * Parse the current body as a SDP and store the resulting object
	 * into this.sdp.
	 * -param {Boolean} force: Parse even if this.sdp already exists.
	 *
	 * Returns this.sdp.
	 */
	parseSDP(force?: boolean): SDP;
	toString(): string;
	clone(): OutgoingRequest;
}
export declare class InitialOutgoingInviteRequest extends OutgoingRequest {
	transaction: ClientTransactionLike | null;
	constructor(
		ruri: URI,
		ua: UALike,
		params?: OutgoingRequestParams | null,
		extraHeaders?: string[] | null,
		body?: string
	);
	cancel(reason?: string): void;
	clone(): InitialOutgoingInviteRequest;
}
export type IncomingHeaders = Record<string, IncomingHeader[]>;
/**
 * Everything needed to build an `IncomingMessage`.
 */
export type IncomingMessageParams = {
	data: string;
	headers: IncomingHeaders;
	method: string;
	via?: Grammar.ViaHeader;
	via_branch?: string;
	call_id?: string;
	cseq?: number;
	from: NameAddrHeader;
	from_tag?: string | null;
	to: NameAddrHeader;
	to_tag?: string | null;
	body: string;
	session_expires?: number;
	session_expires_refresher?: string;
	refer_to?: Grammar.ReferToHeader;
	replaces?: Grammar.ReplacesHeader;
	event?: Grammar.EventHeader;
};
export type IncomingRequestParams = IncomingMessageParams & {
	ua: UALike;
	ruri: URI;
};
export type IncomingResponseParams = IncomingMessageParams & {
	status_code: number;
	reason_phrase: string;
};
export declare class IncomingMessage {
	/**
	 * Insert a header of the given name and value into the last position of the
	 * given header store.
	 */
	static addHeader(headers: IncomingHeaders, name: string, value: string): void;
	/**
	 * Replace the value of the given header by the value.
	 */
	static setHeader(headers: IncomingHeaders, name: string, value: string): void;
	/**
	 * Get the value of the given header name at the first position, or undefined
	 * if the header field is not present.
	 */
	static getHeader(headers: IncomingHeaders, name: string): string | undefined;
	/**
	 * Get the header/s of the given name.
	 */
	static getHeaders(headers: IncomingHeaders, name: string): string[];
	/**
	 * Verify the existence of the given header.
	 */
	static hasHeader(headers: IncomingHeaders, name: string): boolean;
	/**
	 * Parse the given header on the given index, caching the result.
	 */
	/**
	 * Parse the given header on the given index, caching the result. Returns
	 * undefined if the header field is not present or cannot be parsed.
	 */
	static parseHeader<T = unknown>(
		headers: IncomingHeaders,
		name: string,
		idx?: number
	): T | undefined;
	data: string;
	method: string;
	via?: Grammar.ViaHeader;
	via_branch?: string;
	call_id?: string;
	cseq?: number;
	from: NameAddrHeader;
	from_tag?: string | null;
	to: NameAddrHeader;
	to_tag?: string | null;
	body: string;
	sdp: SDP | null;
	session_expires?: number;
	session_expires_refresher?: string;
	refer_to?: Grammar.ReferToHeader;
	replaces?: Grammar.ReplacesHeader;
	event?: Grammar.EventHeader;
	constructor({
		data,
		headers,
		method,
		via,
		via_branch,
		call_id,
		cseq,
		from,
		from_tag,
		to,
		to_tag,
		body,
		session_expires,
		session_expires_refresher,
		refer_to,
		replaces,
		event,
	}?: IncomingMessageParams);
	/**
	 * Insert a header of the given name and value into the last position of the
	 * header array.
	 */
	addHeader(name: string, value: string): void;
	/**
	 * Get the value of the given header name at the given position.
	 */
	getHeader(name: string): string;
	/**
	 * Get the header/s of the given name.
	 */
	getHeaders(name: string): string[];
	/**
	 * Verify the existence of the given header.
	 */
	hasHeader(name: string): boolean;
	/**
	 * Parse the given header on the given index.
	 * -param {String} name header name
	 * -param {Number} [idx=0] header index
	 * -returns {Object|undefined} Parsed header object, undefined if the header
	 *  is not present or in case of a parsing error.
	 */
	parseHeader<T = unknown>(name: string, idx?: number): T;
	/**
	 * Message Header attribute selector. Alias of parseHeader.
	 * -param {String} name header name
	 * -param {Number} [idx=0] header index
	 * -returns {Object|undefined} Parsed header object, undefined if the header
	 *  is not present or in case of a parsing error.
	 *
	 * -example
	 * message.s('via',3).port
	 */
	s<T = unknown>(name: string, idx?: number): T | undefined;
	/**
	 * Replace the value of the given header by the value.
	 * -param {String} name header name
	 * -param {String} value header value
	 */
	setHeader(name: string, value: string): void;
	/**
	 * Parse the current body as a SDP and store the resulting object
	 * into this.sdp.
	 * -param {Boolean} force: Parse even if this.sdp already exists.
	 *
	 * Returns this.sdp.
	 */
	parseSDP(force?: boolean): SDP;
	toString(): string;
}
export declare class IncomingRequest extends IncomingMessage {
	ua: UALike;
	ruri: URI;
	transport: Transport | null;
	server_transaction: ServerTransactionLike | null;
	constructor();
	constructor(params: IncomingRequestParams);
	constructor(ua: UALike);
	/**
	 * Stateful reply.
	 * -param {Number} code status code
	 * -param {String} reason reason phrase
	 * -param {Object} headers extra headers
	 * -param {String} body body
	 * -param {Function} [onSuccess] onSuccess callback
	 * -param {Function} [onFailure] onFailure callback
	 */
	reply(
		code: number,
		reason?: string | null,
		extraHeaders?: string[] | null,
		body?: string | null,
		onSuccess?: () => void,
		onFailure?: () => void
	): void;
	/**
	 * Stateless reply.
	 * -param {Number} code status code
	 * -param {String} reason reason phrase
	 */
	reply_sl(code?: number | null, reason?: string | null): void;
}
export declare class IncomingResponse extends IncomingMessage {
	status_code: number;
	reason_phrase: string;
	constructor({
		status_code,
		reason_phrase,
		...params
	}?: IncomingResponseParams);
}
