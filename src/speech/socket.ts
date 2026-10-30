const CONNECT_TIMEOUT_MS = 30_000;
// The longest silence tolerated once connected; the first audio can take several seconds.
const IDLE_TIMEOUT_MS = 30_000;

// Node's WebSocket accepts a second argument with request headers, which the standard type lacks.
type WebSocketWithHeaders = new (url: string, init: {headers: Record<string, string>}) => WebSocket;

export type Channel = {
	send(message: object): void;
	// Ends the reading, successfully or with `error`, and closes the socket either way.
	finish(error?: Error): void;
};

type Options = {
	// Names the service in error messages, e.g. "Realtime API".
	service: string;
	url: string;
	headers: Record<string, string>;
	signal: AbortSignal;
	// Called once the connection is open, for services where the client speaks first.
	onOpen?(channel: Channel): void;
	// Text frames arrive as a string, binary frames as an ArrayBuffer.
	onMessage(data: string | ArrayBuffer, channel: Channel): void;
};

// Runs one request over a WebSocket: connects, hands every message to the caller, and settles when
// the caller finishes it, the connection fails or drops, the signal aborts, or it goes quiet.
export function streamOverWebSocket({service, url, headers, signal, onOpen, onMessage}: Options): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const socket = new (WebSocket as unknown as WebSocketWithHeaders)(url, {headers});
		socket.binaryType = 'arraybuffer';
		let timer: NodeJS.Timeout | undefined;
		let settled = false;
		let connected = false; // once open, a later drop is not blamed on the key or the address
		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal.removeEventListener('abort', onAbort);
			if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(1000);
			if (error) reject(error);
			else resolve();
		};
		const channel: Channel = {send: message => socket.send(JSON.stringify(message)), finish};
		const watch = (ms: number, what: string) => {
			clearTimeout(timer);
			timer = setTimeout(() => finish(new Error(`timed out ${what}`)), ms);
		};
		const onAbort = () => finish(new Error('aborted'));
		if (signal.aborted) return onAbort();
		signal.addEventListener('abort', onAbort, {once: true});
		watch(CONNECT_TIMEOUT_MS, `connecting to the ${service}`);

		socket.addEventListener('error', e =>
			finish(new Error(connected ? `the ${service} dropped the connection` : `could not reach the ${service}: ${(e as ErrorEvent).message || 'connection failed (check the API key and base URL)'}`)),
		);
		socket.addEventListener('close', e => finish(new Error(`the ${service} closed the connection (${e.code}${e.reason ? `: ${e.reason}` : ''})`)));
		socket.addEventListener('open', () => {
			connected = true;
			watch(IDLE_TIMEOUT_MS, 'waiting for audio');
			onOpen?.(channel);
		});
		socket.addEventListener('message', message => {
			watch(IDLE_TIMEOUT_MS, 'waiting for audio');
			onMessage(message.data as string | ArrayBuffer, channel);
		});
	});
}
