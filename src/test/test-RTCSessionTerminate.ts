import './include/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RTCSession = require('../RTCSession.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Dialog = require('../Dialog.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Parser = require('../Parser');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Timers = require('../Timers');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Transactions = require('../Transactions');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const URI = require('../URI');

type THandlerName =
	| 'onDialogError'
	| 'onErrorResponse'
	| 'onRequestTimeout'
	| 'onSuccessResponse'
	| 'onTransportError';

type TByeEventHandlers = Record<THandlerName, jest.Mock>;

type TOutgoingRequest = {
	call_id: string;
	cseq: number;
	getHeader: (name: string) => string | undefined;
	method: string;
};

type TTransaction = {
	receiveResponse: (response: unknown) => void;
	request: TOutgoingRequest;
};

type TTerminateOptions = {
	byeEventHandlers?: Partial<TByeEventHandlers>;
};

type TSession = {
	on: (event: string, listener: () => void) => void;
	status: number;
	terminate: (options?: TTerminateOptions) => void;
	terminateAsync: (options?: TTerminateOptions) => Promise<void>;
};

type TFixture = {
	getByeTransactions: () => TTransaction[];
	respond: (
		transaction: TTransaction,
		statusCode: number,
		extraHeaders?: string[]
	) => void;
	session: TSession;
};

type TIncomingFixture = TFixture & {
	receiveAck: () => void;
};

const REASON_PHRASES: Record<number, string> = {
	100: 'Trying',
	200: 'OK',
	401: 'Unauthorized',
	407: 'Proxy Authentication Required',
	408: 'Request Timeout',
	481: 'Call/Transaction Does Not Exist',
	500: 'Server Internal Error',
	503: 'Service Unavailable',
};

const DIGEST_CHALLENGE =
	'Digest realm="example.com", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", qop="auth", algorithm=MD5';

const AUTH_CASES: {
	authorizationHeader: string;
	challengeHeader: string;
	statusCode: number;
}[] = [
	{
		authorizationHeader: 'authorization',
		challengeHeader: 'WWW-Authenticate',
		statusCode: 401,
	},
	{
		authorizationHeader: 'proxy-authorization',
		challengeHeader: 'Proxy-Authenticate',
		statusCode: 407,
	},
];

const RESPONSE_CASES: { handler: THandlerName; statusCode: number }[] = [
	{ handler: 'onErrorResponse', statusCode: 500 },
	{ handler: 'onErrorResponse', statusCode: 503 },
	{ handler: 'onDialogError', statusCode: 481 },
	{ handler: 'onRequestTimeout', statusCode: 408 },
];

const joinLines = (lines: string[]): string => [...lines, '', ''].join('\r\n');

const createByeEventHandlers = (): TByeEventHandlers => ({
	onDialogError: jest.fn(),
	onErrorResponse: jest.fn(),
	onRequestTimeout: jest.fn(),
	onSuccessResponse: jest.fn(),
	onTransportError: jest.fn(),
});

const getHandlerCalls = (
	handlers: TByeEventHandlers
): Partial<Record<THandlerName, number>> =>
	Object.fromEntries(
		Object.entries(handlers)
			.filter(([, handler]) => handler.mock.calls.length > 0)
			.map(([name, handler]) => [name, handler.mock.calls.length])
	);

const getTransaction = (
	transactions: TTransaction[],
	index: number
): TTransaction => {
	const transaction = transactions.at(index);

	if (!transaction) {
		throw new Error(`BYE transaction #${index} was not created`);
	}

	return transaction;
};

const createUa = (
	transportSendResult: boolean,
	password: string | null = 'secret'
): Omit<TFixture, 'session'> & {
	ua: object & { transport: object };
} => {
	const transactions: TTransaction[] = [];
	const configuration = {
		authorization_jwt: null,
		authorization_user: 'local',
		display_name: null,
		extra_headers: [],
		ha1: null,
		jssip_id: 'test-',
		password,
		realm: null,
		session_timers: false,
		session_timers_refresh_method: 'UPDATE',
		uri: URI.parse('sip:local@example.com'),
		use_preloaded_route: false,
		via_host: 'test.invalid',
	};
	const ua = {
		C: { STATUS_USER_CLOSED: 2 },
		configuration,
		contact: {},
		destroyDialog: jest.fn(),
		destroyRTCSession: jest.fn(),
		destroyTransaction: jest.fn(),
		newDialog: jest.fn(),
		newTransaction: jest.fn((transaction: TTransaction) => {
			transactions.push(transaction);
		}),
		set: jest.fn((parameter: string, value: unknown) => {
			Object.assign(configuration, { [parameter]: value });

			return true;
		}),
		status: 0,
		transport: {
			send: jest.fn().mockReturnValue(transportSendResult),
			sip_uri: 'sip:localhost:12345;transport=ws',
			via_transport: 'WS',
		},
	};

	return {
		getByeTransactions: () =>
			transactions.filter(({ request }) => request.method === 'BYE'),
		respond: (transaction, statusCode, extraHeaders = []) => {
			const { request } = transaction;

			transaction.receiveResponse(
				Parser.parseMessage(
					joinLines([
						`SIP/2.0 ${statusCode} ${REASON_PHRASES[statusCode]}`,
						`Via: ${request.getHeader('via')}`,
						`From: ${request.getHeader('from')}`,
						`To: ${request.getHeader('to')}`,
						`Call-ID: ${request.call_id}`,
						`CSeq: ${request.cseq} ${request.method}`,
						...extraHeaders,
						'Content-Length: 0',
					]),
					ua
				)
			);
		},
		ua,
	};
};

const createConfirmedFixture = (
	transportSendResult = true,
	password: string | null = 'secret'
): TFixture => {
	const { ua, ...fixture } = createUa(transportSendResult, password);
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

	return { ...fixture, session };
};

const createWaitingForAckFixture = (): TIncomingFixture => {
	const { ua, ...fixture } = createUa(true);
	const invite = Parser.parseMessage(
		joinLines([
			'INVITE sip:local@example.com SIP/2.0',
			'Via: SIP/2.0/WS remote.invalid;branch=z9hG4bKinvite',
			'Max-Forwards: 70',
			'To: <sip:local@example.com>',
			'From: <sip:remote@example.com>;tag=remote-tag',
			'Call-ID: incoming-call-id',
			'CSeq: 1 INVITE',
			'Contact: <sip:remote@remote.invalid;transport=ws>',
			'Content-Length: 0',
		]),
		ua
	);

	invite.to_tag = 'local-tag';
	invite.server_transaction = new Transactions.InviteServerTransaction(
		ua,
		ua.transport,
		invite
	);

	const session = new RTCSession(ua);
	const dialog = new Dialog(session, invite, 'UAS');

	session._direction = 'incoming';
	session._request = invite;
	session._dialog = dialog;
	invite.reply(200);
	session._status = RTCSession.C.STATUS_WAITING_FOR_ACK;

	return {
		...fixture,
		receiveAck: () => {
			dialog.receiveRequest(
				Parser.parseMessage(
					joinLines([
						'ACK sip:local@example.com SIP/2.0',
						'Via: SIP/2.0/WS remote.invalid;branch=z9hG4bKack',
						'Max-Forwards: 70',
						'To: <sip:local@example.com>;tag=local-tag',
						'From: <sip:remote@example.com>;tag=remote-tag',
						'Call-ID: incoming-call-id',
						'CSeq: 1 ACK',
						'Content-Length: 0',
					]),
					ua
				)
			);
		},
		session,
	};
};

describe('RTCSession.terminate byeEventHandlers', () => {
	let handlers: TByeEventHandlers;

	beforeEach(() => {
		jest.useFakeTimers();
		handlers = createByeEventHandlers();
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	describe('confirmed session', () => {
		let fixture: TFixture;

		beforeEach(() => {
			fixture = createConfirmedFixture();
		});

		it('sends a single BYE when byeEventHandlers are passed', () => {
			fixture.session.terminate({ byeEventHandlers: handlers });

			expect(fixture.getByeTransactions()).toHaveLength(1);
		});

		it('calls only onSuccessResponse once when the BYE gets 200', () => {
			fixture.session.terminate({ byeEventHandlers: handlers });
			fixture.respond(getTransaction(fixture.getByeTransactions(), 0), 200);

			expect(getHandlerCalls(handlers)).toEqual({ onSuccessResponse: 1 });
			expect(handlers.onSuccessResponse).toHaveBeenCalledWith(
				expect.objectContaining({ method: 'BYE', status_code: 200 })
			);
		});

		it('calls no handler when the BYE gets a provisional response', () => {
			fixture.session.terminate({ byeEventHandlers: handlers });
			fixture.respond(getTransaction(fixture.getByeTransactions(), 0), 100);

			expect(getHandlerCalls(handlers)).toEqual({});
		});

		it.each(RESPONSE_CASES)(
			'calls only $handler once when the BYE gets $statusCode',
			({ handler, statusCode }) => {
				fixture.session.terminate({ byeEventHandlers: handlers });
				fixture.respond(
					getTransaction(fixture.getByeTransactions(), 0),
					statusCode
				);

				expect(getHandlerCalls(handlers)).toEqual({ [handler]: 1 });
			}
		);

		it('calls only onRequestTimeout once when Timer F expires for the BYE', () => {
			fixture.session.terminate({ byeEventHandlers: handlers });
			jest.advanceTimersByTime(Timers.TIMER_F);

			expect(getHandlerCalls(handlers)).toEqual({ onRequestTimeout: 1 });
		});

		it('ignores missing handlers when the BYE gets an error response', () => {
			const onSuccessResponse = jest.fn();

			fixture.session.terminate({ byeEventHandlers: { onSuccessResponse } });

			expect(() => {
				fixture.respond(getTransaction(fixture.getByeTransactions(), 0), 500);
			}).not.toThrow();
			expect(onSuccessResponse).not.toHaveBeenCalled();
		});

		it('keeps the byeEventHandlers object unchanged when the BYE is sent', () => {
			const byeEventHandlers = { onSuccessResponse: jest.fn() };

			fixture.session.terminate({ byeEventHandlers });

			expect(Object.keys(byeEventHandlers)).toEqual(['onSuccessResponse']);
		});
	});

	describe('transport send fails', () => {
		it('calls only onTransportError once when the BYE cannot be sent', () => {
			const { session } = createConfirmedFixture(false);

			session.terminate({ byeEventHandlers: handlers });

			expect(getHandlerCalls(handlers)).toEqual({ onTransportError: 1 });
		});
	});

	describe.each(AUTH_CASES)(
		'BYE challenged with $statusCode',
		({ authorizationHeader, challengeHeader, statusCode }) => {
			let fixture: TFixture;

			beforeEach(() => {
				fixture = createConfirmedFixture();
				fixture.session.terminate({ byeEventHandlers: handlers });
				fixture.respond(
					getTransaction(fixture.getByeTransactions(), 0),
					statusCode,
					[`${challengeHeader}: ${DIGEST_CHALLENGE}`]
				);
			});

			it('resends the BYE with credentials and the next CSeq', () => {
				const [challenged, retried] = fixture.getByeTransactions();

				expect(fixture.getByeTransactions()).toHaveLength(2);
				expect(retried?.request.cseq).toBe((challenged?.request.cseq ?? 0) + 1);
				expect(retried?.request.getHeader(authorizationHeader)).toMatch(
					/^Digest .*username="local", realm="example.com"/
				);
			});

			it('calls no handler for the challenge', () => {
				expect(getHandlerCalls(handlers)).toEqual({});
			});

			it('calls only onSuccessResponse once when the resent BYE gets 200', () => {
				fixture.respond(getTransaction(fixture.getByeTransactions(), 1), 200);

				expect(getHandlerCalls(handlers)).toEqual({ onSuccessResponse: 1 });
				expect(handlers.onSuccessResponse).toHaveBeenCalledWith(
					expect.objectContaining({ status_code: 200 })
				);
			});

			it(`calls only onErrorResponse once when the resent BYE gets ${statusCode} again`, () => {
				fixture.respond(
					getTransaction(fixture.getByeTransactions(), 1),
					statusCode,
					[`${challengeHeader}: ${DIGEST_CHALLENGE}`]
				);

				expect(getHandlerCalls(handlers)).toEqual({ onErrorResponse: 1 });
				expect(handlers.onErrorResponse).toHaveBeenCalledWith(
					expect.objectContaining({ status_code: statusCode })
				);
			});
		}
	);

	describe.each(AUTH_CASES)(
		'BYE challenged with $statusCode without credentials',
		({ challengeHeader, statusCode }) => {
			let fixture: TFixture;

			beforeEach(() => {
				fixture = createConfirmedFixture(true, null);
				fixture.session.terminate({ byeEventHandlers: handlers });
				fixture.respond(
					getTransaction(fixture.getByeTransactions(), 0),
					statusCode,
					[`${challengeHeader}: ${DIGEST_CHALLENGE}`]
				);
			});

			it('does not resend the BYE', () => {
				expect(fixture.getByeTransactions()).toHaveLength(1);
			});

			it(`calls only onErrorResponse once with the ${statusCode} challenge`, () => {
				expect(getHandlerCalls(handlers)).toEqual({ onErrorResponse: 1 });
				expect(handlers.onErrorResponse).toHaveBeenCalledWith(
					expect.objectContaining({ status_code: statusCode })
				);
			});
		}
	);

	describe('incoming session waiting for ACK', () => {
		let fixture: TIncomingFixture;

		beforeEach(() => {
			fixture = createWaitingForAckFixture();
			fixture.session.terminate({ byeEventHandlers: handlers });
		});

		it('does not send the BYE before the ACK arrives', () => {
			expect(fixture.getByeTransactions()).toHaveLength(0);
		});

		it('sends the BYE when the ACK arrives', () => {
			fixture.receiveAck();

			expect(fixture.getByeTransactions()).toHaveLength(1);
		});

		it('calls only onSuccessResponse once when the BYE sent after the ACK gets 200', () => {
			fixture.receiveAck();
			fixture.respond(getTransaction(fixture.getByeTransactions(), 0), 200);

			expect(getHandlerCalls(handlers)).toEqual({ onSuccessResponse: 1 });
		});

		it('sends the BYE when the INVITE server transaction terminates without ACK', () => {
			jest.advanceTimersByTime(Timers.TIMER_L);

			expect(fixture.getByeTransactions()).toHaveLength(1);
		});

		it('calls only onSuccessResponse once when the BYE sent after the INVITE transaction terminates gets 200', () => {
			jest.advanceTimersByTime(Timers.TIMER_L);
			fixture.respond(getTransaction(fixture.getByeTransactions(), 0), 200);

			expect(getHandlerCalls(handlers)).toEqual({ onSuccessResponse: 1 });
		});

		it('reports the first BYE 200 and the duplicate BYE 481 when the INVITE server transaction terminates after the ACK', () => {
			fixture.receiveAck();

			const firstBye = getTransaction(fixture.getByeTransactions(), 0);

			fixture.respond(firstBye, 200);
			// Pre-existing upstream behaviour: Timer L sends a duplicate BYE, and its 481 also reaches byeEventHandlers as onDialogError.
			jest.advanceTimersByTime(Timers.TIMER_L);

			const byeTransactions = fixture.getByeTransactions();

			fixture.respond(getTransaction(byeTransactions, 1), 481);

			expect(byeTransactions).toHaveLength(2);
			expect(getHandlerCalls(handlers)).toEqual({
				onDialogError: 1,
				onSuccessResponse: 1,
			});
			expect(handlers.onSuccessResponse).toHaveBeenCalledWith(
				expect.objectContaining({
					cseq: firstBye.request.cseq,
					status_code: 200,
				})
			);
			expect(handlers.onDialogError).toHaveBeenCalledWith(
				expect.objectContaining({
					cseq: getTransaction(byeTransactions, 1).request.cseq,
					status_code: 481,
				})
			);
		});
	});

	describe('without byeEventHandlers', () => {
		let fixture: TFixture;

		beforeEach(() => {
			fixture = createConfirmedFixture();
		});

		it('sends the BYE when terminate is called without options', () => {
			fixture.session.terminate();

			expect(fixture.getByeTransactions()).toHaveLength(1);
		});

		it('ends the session when terminate is called without options', () => {
			const ended = jest.fn();

			fixture.session.on('ended', ended);
			fixture.session.terminate();

			expect(fixture.session.status).toBe(RTCSession.C.STATUS_TERMINATED);
			expect(ended).toHaveBeenCalledTimes(1);
		});

		it('does not throw when the BYE gets 200', () => {
			fixture.session.terminate();

			expect(() => {
				fixture.respond(getTransaction(fixture.getByeTransactions(), 0), 200);
			}).not.toThrow();
		});

		it('does not throw when the BYE gets 500', () => {
			fixture.session.terminate();

			expect(() => {
				fixture.respond(getTransaction(fixture.getByeTransactions(), 0), 500);
			}).not.toThrow();
		});
	});

	describe('terminateAsync', () => {
		let fixture: TFixture;

		beforeEach(() => {
			fixture = createConfirmedFixture();
		});

		it('resolves before the BYE response arrives when byeEventHandlers are passed', async () => {
			await expect(
				fixture.session.terminateAsync({ byeEventHandlers: handlers })
			).resolves.toBeUndefined();
			expect(fixture.getByeTransactions()).toHaveLength(1);
			expect(getHandlerCalls(handlers)).toEqual({});
		});

		it('calls only onSuccessResponse once when the BYE gets 200 after terminateAsync resolves', async () => {
			await fixture.session.terminateAsync({ byeEventHandlers: handlers });
			fixture.respond(getTransaction(fixture.getByeTransactions(), 0), 200);

			expect(getHandlerCalls(handlers)).toEqual({ onSuccessResponse: 1 });
		});
	});
});
