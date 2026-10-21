import './include/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DialogRequestSender = require('../Dialog/RequestSender.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Dialog = require('../Dialog.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const URI = require('../URI.js');

type TIncomingReinvite = {
	body: string;
	cseq: number;
	hasHeader: jest.Mock;
	method: string;
	reply: jest.Mock;
	server_transaction: {
		on: jest.Mock;
	};
};

type TDialog = {
	_ua: object;
	_createRequest: (
		method: string,
		extraHeaders: string[],
		body: string | null
	) => {
		body: string | null;
		cseq: number;
		getHeader: (name: string) => string | undefined;
		method: string;
		setHeader: (name: string, value: string) => void;
		toString: () => string;
	};
	beginLocalOffer: () => void;
	beginLocalOfferRetryWait: () => void;
	endLocalOffer: () => void;
	endLocalOfferRetryWait: () => void;
	hasPendingLocalOffer: () => boolean;
	incrementLocalSequenceNumber: (method: string) => number;
	isTerminated: () => boolean;
	local_seqnum: number;
	receiveRequest: (request: TIncomingReinvite) => void;
	terminate: () => void;
};

type TOfferRequest = {
	body: string;
	cseq: number;
	method: string;
	setHeader: jest.Mock;
};

type TDialogRequestSender = {
	_receiveResponse: (response: { method: string; status_code: number }) => void;
	send: jest.Mock;
};

const createDialog = (receiveRequest: jest.Mock): TDialog => {
	const owner = {
		_ua: {
			configuration: {
				display_name: null,
				extra_headers: [],
				session_timers: false,
				uri: URI.parse('sip:local@example.com'),
				use_preloaded_route: false,
			},
			destroyDialog: jest.fn(),
			newDialog: jest.fn(),
		},
		receiveRequest,
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

	return new Dialog(owner, message, 'UAS');
};

const createDialogRequestSender = (
	dialog: TDialog,
	request: TOfferRequest,
	eventHandlers: object
): TDialogRequestSender => {
	const sender = new DialogRequestSender(dialog, request, eventHandlers);

	sender.send = jest.fn();

	return sender;
};

const createIncomingReinvite = (cseq: number): TIncomingReinvite => ({
	body: 'v=0\r\n',
	cseq,
	hasHeader: jest.fn().mockReturnValue(false),
	method: 'INVITE',
	reply: jest.fn(),
	server_transaction: {
		on: jest.fn(),
	},
});

describe('DialogRequestSender 491 recovery', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('retries the outgoing re-INVITE without reporting a terminal error', async () => {
		const onErrorResponse = jest.fn();
		const dialog = {
			_ua: {},
			beginLocalOfferRetryWait: jest.fn(),
			endLocalOfferRetryWait: jest.fn(),
			incrementLocalSequenceNumber: jest.fn().mockReturnValue(11),
			isTerminated: jest.fn().mockReturnValue(false),
			local_seqnum: 10,
		};
		const request = {
			cseq: 10,
			method: 'INVITE',
			setHeader: jest.fn(),
		};
		const sender = new DialogRequestSender(dialog, request, {
			onErrorResponse,
		});

		sender.send = jest.fn();
		sender._receiveResponse({ method: 'INVITE', status_code: 491 });

		expect(onErrorResponse).not.toHaveBeenCalled();
		expect(request.cseq).toBe(10);
		expect(sender.send).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(1000);

		expect(request.cseq).toBe(11);
		expect(sender.send).toHaveBeenCalledTimes(1);
	});

	test('waits for a fresh SDP offer before retrying the re-INVITE', async () => {
		let resolveOffer: ((sdp: string) => void) | undefined;
		const freshOffer: Promise<string> = new Promise(resolve => {
			resolveOffer = resolve;
		});
		const onReattempt = jest.fn().mockReturnValue(freshOffer);
		const dialog = {
			_ua: {},
			beginLocalOfferRetryWait: jest.fn(),
			endLocalOfferRetryWait: jest.fn(),
			incrementLocalSequenceNumber: jest.fn().mockReturnValue(11),
			isTerminated: jest.fn().mockReturnValue(false),
			local_seqnum: 10,
		};
		const request = {
			body: 'old-offer',
			cseq: 10,
			method: 'INVITE',
			setHeader: jest.fn(),
		};
		const sender = new DialogRequestSender(dialog, request, {
			onReattempt,
		});

		sender.send = jest.fn();
		sender._receiveResponse({ method: 'INVITE', status_code: 491 });
		jest.advanceTimersByTime(1000);
		await Promise.resolve();

		expect(onReattempt).toHaveBeenCalledTimes(1);
		expect(sender.send).not.toHaveBeenCalled();

		resolveOffer?.('fresh-offer');
		await jest.advanceTimersByTimeAsync(0);

		expect(request.body).toBe('fresh-offer');
		expect(sender.send).toHaveBeenCalledTimes(1);
	});

	test('retries an UPDATE with a fresh SDP offer after 491', async () => {
		const onErrorResponse = jest.fn();
		const onReattempt = jest.fn().mockResolvedValue('fresh-offer');
		const dialog = {
			_ua: {},
			beginLocalOfferRetryWait: jest.fn(),
			endLocalOfferRetryWait: jest.fn(),
			incrementLocalSequenceNumber: jest.fn().mockReturnValue(11),
			isTerminated: jest.fn().mockReturnValue(false),
			local_seqnum: 10,
		};
		const request = {
			body: 'old-offer',
			cseq: 10,
			method: 'UPDATE',
			setHeader: jest.fn(),
		};
		const sender = new DialogRequestSender(dialog, request, {
			onErrorResponse,
			onReattempt,
		});

		sender.send = jest.fn();
		sender._receiveResponse({ method: 'UPDATE', status_code: 491 });
		await jest.advanceTimersByTimeAsync(1000);

		expect(onErrorResponse).not.toHaveBeenCalled();
		expect(onReattempt).toHaveBeenCalledTimes(1);
		expect(request.body).toBe('fresh-offer');
		expect(sender.send).toHaveBeenCalledTimes(1);
	});

	test('updates the dialog sequence number and UPDATE CSeq header before retrying', async () => {
		const dialog = createDialog(jest.fn());

		dialog.local_seqnum = 10;
		const request = dialog._createRequest(
			'UPDATE',
			['Content-Type: application/sdp'],
			'old-offer'
		);
		const sender = new DialogRequestSender(dialog, request, {});

		dialog.beginLocalOffer();
		sender.send = jest.fn();
		sender._receiveResponse({ method: 'UPDATE', status_code: 491 });

		expect(dialog.local_seqnum).toBe(11);
		expect(request.cseq).toBe(11);

		await jest.advanceTimersByTimeAsync(1000);

		expect(dialog.local_seqnum).toBe(12);
		expect(request.cseq).toBe(12);
		expect(request.getHeader('cseq')).toBe('12 UPDATE');
		expect(request.toString()).toContain('CSeq: 12 UPDATE\r\n');
	});

	test('uses the next CSeq when INFO is created before the UPDATE retry', async () => {
		const dialog = createDialog(jest.fn());

		dialog.local_seqnum = 10;
		const update = dialog._createRequest(
			'UPDATE',
			['Content-Type: application/sdp'],
			'old-offer'
		);
		const sender = new DialogRequestSender(dialog, update, {});

		dialog.beginLocalOffer();
		sender.send = jest.fn();
		sender._receiveResponse({ method: 'UPDATE', status_code: 491 });

		// Another in-dialog request consumes the next CSeq during the backoff.
		const info = dialog._createRequest('INFO', [], null);

		// INFO advances the dialog CSeq, while the pending UPDATE keeps its original value.
		expect(dialog.local_seqnum).toBe(12);
		expect(info.cseq).toBe(12);
		expect(update.cseq).toBe(11);

		await jest.advanceTimersByTimeAsync(1000);

		// The retry advances CSeq again and uses a value greater than the INFO request.
		expect(dialog.local_seqnum).toBe(13);
		expect(update.cseq).toBe(13);
		expect(update.getHeader('cseq')).toBe('13 UPDATE');
		expect(update.toString()).toContain('CSeq: 13 UPDATE\r\n');
		expect(sender.send).toHaveBeenCalledTimes(1);
	});

	describe('late offer errors after dialog termination', () => {
		let rejectOffer: ((error: Error) => void) | undefined;
		let dialog: TDialog;
		let onErrorResponse: jest.Mock;
		let onReattempt: jest.Mock;
		let onReattemptCanceled: jest.Mock;

		beforeEach(() => {
			rejectOffer = undefined;
			dialog = createDialog(jest.fn());
			dialog.local_seqnum = 10;
			dialog.beginLocalOffer();
			onErrorResponse = jest.fn();
			onReattemptCanceled = jest.fn();
			onReattempt = jest.fn(
				() =>
					new Promise((_resolve, reject) => {
						rejectOffer = reject;
					})
			);
		});

		test('discards a late re-INVITE offer error', async () => {
			const request = {
				body: 'old-offer',
				cseq: 10,
				method: 'INVITE',
				setHeader: jest.fn(),
			};
			const sender = createDialogRequestSender(dialog, request, {
				onErrorResponse,
				onReattempt,
				onReattemptCanceled,
			});

			// Start preparing the fresh offer and leave it pending.
			sender._receiveResponse({ method: 'INVITE', status_code: 491 });
			jest.advanceTimersByTime(1000);
			await Promise.resolve();

			expect(onReattempt).toHaveBeenCalledTimes(1);

			// Simulate createOffer failing only after the dialog has ended.
			dialog.terminate();
			rejectOffer?.(new Error('InvalidStateError'));
			await jest.advanceTimersByTimeAsync(0);

			expect(onReattemptCanceled).toHaveBeenCalledTimes(1);
			expect(onErrorResponse).not.toHaveBeenCalled();
			expect(sender.send).not.toHaveBeenCalled();
		});

		test('discards a late UPDATE offer error', async () => {
			const request = {
				body: 'old-offer',
				cseq: 10,
				method: 'UPDATE',
				setHeader: jest.fn(),
			};
			const sender = createDialogRequestSender(dialog, request, {
				onErrorResponse,
				onReattempt,
				onReattemptCanceled,
			});

			// Start preparing the fresh offer and leave it pending.
			sender._receiveResponse({ method: 'UPDATE', status_code: 491 });
			jest.advanceTimersByTime(1000);
			await Promise.resolve();

			expect(onReattempt).toHaveBeenCalledTimes(1);

			// Simulate createOffer failing only after the dialog has ended.
			dialog.terminate();
			rejectOffer?.(new Error('InvalidStateError'));
			await jest.advanceTimersByTimeAsync(0);

			expect(onReattemptCanceled).toHaveBeenCalledTimes(1);
			expect(onErrorResponse).not.toHaveBeenCalled();
			expect(sender.send).not.toHaveBeenCalled();
		});
	});

	test('allows an incoming re-INVITE through Dialog while waiting to retry after 491', async () => {
		const receiveRequest = jest.fn();
		const dialog = createDialog(receiveRequest);
		const outgoingRequest = {
			cseq: 10,
			method: 'INVITE',
			setHeader: jest.fn(),
		};
		const sender = new DialogRequestSender(dialog, outgoingRequest, {});

		dialog.local_seqnum = outgoingRequest.cseq;
		dialog.beginLocalOffer();
		sender.send = jest.fn();
		sender._receiveResponse({ method: 'INVITE', status_code: 491 });

		// The local operation stays pending to prevent another local renegotiation.
		expect(dialog.hasPendingLocalOffer()).toBe(true);

		const incomingRequest = createIncomingReinvite(2);

		dialog.receiveRequest(incomingRequest);

		// During the backoff, the peer's competing offer must reach RTCSession.
		expect(incomingRequest.reply).not.toHaveBeenCalled();
		expect(receiveRequest).toHaveBeenCalledWith(incomingRequest);

		await jest.advanceTimersByTimeAsync(1000);

		expect(sender.send).toHaveBeenCalledTimes(1);

		const collidingRequest = createIncomingReinvite(3);

		dialog.receiveRequest(collidingRequest);

		// Once the retry starts, the normal outgoing-transaction guard applies again.
		expect(collidingRequest.reply).toHaveBeenCalledWith(491);
		expect(receiveRequest).not.toHaveBeenCalledWith(collidingRequest);
	});

	test('does not reactivate a completed local offer when the retry timer fires', async () => {
		const receiveRequest = jest.fn();
		const dialog = createDialog(receiveRequest);
		const outgoingRequest = {
			cseq: 10,
			method: 'INVITE',
			setHeader: jest.fn(),
		};
		const sender = new DialogRequestSender(dialog, outgoingRequest, {});

		dialog.local_seqnum = outgoingRequest.cseq;
		dialog.beginLocalOffer();
		sender.send = jest.fn();
		sender._receiveResponse({ method: 'INVITE', status_code: 491 });
		dialog.endLocalOffer();

		await jest.advanceTimersByTimeAsync(1000);

		expect(dialog.hasPendingLocalOffer()).toBe(false);

		const incomingRequest = createIncomingReinvite(2);

		dialog.receiveRequest(incomingRequest);

		expect(incomingRequest.reply).not.toHaveBeenCalled();
		expect(receiveRequest).toHaveBeenCalledWith(incomingRequest);
	});

	test('reports a second 491 without scheduling a third re-INVITE', async () => {
		const onErrorResponse = jest.fn();
		const dialog = {
			_ua: {},
			beginLocalOfferRetryWait: jest.fn(),
			endLocalOfferRetryWait: jest.fn(),
			incrementLocalSequenceNumber: jest.fn().mockReturnValue(11),
			isTerminated: jest.fn().mockReturnValue(false),
			local_seqnum: 10,
		};
		const request = {
			cseq: 10,
			method: 'INVITE',
			setHeader: jest.fn(),
		};
		const sender = new DialogRequestSender(dialog, request, {
			onErrorResponse,
		});
		const secondResponse = { method: 'INVITE', status_code: 491 };

		sender.send = jest.fn();
		sender._receiveResponse({ method: 'INVITE', status_code: 491 });
		await jest.advanceTimersByTimeAsync(1000);
		sender._receiveResponse(secondResponse);
		await jest.advanceTimersByTimeAsync(1000);

		expect(onErrorResponse).toHaveBeenCalledTimes(1);
		expect(onErrorResponse).toHaveBeenCalledWith(secondResponse);
		expect(sender.send).toHaveBeenCalledTimes(1);
	});
});
