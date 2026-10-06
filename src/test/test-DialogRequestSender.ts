import './include/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DialogRequestSender = require('../Dialog/RequestSender.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Dialog = require('../Dialog.js');

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
	beginLocalOffer: () => void;
	beginLocalOfferRetryWait: () => void;
	endLocalOffer: () => void;
	endLocalOfferRetryWait: () => void;
	hasPendingLocalOffer: () => boolean;
	isTerminated: () => boolean;
	local_seqnum: number;
	receiveRequest: (request: TIncomingReinvite) => void;
};

const createDialog = (receiveRequest: jest.Mock): TDialog => {
	const owner = {
		_ua: {
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
			uri: `sip:${header}@example.com`,
		})),
		to_tag: 'local-tag',
	};

	return new Dialog(owner, message, 'UAS');
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
			isTerminated: jest.fn().mockReturnValue(false),
			local_seqnum: 10,
		};
		const request = {
			cseq: 10,
			method: 'INVITE',
		};
		const sender = new DialogRequestSender(dialog, request, {
			onErrorResponse,
		});

		sender.send = jest.fn();
		sender._receiveResponse({ method: 'INVITE', status_code: 491 });

		expect(onErrorResponse).not.toHaveBeenCalled();
		expect(request.cseq).toBe(11);
		expect(sender.send).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(1000);

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
			isTerminated: jest.fn().mockReturnValue(false),
			local_seqnum: 10,
		};
		const request = {
			body: 'old-offer',
			cseq: 10,
			method: 'INVITE',
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
			isTerminated: jest.fn().mockReturnValue(false),
			local_seqnum: 10,
		};
		const request = {
			body: 'old-offer',
			cseq: 10,
			method: 'UPDATE',
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

	test('allows an incoming re-INVITE through Dialog while waiting to retry after 491', async () => {
		const receiveRequest = jest.fn();
		const dialog = createDialog(receiveRequest);
		const outgoingRequest = {
			cseq: 10,
			method: 'INVITE',
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
			isTerminated: jest.fn().mockReturnValue(false),
			local_seqnum: 10,
		};
		const request = {
			cseq: 10,
			method: 'INVITE',
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
