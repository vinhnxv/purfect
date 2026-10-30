import {streamHttpAudio} from '../http.js';
import type {SynthesizerDefinition} from '../types.js';

// Soniox text to speech: one POST per reading, answered with a stream of raw 16 kHz PCM. Every voice
// reads every language, but the request must name the language of the text, which is the target
// language. The service cuts a request's audio at two minutes, so the text is capped well below that
// (about 15 characters are read per second).
export const soniox: SynthesizerDefinition = {
	get defaults() {
		return {apiKey: process.env.SONIOX_API_KEY || undefined, baseUrl: 'https://tts-rt.soniox.com', model: 'tts-rt-v2', voice: 'Adrian'};
	},
	create({apiKey, baseUrl, model, voice, language}) {
		if (!apiKey) throw new Error('no API key: set SONIOX_API_KEY, PURFECT_SPEECH_SONIOX_API_KEY or speech.providers.soniox.apiKey');
		const url = `${baseUrl!.replace(/\/$/, '')}/tts`;
		return {
			sampleRate: 16_000,
			maxChars: 1500,
			synthesize: (text, onAudio, signal) =>
				streamHttpAudio(
					{url, headers: {Authorization: `Bearer ${apiKey}`}, body: {model, language: language ?? 'en', voice, audio_format: 'pcm_s16le', sample_rate: 16_000, text}, signal},
					onAudio,
				),
		};
	},
};
