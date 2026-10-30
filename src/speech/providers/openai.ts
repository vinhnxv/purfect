import type {SynthesizerDefinition} from '../types.js';

const CONNECT_TIMEOUT_MS = 30_000;

// OpenAI's /audio/speech endpoint, or any server that speaks the same API. The audio is requested as
// raw 24 kHz PCM and read as it streams, so playback can start before the clip is complete.
// gpt-4o-mini-tts is deprecated (shutdown 2027-01-06); its replacement is the openai-realtime provider.
export const openai: SynthesizerDefinition = {
	defaults: {baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts', voice: 'marin'},
	create({apiKey, baseUrl, model, voice}) {
		if (!apiKey) throw new Error('no API key: set PURFECT_SPEECH_OPENAI_API_KEY or speech.providers.openai.apiKey');
		const url = `${baseUrl!.replace(/\/$/, '')}/audio/speech`;
		return {
			sampleRate: 24_000,
			maxChars: 4096,
			async synthesize(text, onAudio, signal) {
				// The timeout covers only waiting for the first response, not the whole clip.
				const connect = new AbortController();
				const timer = setTimeout(() => connect.abort(), CONNECT_TIMEOUT_MS);
				let res: Response;
				try {
					res = await fetch(url, {
						method: 'POST',
						headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
						body: JSON.stringify({model, voice, input: text, response_format: 'pcm'}),
						signal: AbortSignal.any([signal, connect.signal]),
					});
				} finally {
					clearTimeout(timer);
				}
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as {error?: {message?: string}};
					throw new Error(`HTTP ${res.status}: ${body.error?.message ?? res.statusText}`);
				}
				const reader = res.body!.getReader();
				for (;;) {
					const {done, value} = await reader.read();
					if (done) return;
					onAudio(Buffer.from(value));
				}
			},
		};
	},
};
