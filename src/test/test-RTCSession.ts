import './include/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RTCSession = require('../RTCSession.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Dialog = require('../Dialog.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Transactions = require('../Transactions.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const URI = require('../URI.js');

type TDialogFixture = {
	_ua: object;
	beginLocalOffer: jest.Mock;
	endLocalOffer: jest.Mock;
	hasPendingLocalOffer: jest.Mock;
	local_seqnum: number;
	owner: {
		receiveRequest: jest.Mock;
	};
	receiveRequest: (request: object) => void;
	uac_pending_reply: boolean;
	uas_pending_reply: boolean;
};

const createDialogFixture = ({
	localOfferPending = false,
}: {
	localOfferPending?: boolean;
} = {}): TDialogFixture => {
	const owner = {
		_ua: {
			newDialog: jest.fn(),
		},
		receiveRequest: jest.fn(),
	};
	const message = {
		call_id: 'call-id',
		cseq: 1,
		from_tag: 'remote-tag',
		getHeaders: jest.fn().mockReturnValue([]),
		hasHeader: jest.fn().mockReturnValue(true),
		parseHeader: jest.fn((header: string) => ({
			uri: URI.parse(`sip:${header}@example.com`),
		})),
		to_tag: 'local-tag',
	};
	const dialog = new Dialog(owner, message, 'UAS');

	if (localOfferPending) {
		dialog.beginLocalOffer();
	}

	// Keep real Dialog state transitions while exposing calls to the tests.
	jest.spyOn(dialog, 'beginLocalOffer');
	jest.spyOn(dialog, 'endLocalOffer');
	jest.spyOn(dialog, 'hasPendingLocalOffer');

	return dialog;
};

type TDeferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
};

const createDeferred = <T>(): TDeferred<T> => {
	let resolvePromise: ((value: T) => void) | undefined;
	const promise: Promise<T> = new Promise(resolve => {
		resolvePromise = resolve;
	});

	return {
		promise,
		resolve: (value: T) => {
			resolvePromise?.(value);
		},
	};
};

type TClientTransaction = {
	request: { body: string };
	receiveResponse: (response: object) => void;
};

type TPeerConnectionFixture = {
	connection: {
		signalingState: string;
		setRemoteDescription: jest.Mock;
	};
	createLocalDescription: jest.Mock;
};

type TRtcSessionFixture = {
	failed: jest.Mock;
	session: {
		_connectionPromiseQueue: Promise<unknown>;
		_status: number;
	};
	succeeded: jest.Mock;
};

type TCompetingReinvite = {
	body: string;
	cseq: number;
	getHeader: () => string;
	hasHeader: (header: string) => boolean;
	method: string;
	parseSDP: () => { media: object[] };
	reply: jest.Mock;
	server_transaction: object;
};

const createPeerConnectionFixture = (): TPeerConnectionFixture => {
	let localOfferNumber = 0;
	const connection = {
		signalingState: 'stable',
		setRemoteDescription: jest.fn(
			async ({ type }: { type: 'answer' | 'offer' }) => {
				if (type === 'offer') {
					// A competing offer implicitly rolls back the pending local offer.
					connection.signalingState = 'have-remote-offer';

					return;
				}

				if (connection.signalingState !== 'have-local-offer') {
					throw new Error('InvalidStateError');
				}

				connection.signalingState = 'stable';
			}
		),
	};
	const createLocalDescription = jest.fn(async (type: string) => {
		if (type === 'answer') {
			connection.signalingState = 'stable';

			return 'peer-answer';
		}

		localOfferNumber += 1;
		connection.signalingState = 'have-local-offer';

		return `local-offer-${localOfferNumber}`;
	});

	return { connection, createLocalDescription };
};

const createClientTransactionsFixture = (
	dialog: TDialogFixture
): TClientTransaction[] => {
	const clientTransactions: TClientTransaction[] = [];
	const transport = {
		send: jest.fn().mockReturnValue(true),
		via_transport: 'WS',
	};

	// Use real client transactions while keeping network transport deterministic.
	Object.assign(dialog._ua, {
		C: { STATUS_USER_CLOSED: 2 },
		_configuration: { authorization_jwt: null },
		configuration: {
			display_name: null,
			extra_headers: [],
			jssip_id: 'test-',
			uri: URI.parse('sip:local@example.com'),
			use_preloaded_route: false,
			via_host: 'test.invalid',
		},
		destroyTransaction: jest.fn(),
		newTransaction: jest.fn(transaction => {
			clientTransactions.push(transaction);
		}),
		status: 0,
		transport,
	});
	dialog.local_seqnum = 10;

	return clientTransactions;
};

const createRtcSessionFixture = ({
	connection,
	createLocalDescription,
	dialog,
}: {
	connection: TPeerConnectionFixture['connection'];
	createLocalDescription: jest.Mock;
	dialog: TDialogFixture;
}): TRtcSessionFixture => {
	const succeeded = jest.fn();
	const failed = jest.fn();
	const session = {
		_contact: '<sip:test@example.com>',
		_connection: connection,
		_connectionPromiseQueue: Promise.resolve(),
		_createLocalDescription: createLocalDescription,
		_createQueuedLocalOffer: RTCSession.prototype._createQueuedLocalOffer,
		_createRemoteDescription: (type: 'answer' | 'offer', sdp: string) => ({
			sdp,
			type,
		}),
		_dialog: dialog,
		_earlyDialogs: {},
		_handleSessionTimersInIncomingRequest: jest.fn(),
		_handleSessionTimersInIncomingResponse: jest.fn(),
		_is_confirmed: true,
		_mangleOffer: (sdp: string) => sdp,
		_onhold: jest.fn(),
		_onunhold: jest.fn(),
		_processInDialogSdpOffer: RTCSession.prototype._processInDialogSdpOffer,
		_receiveReinvite: RTCSession.prototype._receiveReinvite,
		_remoteHold: false,
		_rtcAnswerConstraints: null,
		_rtcOfferConstraints: null,
		_sessionTimers: {
			running: false,
			currentExpires: 90,
			refresher: true,
		},
		_status: 9,
		_timers: {},
		_confirmed: jest.fn(),
		_setACKTimer: jest.fn(),
		_setInvite2xxTimer: jest.fn(),
		emit: jest.fn(),
		onDialogError: jest.fn(),
		onRequestTimeout: jest.fn(),
		onTransportError: jest.fn(),
		sendRequest: RTCSession.prototype.sendRequest,
		sendRequestAsync: RTCSession.prototype.sendRequestAsync,
	};

	dialog.owner.receiveRequest.mockImplementation(request => {
		RTCSession.prototype.receiveRequest.call(session, request);
	});

	return { failed, session, succeeded };
};

const createCompetingReinvite = (): TCompetingReinvite => {
	const stateChangedListeners: Set<() => void> = new Set();
	const serverTransaction = {
		state: Transactions.C.STATUS_PROCEEDING,
		on: jest.fn((event: string, listener: () => void) => {
			if (event === 'stateChanged') {
				stateChangedListeners.add(listener);
			}
		}),
		removeListener: jest.fn((event: string, listener: () => void) => {
			if (event === 'stateChanged') {
				stateChangedListeners.delete(listener);
			}
		}),
	};

	return {
		body: 'peer-offer',
		cseq: 2,
		getHeader: () => 'application/sdp',
		hasHeader: (header: string) => header.toLowerCase() === 'content-type',
		method: 'INVITE',
		parseSDP: () => ({ media: [] }),
		reply: jest.fn((statusCode: number, ...args: unknown[]) => {
			if (statusCode !== 200) {
				return;
			}

			serverTransaction.state = Transactions.C.STATUS_ACCEPTED;
			for (const listener of stateChangedListeners) {
				listener();
			}

			const onSuccess = args[3];

			if (typeof onSuccess === 'function') {
				onSuccess();
			}
		}),
		server_transaction: serverTransaction,
	};
};

describe('RTCSession local offer serialization', () => {
	test('does not start another local offer while the previous one is pending', () => {
		const session = {
			_dialog: createDialogFixture({ localOfferPending: true }),
			_rtcReady: true,
		};

		const isReady = RTCSession.prototype.isReadyToReOffer.call(session);

		expect(isReady).toBe(false);
	});

	describe('sequential public renegotiations', () => {
		let dialog: TDialogFixture;
		let sendRequestAsync: jest.Mock;
		let session: object;

		beforeEach(() => {
			const response = {
				body: 'v=0\r\n',
				hasHeader: (header: string) => header === 'Content-Type',
				getHeader: () => 'application/sdp',
			};

			dialog = createDialogFixture();
			sendRequestAsync = jest
				.fn()
				.mockResolvedValue({ response, isError: false });
			session = {
				_contact: '<sip:test@example.com>',
				_connection: {
					setRemoteDescription: jest.fn().mockResolvedValue(undefined),
				},
				_connectionPromiseQueue: Promise.resolve(),
				_createLocalDescription: jest.fn().mockResolvedValue('v=0\r\n'),
				_createQueuedLocalOffer: RTCSession.prototype._createQueuedLocalOffer,
				_createRemoteDescription: jest.fn((_type: string, sdp: string) => ({
					sdp,
				})),
				_dialog: dialog,
				_handleSessionTimersInIncomingResponse: jest.fn(),
				_mangleOffer: (sdp: string) => sdp,
				_rtcOfferConstraints: null,
				_rtcReady: true,
				_sendReinvite: RTCSession.prototype._sendReinvite,
				_sendUpdate: RTCSession.prototype._sendUpdate,
				_sessionTimers: {
					running: false,
					currentExpires: 90,
					refresher: true,
				},
				_setLocalMediaStatus: jest.fn(),
				_status: 9,
				emit: jest.fn(),
				isReadyToReOffer: RTCSession.prototype.isReadyToReOffer,
				sendRequest: jest.fn(),
				sendRequestAsync,
				terminate: jest.fn(),
			};
		});

		describe('re-INVITE', () => {
			test('resolves both calls successfully', async () => {
				const first = await RTCSession.prototype.renegotiate.call(session);
				const second = await RTCSession.prototype.renegotiate.call(session);

				expect(first).toBe(true);
				expect(second).toBe(true);
			});

			test('sends one request per call', async () => {
				await RTCSession.prototype.renegotiate.call(session);
				await RTCSession.prototype.renegotiate.call(session);

				expect(sendRequestAsync.mock.calls.map(([method]) => method)).toEqual([
					'INVITE',
					'INVITE',
				]);
			});

			test('ends each local offer exactly once', async () => {
				await RTCSession.prototype.renegotiate.call(session);
				await RTCSession.prototype.renegotiate.call(session);

				expect(dialog.endLocalOffer).toHaveBeenCalledTimes(2);
			});

			test('leaves no local offer pending', async () => {
				await RTCSession.prototype.renegotiate.call(session);
				await RTCSession.prototype.renegotiate.call(session);

				expect(dialog.hasPendingLocalOffer()).toBe(false);
			});
		});

		describe('UPDATE', () => {
			const options = { useUpdate: true };

			test('resolves both calls successfully', async () => {
				const first = await RTCSession.prototype.renegotiate.call(
					session,
					options
				);
				const second = await RTCSession.prototype.renegotiate.call(
					session,
					options
				);

				expect(first).toBe(true);
				expect(second).toBe(true);
			});

			test('sends one request per call', async () => {
				await RTCSession.prototype.renegotiate.call(session, options);
				await RTCSession.prototype.renegotiate.call(session, options);

				expect(sendRequestAsync.mock.calls.map(([method]) => method)).toEqual([
					'UPDATE',
					'UPDATE',
				]);
			});

			test('ends each local offer exactly once', async () => {
				await RTCSession.prototype.renegotiate.call(session, options);
				await RTCSession.prototype.renegotiate.call(session, options);

				expect(dialog.endLocalOffer).toHaveBeenCalledTimes(2);
			});

			test('leaves no local offer pending', async () => {
				await RTCSession.prototype.renegotiate.call(session, options);
				await RTCSession.prototype.renegotiate.call(session, options);

				expect(dialog.hasPendingLocalOffer()).toBe(false);
			});
		});
	});
});

describe('RTCSession _sendReinvite queue recovery', () => {
	test('keeps the local offer pending until re-INVITE processing completes', async () => {
		const requestDeferred = createDeferred<{ isError: true }>();
		const dialog = createDialogFixture();
		const session = {
			_contact: '<sip:test@example.com>',
			_dialog: dialog,
			_status: 9,
			_sessionTimers: {
				running: false,
				currentExpires: 90,
				refresher: true,
			},
			_rtcOfferConstraints: null,
			_connectionPromiseQueue: Promise.resolve(),
			_createLocalDescription: jest.fn().mockResolvedValue('v=0\r\n'),
			_createQueuedLocalOffer: RTCSession.prototype._createQueuedLocalOffer,
			_mangleOffer: (sdp: string) => sdp,
			emit: jest.fn(),
			sendRequestAsync: jest.fn().mockReturnValue(requestDeferred.promise),
			sendRequest: jest.fn(),
			_handleSessionTimersInIncomingResponse: jest.fn(),
		};

		const renegotiation = RTCSession.prototype._sendReinvite.call(session);

		expect(dialog.beginLocalOffer).toHaveBeenCalledTimes(1);
		expect(dialog.endLocalOffer).not.toHaveBeenCalled();

		await session._connectionPromiseQueue;

		expect(dialog.endLocalOffer).not.toHaveBeenCalled();

		requestDeferred.resolve({ isError: true });
		await renegotiation;

		expect(dialog.endLocalOffer).toHaveBeenCalledTimes(1);
	});

	test('keeps queue usable after createLocalDescription failure', async () => {
		const createLocalDescription = jest
			.fn()
			.mockRejectedValueOnce(new Error('create-offer failed'))
			.mockResolvedValueOnce('v=0\r\n');
		const sendRequestAsync = jest.fn().mockResolvedValue({ isError: true });
		const failed = jest.fn();

		const session = {
			_contact: '<sip:test@example.com>',
			_dialog: createDialogFixture(),
			_status: 9,
			_sessionTimers: {
				running: false,
				currentExpires: 90,
				refresher: true,
			},
			_rtcOfferConstraints: null,
			_connectionPromiseQueue: Promise.resolve(),
			_createLocalDescription: createLocalDescription,
			_createQueuedLocalOffer: RTCSession.prototype._createQueuedLocalOffer,
			_mangleOffer: (sdp: string) => sdp,
			emit: jest.fn(),
			sendRequestAsync,
			sendRequest: jest.fn(),
			_handleSessionTimersInIncomingResponse: jest.fn(),
		};

		await RTCSession.prototype._sendReinvite.call(session, {
			extraHeaders: [],
			eventHandlers: { failed },
		});

		await RTCSession.prototype._sendReinvite.call(session, {
			extraHeaders: [],
			eventHandlers: { failed },
		});

		expect(createLocalDescription).toHaveBeenCalledTimes(2);
		expect(sendRequestAsync).toHaveBeenCalledTimes(1);
		expect(failed).toHaveBeenCalledTimes(1);
	});

	test('keeps queue usable after setRemoteDescription failure', async () => {
		const createLocalDescription = jest.fn().mockResolvedValue('v=0\r\n');
		const setRemoteDescription = jest
			.fn()
			.mockRejectedValueOnce(new Error('set-remote failed'))
			.mockResolvedValueOnce(undefined);
		const failed = jest.fn();
		const succeeded = jest.fn();

		const response = {
			body: 'v=0\r\n',
			hasHeader: (header: string) => header === 'Content-Type',
			getHeader: () => 'application/sdp',
		};

		const session = {
			_contact: '<sip:test@example.com>',
			_dialog: createDialogFixture(),
			_status: 9,
			_sessionTimers: {
				running: false,
				currentExpires: 90,
				refresher: true,
			},
			_rtcOfferConstraints: null,
			_connectionPromiseQueue: Promise.resolve(),
			_createLocalDescription: createLocalDescription,
			_createQueuedLocalOffer: RTCSession.prototype._createQueuedLocalOffer,
			_createRemoteDescription: jest.fn((_type: string, sdp: string) => ({
				sdp,
			})),
			_connection: {
				setRemoteDescription,
			},
			_mangleOffer: (sdp: string) => sdp,
			emit: jest.fn(),
			sendRequestAsync: jest
				.fn()
				.mockResolvedValue({ response, isError: false }),
			sendRequest: jest.fn(),
			_handleSessionTimersInIncomingResponse: jest.fn(),
		};

		await RTCSession.prototype._sendReinvite.call(session, {
			extraHeaders: [],
			eventHandlers: { failed, succeeded },
		});

		await RTCSession.prototype._sendReinvite.call(session, {
			extraHeaders: [],
			eventHandlers: { failed, succeeded },
		});

		expect(setRemoteDescription).toHaveBeenCalledTimes(2);
		expect(failed).toHaveBeenCalledTimes(1);
		expect(succeeded).toHaveBeenCalledTimes(1);
	});
});

describe('RTCSession re-INVITE recovery after 491', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('creates a fresh local offer before retrying after a competing offer', async () => {
		const dialog = createDialogFixture();
		const { connection, createLocalDescription } =
			createPeerConnectionFixture();
		const clientTransactions = createClientTransactionsFixture(dialog);
		const { failed, session, succeeded } = createRtcSessionFixture({
			connection,
			createLocalDescription,
			dialog,
		});

		// Start the local renegotiation and send the initial re-INVITE.
		const renegotiation = RTCSession.prototype._sendReinvite.call(session, {
			eventHandlers: { failed, succeeded },
		});

		await session._connectionPromiseQueue;
		await Promise.resolve();
		await Promise.resolve();

		expect(clientTransactions).toHaveLength(1);
		expect(dialog.uac_pending_reply).toBe(true);

		// Put the local offer into backoff by rejecting the initial request with 491.
		clientTransactions[0].receiveResponse({
			getHeader: () => '<sip:remote@example.com>;tag=remote-tag',
			method: 'INVITE',
			status_code: 491,
		});

		expect(dialog.uac_pending_reply).toBe(false);

		const incomingReinvite = createCompetingReinvite();

		// Route the competing offer through Dialog and RTCSession to create its answer.
		dialog.receiveRequest(incomingReinvite);
		await session._connectionPromiseQueue;
		await Promise.resolve();

		expect(connection.signalingState).toBe('stable');
		expect(incomingReinvite.reply).toHaveBeenCalledTimes(1);

		const [statusCode, , , responseBody] = incomingReinvite.reply.mock.calls[0];

		expect(statusCode).toBe(200);
		expect(responseBody).toBe('peer-answer');
		expect(dialog.uas_pending_reply).toBe(false);
		expect(session._status).toBe(6);

		// Complete the competing re-INVITE exchange before the local retry starts.
		dialog.receiveRequest({ cseq: 2, method: 'ACK' });

		expect(session._status).toBe(9);

		await jest.advanceTimersByTimeAsync(1000);

		// Verify that the retry uses a fresh offer created from the stable WebRTC state.
		expect(clientTransactions).toHaveLength(2);
		expect(createLocalDescription).toHaveBeenCalledTimes(3);
		expect(clientTransactions[1].request.body).toBe('local-offer-2');
		expect(connection.signalingState).toBe('have-local-offer');
		expect(dialog.uac_pending_reply).toBe(true);

		// Apply the retry answer and finish the original renegotiation successfully.
		clientTransactions[1].receiveResponse({
			body: 'retry-answer',
			getHeader: () => 'application/sdp',
			hasHeader: () => true,
			method: 'INVITE',
			status_code: 200,
		});

		await renegotiation;

		expect(connection.signalingState).toBe('stable');
		expect(dialog.uac_pending_reply).toBe(false);
		expect(succeeded).toHaveBeenCalledTimes(1);
		expect(failed).not.toHaveBeenCalled();
	});
});

describe('RTCSession _sendUpdate local offer state', () => {
	test('keeps the local offer pending until UPDATE with SDP completes', async () => {
		const requestDeferred = createDeferred<{ isError: true }>();
		const dialog = createDialogFixture();
		const session = {
			_contact: '<sip:test@example.com>',
			_dialog: dialog,
			_status: 9,
			_sessionTimers: {
				running: false,
				currentExpires: 90,
				refresher: true,
			},
			_rtcOfferConstraints: null,
			_connectionPromiseQueue: Promise.resolve(),
			_createLocalDescription: jest.fn().mockResolvedValue('v=0\r\n'),
			_createQueuedLocalOffer: RTCSession.prototype._createQueuedLocalOffer,
			_mangleOffer: (sdp: string) => sdp,
			emit: jest.fn(),
			sendRequestAsync: jest.fn().mockReturnValue(requestDeferred.promise),
			_handleSessionTimersInIncomingResponse: jest.fn(),
		};

		const update = RTCSession.prototype._sendUpdate.call(session, {
			sdpOffer: true,
		});

		expect(dialog.beginLocalOffer).toHaveBeenCalledTimes(1);
		expect(dialog.endLocalOffer).not.toHaveBeenCalled();

		await session._connectionPromiseQueue;

		expect(dialog.endLocalOffer).not.toHaveBeenCalled();

		requestDeferred.resolve({ isError: true });
		await update;

		expect(dialog.endLocalOffer).toHaveBeenCalledTimes(1);
	});
});
