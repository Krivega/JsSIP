import './include/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RTCSession = require('../RTCSession.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RTCSessionInfo = require('../RTCSession/Info.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Dialog = require('../Dialog.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Timers = require('../Timers.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const URI = require('../URI.js');

type TSessionErrorHook =
	| 'onDialogError'
	| 'onRequestTimeout'
	| 'onTransportError';

type TResponseFixture = {
	reason_phrase: string;
	status_code: number;
};

type TInfoEventHandlers = {
	onDialogError: () => void;
	onErrorResponse: (response: TResponseFixture) => void;
	onRequestTimeout: () => void;
	onSuccessResponse: (response: TResponseFixture) => void;
	onTransportError: () => void;
};

type TSendRequestOptions = {
	eventHandlers: TInfoEventHandlers;
};

type TSessionFixture = {
	C: Record<string, number>;
	newInfo: jest.Mock;
	onDialogError: jest.Mock;
	onRequestTimeout: jest.Mock;
	onTransportError: jest.Mock;
	sendRequest: jest.Mock;
	status: number;
};

type TInfo = {
	on: (event: string, listener: (data: unknown) => void) => void;
	send: (
		contentType: string,
		body?: string,
		options?: { extraHeaders?: string[]; noTerminateWhenError?: boolean }
	) => Promise<void>;
};

type TClientTransaction = {
	receiveResponse: (response: { method: string; status_code: number }) => void;
	request: { method: string };
};

type TIntegrationFixture = {
	session: {
		C: Record<string, number>;
		on: (event: string, listener: () => void) => void;
		sendInfo: (
			contentType: string,
			body?: string,
			options?: { noTerminateWhenError?: boolean }
		) => Promise<void>;
		status: number;
	};
	transactions: TClientTransaction[];
	transportSend: jest.Mock;
};

const CONTENT_TYPE = 'application/vinteo.mic.state';
const BODY = 'state=muted';

const ERROR_CASES: {
	handler: TSessionErrorHook;
	message: string;
}[] = [
	{ handler: 'onTransportError', message: 'Transport response' },
	{ handler: 'onRequestTimeout', message: 'Request timeout' },
	{ handler: 'onDialogError', message: 'Dialog error' },
];

const createSessionFixture = (): {
	getEventHandlers: () => TInfoEventHandlers;
	session: TSessionFixture;
} => {
	let eventHandlers: TInfoEventHandlers | undefined;
	const session: TSessionFixture = {
		C: RTCSession.C,
		newInfo: jest.fn(),
		onDialogError: jest.fn(),
		onRequestTimeout: jest.fn(),
		onTransportError: jest.fn(),
		sendRequest: jest.fn((_method: string, options: TSendRequestOptions) => {
			eventHandlers = options.eventHandlers;
		}),
		status: RTCSession.C.STATUS_CONFIRMED,
	};

	return {
		getEventHandlers: () => {
			if (!eventHandlers) {
				throw new Error('INFO request was not sent');
			}

			return eventHandlers;
		},
		session,
	};
};

const getRejection = async (promise: Promise<unknown>): Promise<unknown> =>
	promise.then(
		() => {
			throw new Error('Promise resolved unexpectedly');
		},
		(error: unknown) => error
	);

const createIntegrationFixture = (
	transportSendResult: boolean
): TIntegrationFixture => {
	const transactions: TClientTransaction[] = [];
	const transportSend = jest.fn().mockReturnValue(transportSendResult);
	const ua = {
		C: { STATUS_USER_CLOSED: 2 },
		_configuration: { authorization_jwt: null },
		configuration: {
			display_name: null,
			extra_headers: [],
			jssip_id: 'test-',
			session_timers: false,
			session_timers_refresh_method: 'UPDATE',
			uri: URI.parse('sip:local@example.com'),
			use_preloaded_route: false,
			via_host: 'test.invalid',
		},
		destroyDialog: jest.fn(),
		destroyRTCSession: jest.fn(),
		destroyTransaction: jest.fn(),
		newDialog: jest.fn(),
		newTransaction: jest.fn((transaction: TClientTransaction) => {
			transactions.push(transaction);
		}),
		status: 0,
		transport: {
			send: transportSend,
			sip_uri: 'sip:localhost:12345;transport=ws',
			via_transport: 'WS',
		},
	};
	const message = {
		call_id: 'call-id',
		cseq: 1,
		from_tag: 'local-tag',
		getHeaders: () => [],
		hasHeader: () => true,
		parseHeader: (header: string) => ({
			uri: URI.parse(`sip:${header}@example.com`),
		}),
		to_tag: 'remote-tag',
	};
	const session = new RTCSession(ua);

	session._direction = 'outgoing';
	session._status = RTCSession.C.STATUS_CONFIRMED;
	session._dialog = new Dialog(session, message, 'UAC');

	return { session, transactions, transportSend };
};

const getInfoTransaction = (
	transactions: TClientTransaction[]
): TClientTransaction => {
	const transaction = transactions.find(
		({ request }) => request.method === 'INFO'
	);

	if (!transaction) {
		throw new Error('INFO transaction was not created');
	}

	return transaction;
};

describe('RTCSession Info.send', () => {
	let session: TSessionFixture;
	let getEventHandlers: () => TInfoEventHandlers;
	let info: TInfo;

	beforeEach(() => {
		({ getEventHandlers, session } = createSessionFixture());
		info = new RTCSessionInfo(session);
	});

	describe.each(ERROR_CASES)('$handler', ({ handler, message }) => {
		it(`does not call session.${handler} when noTerminateWhenError is true`, async () => {
			const result = info.send(CONTENT_TYPE, BODY, {
				noTerminateWhenError: true,
			});

			getEventHandlers()[handler]();
			await getRejection(result);

			expect(session[handler]).not.toHaveBeenCalled();
		});

		it(`rejects with Error "${message}" when noTerminateWhenError is true`, async () => {
			const result = info.send(CONTENT_TYPE, BODY, {
				noTerminateWhenError: true,
			});

			getEventHandlers()[handler]();
			const error = await getRejection(result);

			expect(error).toBeInstanceOf(Error);
			expect(error).toHaveProperty('message', message);
		});

		it(`calls session.${handler} when noTerminateWhenError is not set`, async () => {
			const result = info.send(CONTENT_TYPE, BODY);

			getEventHandlers()[handler]();
			await getRejection(result);

			expect(session[handler]).toHaveBeenCalledTimes(1);
		});

		it(`rejects with Error "${message}" when noTerminateWhenError is not set`, async () => {
			const result = info.send(CONTENT_TYPE, BODY);

			getEventHandlers()[handler]();
			const error = await getRejection(result);

			expect(error).toBeInstanceOf(Error);
			expect(error).toHaveProperty('message', message);
		});
	});

	describe('onErrorResponse', () => {
		const declineResponse = { reason_phrase: 'Decline', status_code: 603 };
		const serverErrorResponse = {
			reason_phrase: 'Server Internal Error',
			status_code: 500,
		};

		it('rejects with Error "Error decline with 603" when the response is 603 Decline', async () => {
			const result = info.send(CONTENT_TYPE, BODY, {
				noTerminateWhenError: true,
			});

			getEventHandlers().onErrorResponse(declineResponse);
			const error = await getRejection(result);

			expect(error).toBeInstanceOf(Error);
			expect(error).toHaveProperty('message', 'Error decline with 603');
		});

		it('rejects with Error "Error response" when the response is not 603', async () => {
			const result = info.send(CONTENT_TYPE, BODY, {
				noTerminateWhenError: true,
			});

			getEventHandlers().onErrorResponse(serverErrorResponse);
			const error = await getRejection(result);

			expect(error).toBeInstanceOf(Error);
			expect(error).toHaveProperty('message', 'Error response');
		});

		it('emits "failed" with the remote response when an error response is received', async () => {
			const failed = jest.fn();

			info.on('failed', failed);
			const result = info.send(CONTENT_TYPE, BODY);

			getEventHandlers().onErrorResponse(declineResponse);
			await getRejection(result);

			expect(failed).toHaveBeenCalledWith({
				originator: 'remote',
				response: declineResponse,
			});
		});
	});

	describe('onSuccessResponse', () => {
		const okResponse = { reason_phrase: 'OK', status_code: 200 };

		it('resolves when a success response is received', async () => {
			const result = info.send(CONTENT_TYPE, BODY, {
				noTerminateWhenError: true,
			});

			getEventHandlers().onSuccessResponse(okResponse);

			await expect(result).resolves.toBeUndefined();
		});

		it('emits "succeeded" with the remote response when a success response is received', async () => {
			const succeeded = jest.fn();

			info.on('succeeded', succeeded);
			const result = info.send(CONTENT_TYPE, BODY);

			getEventHandlers().onSuccessResponse(okResponse);
			await result;

			expect(succeeded).toHaveBeenCalledWith({
				originator: 'remote',
				response: okResponse,
			});
		});
	});
});

describe('RTCSession.sendInfo through the dialog transaction layer', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	describe('transport send fails', () => {
		it('keeps the session confirmed when noTerminateWhenError is true', async () => {
			const { session } = createIntegrationFixture(false);

			await getRejection(
				session.sendInfo(CONTENT_TYPE, BODY, { noTerminateWhenError: true })
			);

			expect(session.status).toBe(RTCSession.C.STATUS_CONFIRMED);
		});

		it('does not send BYE when noTerminateWhenError is true', async () => {
			const { session, transportSend } = createIntegrationFixture(false);

			await getRejection(
				session.sendInfo(CONTENT_TYPE, BODY, { noTerminateWhenError: true })
			);

			expect(transportSend).toHaveBeenCalledTimes(1);
			expect(transportSend.mock.calls[0]?.[0]).toHaveProperty('method', 'INFO');
		});

		it('does not emit "ended" when noTerminateWhenError is true', async () => {
			const { session } = createIntegrationFixture(false);
			const ended = jest.fn();

			session.on('ended', ended);
			await getRejection(
				session.sendInfo(CONTENT_TYPE, BODY, { noTerminateWhenError: true })
			);

			expect(ended).not.toHaveBeenCalled();
		});

		it('rejects with Error "Transport response" when noTerminateWhenError is true', async () => {
			const { session } = createIntegrationFixture(false);

			const error = await getRejection(
				session.sendInfo(CONTENT_TYPE, BODY, { noTerminateWhenError: true })
			);

			expect(error).toBeInstanceOf(Error);
			expect(error).toHaveProperty('message', 'Transport response');
		});

		it('terminates the session when noTerminateWhenError is not set', async () => {
			const { session } = createIntegrationFixture(false);
			const ended = jest.fn();

			session.on('ended', ended);
			await getRejection(session.sendInfo(CONTENT_TYPE, BODY));

			expect(session.status).toBe(RTCSession.C.STATUS_TERMINATED);
			expect(ended).toHaveBeenCalledTimes(1);
		});
	});

	describe('Timer F expires', () => {
		it('keeps the session confirmed when noTerminateWhenError is true', async () => {
			const { session } = createIntegrationFixture(true);

			const result = getRejection(
				session.sendInfo(CONTENT_TYPE, BODY, { noTerminateWhenError: true })
			);

			await jest.advanceTimersByTimeAsync(Timers.TIMER_F);
			await result;

			expect(session.status).toBe(RTCSession.C.STATUS_CONFIRMED);
		});

		it('rejects with Error "Request timeout" when noTerminateWhenError is true', async () => {
			const { session } = createIntegrationFixture(true);

			const result = getRejection(
				session.sendInfo(CONTENT_TYPE, BODY, { noTerminateWhenError: true })
			);

			await jest.advanceTimersByTimeAsync(Timers.TIMER_F);
			const error = await result;

			expect(error).toBeInstanceOf(Error);
			expect(error).toHaveProperty('message', 'Request timeout');
		});

		it('terminates the session when noTerminateWhenError is not set', async () => {
			const { session } = createIntegrationFixture(true);

			const result = getRejection(session.sendInfo(CONTENT_TYPE, BODY));

			await jest.advanceTimersByTimeAsync(Timers.TIMER_F);
			await result;

			expect(session.status).toBe(RTCSession.C.STATUS_TERMINATED);
		});
	});

	describe('dialog error response 481', () => {
		it('keeps the session confirmed when noTerminateWhenError is true', async () => {
			const { session, transactions } = createIntegrationFixture(true);

			const result = getRejection(
				session.sendInfo(CONTENT_TYPE, BODY, { noTerminateWhenError: true })
			);

			getInfoTransaction(transactions).receiveResponse({
				method: 'INFO',
				status_code: 481,
			});
			await result;

			expect(session.status).toBe(RTCSession.C.STATUS_CONFIRMED);
		});

		it('rejects with Error "Dialog error" when noTerminateWhenError is true', async () => {
			const { session, transactions } = createIntegrationFixture(true);

			const result = getRejection(
				session.sendInfo(CONTENT_TYPE, BODY, { noTerminateWhenError: true })
			);

			getInfoTransaction(transactions).receiveResponse({
				method: 'INFO',
				status_code: 481,
			});
			const error = await result;

			expect(error).toBeInstanceOf(Error);
			expect(error).toHaveProperty('message', 'Dialog error');
		});

		it('terminates the session when noTerminateWhenError is not set', async () => {
			const { session, transactions } = createIntegrationFixture(true);

			const result = getRejection(session.sendInfo(CONTENT_TYPE, BODY));

			getInfoTransaction(transactions).receiveResponse({
				method: 'INFO',
				status_code: 481,
			});
			await result;

			expect(session.status).toBe(RTCSession.C.STATUS_TERMINATED);
		});
	});
});
