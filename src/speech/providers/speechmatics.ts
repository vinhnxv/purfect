import {streamHttpAudio} from '../http.js';
import type {SynthesizerDefinition} from '../types.js';

// Speechmatics text to speech: one POST per reading, answered with a stream of raw 16 kHz PCM. The
// voice is part of the address (sarah and theo are UK English, megan and jack US English). It has
// English voices only, and is in preview, so its address may change.
export const speechmatics: SynthesizerDefinition = {
	get defaults() {
		return {apiKey: process.env.SPEECHMATICS_API_KEY || undefined, baseUrl: 'https://preview.tts.speechmatics.com', voice: 'sarah'};
	},
	languages: ['en'],
	create({apiKey, baseUrl, voice}) {
		if (!apiKey) throw new Error('no API key: set SPEECHMATICS_API_KEY, PURFECT_SPEECH_SPEECHMATICS_API_KEY or speech.providers.speechmatics.apiKey');
		const url = `${baseUrl!.replace(/\/$/, '')}/generate/${encodeURIComponent(voice!)}?output_format=pcm_16000`;
		return {
			sampleRate: 16_000,
			maxChars: 4096, // a cap of ours, not the service's: it keeps one reading short and cheap
			synthesize: (text, onAudio, signal) => streamHttpAudio({url, headers: {Authorization: `Bearer ${apiKey}`}, body: {text}, signal}, onAudio),
		};
	},
};
