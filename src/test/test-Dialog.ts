import './include/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Dialog = require('../Dialog.js');

type TInDialogRequest = {
	body?: string;
	cseq: number;
	hasHeader: jest.Mock;
	method: string;
	reply: jest.Mock;
	server_transaction: {
		on: jest.Mock;
	};
};

type TInDialogRequestFixture = {
	dialog: {
		beginLocalOffer: () => void;
		receiveRequest: (request: TInDialogRequest) => void;
		uac_pending_reply: boolean;
	};
	receiveRequest: jest.Mock;
	request: TInDialogRequest;
};

const createInDialogRequestFixture = ({
	localOfferPending = false,
	uacPendingReply = false,
}: {
	localOfferPending?: boolean;
	uacPendingReply?: boolean;
} = {}): TInDialogRequestFixture => {
	const receiveRequest = jest.fn();
	const request: TInDialogRequest = {
		body: 'v=0\r\n',
		cseq: 2,
		hasHeader: jest.fn().mockReturnValue(false),
		method: 'INVITE',
		reply: jest.fn(),
		server_transaction: {
			on: jest.fn(),
		},
	};
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
	const dialog = new Dialog(owner, message, 'UAS');

	dialog.uac_pending_reply = uacPendingReply;

	if (localOfferPending) {
		dialog.beginLocalOffer();
	}

	return { dialog, receiveRequest, request };
};

describe('Dialog re-INVITE collision handling', () => {
	test('does not forward a re-INVITE rejected with 491 during an outgoing transaction', () => {
		const { dialog, receiveRequest, request } = createInDialogRequestFixture({
			uacPendingReply: true,
		});

		dialog.receiveRequest(request);

		expect(request.reply).toHaveBeenCalledTimes(1);
		expect(request.reply).toHaveBeenCalledWith(491);
		expect(receiveRequest).not.toHaveBeenCalled();
		expect(request.server_transaction.on).not.toHaveBeenCalled();
	});

	test('rejects a re-INVITE received while a local SDP offer is being created', () => {
		const { dialog, receiveRequest, request } = createInDialogRequestFixture({
			localOfferPending: true,
		});

		dialog.receiveRequest(request);

		expect(request.reply).toHaveBeenCalledTimes(1);
		expect(request.reply).toHaveBeenCalledWith(491);
		expect(receiveRequest).not.toHaveBeenCalled();
		expect(request.server_transaction.on).not.toHaveBeenCalled();
	});

	test('forwards a re-INVITE after the local negotiation has completed', () => {
		const { dialog, receiveRequest, request } = createInDialogRequestFixture();

		dialog.receiveRequest(request);

		expect(request.reply).not.toHaveBeenCalled();
		expect(receiveRequest).toHaveBeenCalledTimes(1);
		expect(receiveRequest).toHaveBeenCalledWith(request);
		expect(request.server_transaction.on).toHaveBeenCalledWith(
			'stateChanged',
			expect.any(Function)
		);
	});

	test('does not block an UPDATE without an SDP offer', () => {
		const { dialog, receiveRequest, request } = createInDialogRequestFixture({
			localOfferPending: true,
		});

		request.body = undefined;
		request.method = 'UPDATE';

		dialog.receiveRequest(request);

		expect(request.reply).not.toHaveBeenCalled();
		expect(receiveRequest).toHaveBeenCalledTimes(1);
		expect(receiveRequest).toHaveBeenCalledWith(request);
	});
});
