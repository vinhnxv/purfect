// Voice input is separate from the LLM rewrite: it turns speech into text and nothing more.
// Anything that can do that plugs in as a SpeechProvider; the rest of purfect never sees which.

// Audio always travels as raw PCM: 16 kHz, mono, signed 16-bit little-endian.
export const SAMPLE_RATE = 16_000;

export type Transcript = {
	text: string;
	language?: string;
	// Length of the audio, and what it cost when the provider and model have a known price.
	seconds?: number;
	costUsd?: number;
};

// Asynchronous: the whole recording is sent after the user stops, one request, one answer.
export interface BatchProvider {
	readonly mode: 'batch';
	transcribe(pcm: Buffer, signal: AbortSignal): Promise<Transcript>;
}

// Real time: audio is streamed while the user speaks, and partial text may arrive before the end.
export interface LiveSession {
	write(pcm: Buffer): void;
	// No more audio: resolve with the final transcript.
	finish(): Promise<Transcript>;
	abort(): void;
}
export interface LiveProvider {
	readonly mode: 'live';
	open(handlers: {onPartial(text: string): void}, signal: AbortSignal): LiveSession;
}

export type SpeechProvider = BatchProvider | LiveProvider;

// The fields every provider may be given in the config file or environment. A provider uses the
// ones it needs and ignores the rest.
export type ProviderSettings = {apiKey?: string; baseUrl?: string; model?: string};

// How a provider registers itself. `create` receives the user's settings merged over `defaults`,
// and throws a readable error when something required (an API key, say) is missing.
export type ProviderDefinition = {
	defaults: ProviderSettings;
	create(settings: ProviderSettings): SpeechProvider;
};
