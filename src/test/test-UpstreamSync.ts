import './include/common';

import { RequestSender } from '../RequestSender';
import type { RequestSenderUA } from '../RequestSender';
import type { OutgoingRequest } from '../SIPMessage';
import type { Socket } from '../Socket';
import * as Timers from '../Timers';
import { Transport } from '../Transport';
import { WebSocketInterface } from '../WebSocketInterface';

describe('upstream migration preserves fork behavior', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	it.each([
		{ timeout: 125, expected: 125 },
		{ timeout: -1, expected: Timers.TIMER_F },
		{ timeout: 0, expected: Timers.TIMER_F },
		{ timeout: Number.NaN, expected: Timers.TIMER_F },
		{ timeout: Number.POSITIVE_INFINITY, expected: Timers.TIMER_F },
	])(
		'expires OPTIONS at $expected ms for timeout $timeout',
		({ timeout, expected }) => {
			const ua = {
				C: { STATUS_USER_CLOSED: 2 },
				status: 0,
				configuration: { via_host: 'example.com' },
				transport: { via_transport: 'WS', send: jest.fn(() => true) },
				newTransaction: jest.fn(),
				destroyTransaction: jest.fn(),
			} as unknown as RequestSenderUA;
			const request = {
				method: 'OPTIONS',
				setHeader: jest.fn(),
			} as unknown as OutgoingRequest;
			const onRequestTimeout = jest.fn();
			const sender = new RequestSender(ua, request, {
				requestTimeout: timeout,
				onRequestTimeout,
			});

			sender.send();
			jest.advanceTimersByTime(expected - 1);
			expect(onRequestTimeout).not.toHaveBeenCalled();
			jest.advanceTimersByTime(1);
			expect(onRequestTimeout).toHaveBeenCalledTimes(1);
			expect(ua.destroyTransaction).toHaveBeenCalledWith(
				sender.clientTransaction
			);
		}
	);

	it('reports socket errors and reconnects, then ignores errors after disconnect', () => {
		const socket: Socket = {
			url: 'wss://example.com',
			sip_uri: 'sip:example.com;transport=ws',
			via_transport: 'WSS',
			connect: jest.fn(),
			disconnect: jest.fn(),
			send: jest.fn(() => true),
			isConnected: () => false,
			isConnecting: () => false,
			onconnect: jest.fn(),
			ondisconnect: jest.fn(),
			ondata: jest.fn(),
		};
		const transport = new Transport(
			{ socket },
			{ min_interval: 1, max_interval: 1 }
		);

		transport.onconnecting = jest.fn();
		transport.ondisconnect = jest.fn();
		transport.connect();
		socket.onerror?.(1006, 'connection failed');
		expect(transport.ondisconnect).toHaveBeenCalledWith({
			socket,
			error: true,
			code: 1006,
			reason: 'connection failed',
		});
		jest.advanceTimersByTime(1000);
		expect(socket.connect).toHaveBeenCalledTimes(2);
		transport.disconnect();
		socket.onerror?.(1006, 'late error');
		jest.advanceTimersByTime(1000);
		expect(socket.connect).toHaveBeenCalledTimes(2);
		expect(transport.ondisconnect).toHaveBeenCalledTimes(2);
	});

	it('forwards WebSocket errors through the socket error callback', () => {
		const originalWebSocket = globalThis.WebSocket;
		let connection: {
			onerror?: (error: { code: number; message: string }) => void;
		};

		globalThis.WebSocket = jest.fn().mockImplementation(() => {
			connection = {};

			return connection;
		}) as unknown as typeof WebSocket;

		try {
			const socket = new WebSocketInterface('wss://example.com');

			socket.onerror = jest.fn();
			socket.connect();
			connection!.onerror?.({ code: 1006, message: 'connection failed' });
			expect(socket.onerror).toHaveBeenCalledWith(1006, 'connection failed');
		} finally {
			globalThis.WebSocket = originalWebSocket;
		}
	});
});
