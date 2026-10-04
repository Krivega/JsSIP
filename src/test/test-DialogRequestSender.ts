import './include/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DialogRequestSender = require('../Dialog/RequestSender.js');

describe('DialogRequestSender 491 recovery', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('retries the outgoing re-INVITE without reporting a terminal error', () => {
		const onErrorResponse = jest.fn();
		const dialog = {
			_ua: {},
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

		jest.advanceTimersByTime(1000);

		expect(sender.send).toHaveBeenCalledTimes(1);
	});
});
