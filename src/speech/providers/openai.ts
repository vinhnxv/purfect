import {streamHttpAudio} from '../http.js';
import type {SynthesizerDefinition} from '../types.js';

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
			synthesize: (text, onAudio, signal) =>
				streamHttpAudio({url, headers: {Authorization: `Bearer ${apiKey}`}, body: {model, voice, input: text, response_format: 'pcm'}, signal}, onAudio),
		};
	},
};
