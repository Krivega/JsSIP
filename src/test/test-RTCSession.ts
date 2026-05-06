import './include/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RTCSession = require('../RTCSession.js');

describe('RTCSession _sendReinvite queue recovery', () => {
	test('keeps queue usable after createLocalDescription failure', async () => {
		const createLocalDescription = jest
			.fn()
			.mockRejectedValueOnce(new Error('create-offer failed'))
			.mockResolvedValueOnce('v=0\r\n');
		const sendRequestAsync = jest.fn().mockResolvedValue({ isError: true });
		const failed = jest.fn();

		const session = {
			_contact: '<sip:test@example.com>',
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
