import {azureSpeechEndpoint, azureSpeechKey} from '../../azure.js';
import {secondsOf, toWav} from '../audio.js';
import type {ProviderDefinition} from '../types.js';

const TIMEOUT_MS = 60_000;
// What the service answers to a recording it heard no words in.
const SILENT = new Set(['NoMatch', 'InitialSilenceTimeout', 'BabbleTimeout']);

type Response = {RecognitionStatus?: string; DisplayText?: string; error?: {message?: string}};

// Azure AI Speech recognition of short audio: one POST with the whole recording, answered with the
// text. The service wants the language up front (there is no automatic detection here) and, by its
// documentation, up to 60 seconds of audio, which is also purfect's default recording limit.
export const azure: ProviderDefinition = {
	get defaults() {
		return {apiKey: azureSpeechKey(), baseUrl: azureSpeechEndpoint(), language: 'en-US'};
	},
	create({apiKey, baseUrl, language}) {
		if (!apiKey) throw new Error('no API key: set AZURE_SPEECH_KEY, PURFECT_VOICE_AZURE_API_KEY or voice.providers.azure.apiKey');
		if (!baseUrl) throw new Error('no endpoint: set AZURE_SPEECH_ENDPOINT, PURFECT_VOICE_AZURE_BASE_URL or voice.providers.azure.baseUrl');
		const url = `${baseUrl.replace(/\/+$/, '')}/stt/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(language!)}&format=simple`;
		return {
			mode: 'batch',
			async transcribe(pcm, signal) {
				const seconds = secondsOf(pcm);
				const res = await fetch(url, {
					method: 'POST',
					headers: {'Ocp-Apim-Subscription-Key': apiKey, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000'},
					body: new Uint8Array(toWav(pcm)),
					signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
				});
				// Errors are JSON from the gateway and plain text from the recogniser (a bad language, say).
				const raw = await res.text();
				const body = (() => {
					try {
						return JSON.parse(raw) as Response;
					} catch {
						return {} as Response;
					}
				})();
				if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error?.message ?? (raw.trim().slice(0, 200) || res.statusText)}`);
				if (body.RecognitionStatus && body.RecognitionStatus !== 'Success') {
					if (SILENT.has(body.RecognitionStatus)) return {text: '', seconds};
					throw new Error(`Azure speech recognition: ${body.RecognitionStatus}`);
				}
				// No price is taken from the service, so no cost is shown.
				return {text: (body.DisplayText ?? '').trim(), seconds};
			},
		};
	},
};
