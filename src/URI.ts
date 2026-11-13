import { SIP } from './Constants';
import { escapeUser, headerize } from './Utils';
import * as Grammar from './Grammar';

/**
 * -param {String} [scheme]
 * -param {String} [user]
 * -param {String} host
 * -param {String} [port]
 * -param {Object} [parameters]
 * -param {Object} [headers]
 *
 */
class URI {
	/**
	 * Parse the given string and returns a JsSIP.URI instance or undefined if
	 * it is an invalid URI.
	 */
	static parse(uri: string): URI | undefined {
		const parsed = Grammar.parse(uri, 'SIP_URI') as URI | -1;

		if (parsed !== -1) {
			return parsed;
		} else {
			return undefined;
		}
	}

	private _scheme: string;
	private _user?: string;
	private _host: string;
	private _port?: number | null;
	private _parameters: URI.Parameters;
	private _headers: URI.Headers;

	constructor(
		scheme: URI.URIScheme | undefined,
		user: string | undefined,
		host: string,
		port?: number | null,
		parameters: URI.Parameters = {},
		headers: URI.Headers = {}
	) {
		// Checks.
		if (!host) {
			throw new TypeError('missing or invalid "host" parameter');
		}

		// Initialize parameters.
		this._parameters = {};
		this._headers = {};

		this._scheme = scheme || SIP;
		this._user = user;
		this._host = host;
		this._port = port;

		for (const param in parameters) {
			if (Object.prototype.hasOwnProperty.call(parameters, param)) {
				this.setParam(param, parameters[param]);
			}
		}

		for (const header in headers) {
			if (Object.prototype.hasOwnProperty.call(headers, header)) {
				this.setHeader(header, headers[header]!);
			}
		}
	}

	get scheme(): string {
		return this._scheme;
	}

	set scheme(value: string) {
		this._scheme = value.toLowerCase();
	}

	get user(): string | undefined {
		return this._user;
	}

	set user(value: string | undefined) {
		this._user = value;
	}

	get host(): string {
		return this._host;
	}

	set host(value: string) {
		this._host = value.toLowerCase();
	}

	get port(): number | null | undefined {
		return this._port;
	}

	set port(value: number | string | null | undefined) {
		this._port = value === 0 ? value : parseInt(String(value), 10) || null;
	}

	setParam(key: string, value?: string | number | null): void {
		if (key) {
			this._parameters[key.toLowerCase()] =
				typeof value === 'undefined' || value === null
					? null
					: value.toString();
		}
	}

	getParam(key: string): string | null | undefined {
		if (key) {
			return this._parameters[key.toLowerCase()];
		}

		return undefined;
	}

	hasParam(key: string): boolean | undefined {
		if (key) {
			return (
				(Object.prototype.hasOwnProperty.call(
					this._parameters,
					key.toLowerCase()
				) &&
					true) ||
				false
			);
		}

		return undefined;
	}

	deleteParam(parameter: string): string | null | undefined {
		parameter = parameter.toLowerCase();
		if (Object.prototype.hasOwnProperty.call(this._parameters, parameter)) {
			const value = this._parameters[parameter];

			delete this._parameters[parameter];

			return value;
		}

		return undefined;
	}

	clearParams(): void {
		this._parameters = {};
	}

	setHeader(name: string, value: string | string[]): void {
		this._headers[headerize(name)] = Array.isArray(value) ? value : [value];
	}

	getHeader(name: string): string[] | undefined {
		if (name) {
			return this._headers[headerize(name)];
		}

		return undefined;
	}

	hasHeader(name: string): boolean | undefined {
		if (name) {
			return (
				(Object.prototype.hasOwnProperty.call(this._headers, headerize(name)) &&
					true) ||
				false
			);
		}

		return undefined;
	}

	deleteHeader(header: string): string[] | undefined {
		header = headerize(header);
		if (Object.prototype.hasOwnProperty.call(this._headers, header)) {
			const value = this._headers[header];

			delete this._headers[header];

			return value;
		}

		return undefined;
	}

	clearHeaders(): void {
		this._headers = {};
	}

	clone(): URI {
		return new URI(
			this._scheme,
			this._user,
			this._host,
			this._port,
			JSON.parse(JSON.stringify(this._parameters)) as URI.Parameters,
			JSON.parse(JSON.stringify(this._headers)) as URI.Headers
		);
	}

	toString(): string {
		const headers = [];

		let uri = `${this._scheme}:`;

		if (this._user) {
			uri += `${escapeUser(this._user)}@`;
		}
		uri += this._host;
		if (this._port || this._port === 0) {
			uri += `:${this._port}`;
		}

		for (const parameter in this._parameters) {
			if (Object.prototype.hasOwnProperty.call(this._parameters, parameter)) {
				uri += `;${parameter}`;

				if (this._parameters[parameter] !== null) {
					uri += `=${this._parameters[parameter]}`;
				}
			}
		}

		for (const header in this._headers) {
			if (Object.prototype.hasOwnProperty.call(this._headers, header)) {
				for (const item of this._headers[header] ?? []) {
					headers.push(`${header}=${item}`);
				}
			}
		}

		if (headers.length > 0) {
			uri += `?${headers.join('&')}`;
		}

		return uri;
	}

	toAor(show_port?: boolean): string {
		let aor = `${this._scheme}:`;

		if (this._user) {
			aor += `${escapeUser(this._user)}@`;
		}
		aor += this._host;
		if (show_port && (this._port || this._port === 0)) {
			aor += `:${this._port}`;
		}

		return aor;
	}
}

// NOTE: `URI` is exported with `export =` because the pegjs generated
// `Grammar.js` does `var URI = require('./URI')` and then `new URI(...)`.
// Types that used to be named exports of this module are merged into the
// `URI` namespace so that they remain reachable.
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace URI {
	type URIScheme = 'sip' | string;

	type Parameters = Record<string, string | null>;

	type Headers = Record<string, string[]>;
}

export = URI;
