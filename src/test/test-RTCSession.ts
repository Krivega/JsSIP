import './include/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RTCSession = require('../RTCSession.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Dialog = require('../Dialog.js');

type TDialogFixture = {
	beginLocalOffer: jest.Mock;
	endLocalOffer: jest.Mock;
	hasPendingLocalOffer: jest.Mock;
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
			uri: `sip:${header}@example.com`,
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
