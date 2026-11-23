import './include/common';

import {
	IncomingMessage,
	IncomingRequest,
	IncomingResponse,
} from '../SIPMessage';
import type { UALike } from '../SIPMessage';
import URI = require('../URI');
import NameAddrHeader = require('../NameAddrHeader');

describe('8.x empty message construction', () => {
	it.each([IncomingMessage, IncomingRequest, IncomingResponse])(
		'creates an empty %p and permits adding headers afterwards',
		Message => {
			const message = new Message();

			expect(message.body).toBeNull();
			expect(message.getHeader('Reason')).toBeUndefined();
			message.addHeader('Reason', 'SIP;cause=200');
			expect(message.getHeader('Reason')).toBe('SIP;cause=200');
			message.body = 'locally generated error';
			expect(message.body).toBe('locally generated error');
		}
	);

	it('accepts the legacy UA argument when constructing an incoming request', () => {
		const ua = {} as UALike;
		const request = new IncomingRequest(ua);

		expect(request.ua).toBe(ua);
		expect(request.ruri).toBeNull();
	});

	it('keeps empty message header stores independent', () => {
		const first = new IncomingResponse();
		const second = new IncomingResponse();

		first.addHeader('Reason', 'SIP;cause=200');
		expect(second.hasHeader('Reason')).toBe(false);
	});
});

describe('8.x identity serialization', () => {
	it('preserves URI fields used by existing consumers', () => {
		const uri = new URI('sip', 'alice', 'example.com');

		expect({ ...uri }).toEqual({
			_scheme: 'sip',
			_user: 'alice',
			_host: 'example.com',
			_port: undefined,
			_parameters: {},
			_headers: {},
		});
	});

	it('preserves name-address fields used by existing consumers', () => {
		const uri = new URI('sip', 'alice', 'example.com');
		const identity = new NameAddrHeader(uri, 'Alice');

		expect({ ...identity }).toEqual({
			_uri: uri,
			_display_name: 'Alice',
			_parameters: {},
		});
	});
});
