import {SAMPLE_RATE, type LiveSession, type ProviderDefinition, type Transcript} from '../types.js';

const CONNECT_TIMEOUT_MS = 30_000;
// How long to wait for the last words once the audio has ended.
const FINISH_TIMEOUT_MS = 30_000;

// Node's WebSocket accepts a second argument with request headers, which the standard type lacks.
type WebSocketWithHeaders = new (url: string, init: {headers: Record<string, string>}) => WebSocket;

type Token = {text: string; is_final?: boolean};
type ServerMessage = {tokens?: Token[]; finished?: boolean; error_code?: number; error_message?: string};

// Soniox real-time STT over a WebSocket. A JSON message with the settings opens the stream, audio
// follows as binary frames, and an empty text frame ends it. Final tokens arrive once; the
// non-final ones of each reply replace those of the one before. The service detects the language by
// itself; the optional "language" setting is only a hint for it.
export const soniox: ProviderDefinition = {
	get defaults() {
		return {apiKey: process.env.SONIOX_API_KEY || undefined, baseUrl: 'https://stt-rt.soniox.com', model: 'stt-rt-v5'};
	},
	create({apiKey, baseUrl, model, language}) {
		if (!apiKey) throw new Error('no API key: set SONIOX_API_KEY, PURFECT_VOICE_SONIOX_API_KEY or voice.providers.soniox.apiKey');
		const url = `${baseUrl!.replace(/^http/, 'ws').replace(/\/$/, '')}/transcribe-websocket`;
		return {
			mode: 'live',
			open({onPartial}, signal): LiveSession {
				const socket = new (WebSocket as unknown as WebSocketWithHeaders)(url, {headers: {Authorization: `Bearer ${apiKey}`}});
				const waiting: Buffer[] = []; // audio recorded before the connection was open
				let finals = '';
				let open = false;
				let ending = false;
				let bytes = 0;
				let timer: NodeJS.Timeout | undefined;
				let settle!: {resolve(t: Transcript): void; reject(e: Error): void};
				const result = new Promise<Transcript>((resolve, reject) => (settle = {resolve, reject}));
				// The failure may happen before anyone is waiting for the result; finish() still reports it.
				result.catch(() => {});

				const close = () => {
					clearTimeout(timer);
					signal.removeEventListener('abort', abort);
					if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(1000);
				};
				// Settle first: closing a socket that is still connecting raises its error event at once.
				const fail = (error: Error) => {
					settle.reject(error);
					close();
				};
				const succeed = () => {
					settle.resolve({text: finals.trim(), seconds: bytes / (SAMPLE_RATE * 2)});
					close();
				};
				const abort = () => fail(new Error('aborted'));
				const push = (pcm: Buffer) => {
					socket.send(new Uint8Array(pcm));
					bytes += pcm.length;
				};
				// An empty text frame says the audio is over.
				const endIfDone = () => {
					if (!open || !ending) return;
					if (bytes === 0) return succeed();
					socket.send('');
					clearTimeout(timer);
					timer = setTimeout(() => fail(new Error('timed out waiting for the last words')), FINISH_TIMEOUT_MS);
				};

				if (signal.aborted) abort();
				else signal.addEventListener('abort', abort, {once: true});
				timer = setTimeout(() => fail(new Error('timed out connecting to Soniox')), CONNECT_TIMEOUT_MS);

				socket.addEventListener('open', () => {
					open = true;
					clearTimeout(timer);
					socket.send(
						JSON.stringify({model, audio_format: 'pcm_s16le', sample_rate: SAMPLE_RATE, num_channels: 1, ...(language ? {language_hints: [language]} : {})}),
					);
					waiting.splice(0).forEach(push);
					endIfDone();
				});
				socket.addEventListener('error', () => fail(new Error(open ? 'Soniox dropped the connection' : 'could not reach Soniox (check the base URL)')));
				socket.addEventListener('close', e => fail(new Error(`Soniox closed the connection (${e.code}${e.reason ? `: ${e.reason}` : ''})`)));
				socket.addEventListener('message', event => {
					const m = JSON.parse(String(event.data)) as ServerMessage;
					if (m.error_code) return fail(new Error(`${m.error_code}: ${m.error_message ?? 'Soniox reported an error'}`));
					let partial = '';
					for (const token of m.tokens ?? []) {
						if (/^<\w+>$/.test(token.text)) continue; // markers such as <end>, not words
						if (token.is_final) finals += token.text;
						else partial += token.text;
					}
					if (m.tokens?.length) onPartial((finals + partial).trim());
					if (m.finished) succeed();
				});

				return {
					write(pcm) {
						if (ending) return;
						if (open) push(pcm);
						else waiting.push(pcm);
					},
					finish() {
						ending = true;
						endIfDone();
						return result;
					},
					abort,
				};
			},
		};
	},
};
