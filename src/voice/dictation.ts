import {peakOf} from './audio.js';
import {record as ffmpegRecord, type Recorder, type RecordOptions} from './record.js';
import {PROVIDERS} from './providers/index.js';
import type {VoiceConfig} from './config.js';
import type {LiveSession, Transcript} from './types.js';

// Nothing came out: the microphone gave only silence, or the provider heard no words.
export class NoSpeechError extends Error {
	constructor() {
		super('no speech');
	}
}

export type Dictation = {
	// Stop recording and resolve with the transcript.
	stop(): Promise<Transcript>;
	cancel(): void;
};

export type DictationHandlers = {
	// Text recognized so far, for providers that stream it while the user is still speaking.
	onPartial?: (text: string) => void;
	// Recording broke before stop() was called.
	onFailure?: (error: Error) => void;
};

// A microphone with permission denied returns pure zeros; real rooms are never that quiet.
const SILENCE_PEAK = 4;

// Records the microphone and hands the audio to the configured provider. Batch providers get the
// whole recording at stop(); live providers get audio as it is captured. Callers see no difference.
export function startDictation(
	voice: VoiceConfig,
	handlers: DictationHandlers = {},
	record: (options: RecordOptions) => Recorder = ffmpegRecord,
): Dictation {
	// Created first so a missing key fails before the microphone opens.
	const provider = PROVIDERS[voice.provider]!.create(voice.settings);
	const abort = new AbortController();
	const live: LiveSession | undefined = provider.mode === 'live' ? provider.open({onPartial: text => handlers.onPartial?.(text)}, abort.signal) : undefined;
	const chunks: Buffer[] = [];
	let peak = 0;
	let failure: Error | undefined;

	const recorder = record({
		device: voice.device,
		onChunk: pcm => {
			peak = Math.max(peak, peakOf(pcm));
			if (live) live.write(pcm);
			else chunks.push(pcm);
		},
		onError: error => {
			failure ??= error;
			handlers.onFailure?.(error);
		},
	});

	return {
		async stop() {
			await recorder.stop();
			if (failure) throw failure;
			if (peak < SILENCE_PEAK) {
				live?.abort();
				throw new NoSpeechError();
			}
			const transcript = live ? await live.finish() : await (provider as Extract<typeof provider, {mode: 'batch'}>).transcribe(Buffer.concat(chunks), abort.signal);
			const text = transcript.text.trim();
			if (!text) throw new NoSpeechError();
			return {...transcript, text};
		},
		cancel() {
			abort.abort();
			live?.abort();
			void recorder.stop();
		},
	};
}
