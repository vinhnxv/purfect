export type SpeechSettings = {apiKey?: string; baseUrl?: string; model?: string; voice?: string};

// A text-to-speech engine. It hands the audio over as it arrives, so a service that returns the whole
// clip in one response (one call) and one that streams it (many calls, or a WebSocket) look the same
// to the rest of purfect. The audio is mono 16-bit little-endian PCM at `sampleRate`.
export type Synthesizer = {
	sampleRate: number;
	// Longest text the service accepts in one request.
	maxChars: number;
	synthesize(text: string, onAudio: (pcm: Buffer) => void, signal: AbortSignal): Promise<void>;
};

export type SynthesizerDefinition = {
	defaults: SpeechSettings;
	// Throws when the settings are unusable (no API key, say), before any request is made.
	create(settings: SpeechSettings): Synthesizer;
};
