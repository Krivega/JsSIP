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
		receiveRequest: (request: TInDialogRequest) => void;
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
	const dialog = Object.assign(Object.create(Dialog.prototype), {
		_incoming_ack_seqnum: null,
		_owner: {
			receiveRequest,
		},
		_local_offer_pending: localOfferPending,
		_remote_seqnum: 1,
		_uac_pending_reply: uacPendingReply,
		_uas_pending_reply: false,
	});

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
