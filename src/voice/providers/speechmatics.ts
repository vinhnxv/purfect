import {SAMPLE_RATE, type LiveSession, type ProviderDefinition, type Transcript} from '../types.js';

const CONNECT_TIMEOUT_MS = 30_000;
// How long to wait for the last words once the audio has ended.
const FINISH_TIMEOUT_MS = 30_000;

// Node's WebSocket accepts a second argument with request headers, which the standard type lacks.
type WebSocketWithHeaders = new (url: string, init: {headers: Record<string, string>}) => WebSocket;

type ServerMessage = {message: string; segment?: {transcript?: string}; type?: string; reason?: string};

// Speechmatics Agent STT over a WebSocket. Audio goes up while the user speaks, the text so far comes
// back as it forms, and the last words arrive right after the audio ends. The service needs the
// language up front ("auto" is not accepted), so it comes from the "language" setting.
export const speechmatics: ProviderDefinition = {
	get defaults() {
		return {apiKey: process.env.SPEECHMATICS_API_KEY || undefined, baseUrl: 'https://global.rt.speechmatics.com', model: 'linden-1', language: 'en'};
	},
	create({apiKey, baseUrl, model, language}) {
		if (!apiKey) throw new Error('no API key: set SPEECHMATICS_API_KEY, PURFECT_VOICE_SPEECHMATICS_API_KEY or voice.providers.speechmatics.apiKey');
		const url = `${baseUrl!.replace(/^http/, 'ws').replace(/\/$/, '')}/v2/agent`;
		return {
			mode: 'live',
			open({onPartial}, signal): LiveSession {
				const socket = new (WebSocket as unknown as WebSocketWithHeaders)(url, {headers: {Authorization: `Bearer ${apiKey}`}});
				const waiting: Buffer[] = []; // audio recorded before the service said it was ready
				const finals: string[] = [];
				let ready = false;
				let ending = false;
				let sent = 0;
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
					settle.resolve({text: finals.join(' ').trim(), seconds: bytes / (SAMPLE_RATE * 2)});
					close();
				};
				const abort = () => fail(new Error('aborted'));
				const push = (pcm: Buffer) => {
					socket.send(new Uint8Array(pcm));
					sent++;
					bytes += pcm.length;
				};
				// Once every recorded chunk has gone up, tell the service the audio is over.
				const endIfDone = () => {
					if (!ready || !ending) return;
					if (sent === 0) return succeed();
					socket.send(JSON.stringify({message: 'EndOfStream', last_seq_no: sent - 1}));
					clearTimeout(timer);
					timer = setTimeout(() => fail(new Error('timed out waiting for the last words')), FINISH_TIMEOUT_MS);
				};

				if (signal.aborted) abort();
				else signal.addEventListener('abort', abort, {once: true});
				timer = setTimeout(() => fail(new Error('timed out connecting to Speechmatics')), CONNECT_TIMEOUT_MS);

				let connected = false;
				socket.addEventListener('open', () => {
					connected = true;
					socket.send(
						JSON.stringify({
							message: 'StartRecognition',
							audio_format: {type: 'raw', encoding: 'pcm_s16le', sample_rate: SAMPLE_RATE},
							transcription_config: {language, model, enable_partials: true},
						}),
					);
				});
				socket.addEventListener('error', () => fail(new Error(connected ? 'Speechmatics dropped the connection' : 'could not reach Speechmatics (check the API key and base URL)')));
				socket.addEventListener('close', e => fail(new Error(`Speechmatics closed the connection (${e.code}${e.reason ? `: ${e.reason}` : ''})`)));
				socket.addEventListener('message', event => {
					const m = JSON.parse(String(event.data)) as ServerMessage;
					if (m.message === 'RecognitionStarted') {
						ready = true;
						clearTimeout(timer);
						waiting.splice(0).forEach(push);
						endIfDone();
					} else if (m.message === 'AddPartialSegment') {
						// A partial replaces the previous one, and follows the words already final.
						onPartial([...finals, m.segment?.transcript?.trim() ?? ''].join(' ').trim());
					} else if (m.message === 'AddSegment') {
						const text = m.segment?.transcript?.trim();
						if (text) finals.push(text);
						onPartial(finals.join(' '));
					} else if (m.message === 'EndOfTranscript') {
						succeed();
					} else if (m.message === 'Error') {
						fail(new Error(`${m.type ?? 'error'}: ${m.reason ?? 'Speechmatics reported an error'}`));
					}
				});

				return {
					write(pcm) {
						if (ending) return;
						if (ready) push(pcm);
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
