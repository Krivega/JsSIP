// Stable 8.x public API. Internal TypeScript sources intentionally remain stricter.
import type { Socket } from './Socket';
export declare class WebSocketInterface implements Socket {
	onconnect: () => void;
	ondisconnect: (error: boolean, code?: number, reason?: string) => void;
	onerror?: (code?: number, reason?: string) => void;
	ondata: (data: string | ArrayBuffer) => void;
	constructor(url: string);
	get via_transport(): string;
	set via_transport(value: string);
	get sip_uri(): string;
	get url(): string;
	connect(): void;
	disconnect(): void;
	send(message: string | ArrayBufferLike | Blob | ArrayBufferView): boolean;
	isConnected(): boolean;
	isConnecting(): boolean;
}
