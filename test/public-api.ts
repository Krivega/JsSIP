import {
	IncomingRequest,
	IncomingResponse,
	NameAddrHeader,
	URI,
	type ByeEventHandlers,
	type RTCSession,
	type Socket,
	type TerminateAsyncOptions,
	type TerminateOptions,
	type WebSocketInterface,
} from '../lib/JsSIP';

// Consumer subclasses may use their own header store, as in sip-connector.
class Request extends IncomingRequest {
	private readonly headers: Headers;

	constructor() {
		super();
		this.headers = new Headers();
	}

	override getHeader(name: string): string {
		return this.headers.get(name) ?? '';
	}
}

export function useLegacyPublicApi(socket: Socket): {
	request: IncomingRequest;
	response: IncomingResponse;
	user: string;
	displayName: string;
	header: string;
	websocket: WebSocketInterface;
} {
	const request: IncomingRequest = new Request();
	const response = new IncomingResponse();
	const uri = new URI('sip', 'alice', 'example.com');
	const identity = new NameAddrHeader(uri, 'Alice');
	const websocket: WebSocketInterface = socket;
	const user: string = uri.user;
	const displayName: string = identity.display_name;
	const header: string = response.getHeader('Reason');

	return { request, response, user, displayName, header, websocket };
}

export function terminateWithByeEventHandlers(
	session: RTCSession,
	onFinalResponse: (response: IncomingResponse) => void,
	onNoResponse: () => void
): Promise<void> {
	const byeEventHandlers: ByeEventHandlers = {
		onSuccessResponse: onFinalResponse,
		onErrorResponse: onFinalResponse,
		onDialogError: onFinalResponse,
		onRequestTimeout: onNoResponse,
		onTransportError: onNoResponse,
	};
	const terminateOptions: TerminateOptions = { byeEventHandlers };
	const terminateAsyncOptions: TerminateAsyncOptions = { byeEventHandlers };

	// @ts-expect-error BYE response handlers must be functions.
	session.terminate({ byeEventHandlers: { onSuccessResponse: 200 } });
	session.terminate(terminateOptions);

	return session.terminateAsync(terminateAsyncOptions);
}
