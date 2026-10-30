import {azureSpeechEndpoint, azureSpeechKey} from '../../azure.js';
import {streamHttpAudio} from '../http.js';
import type {SynthesizerDefinition} from '../types.js';

const escapeXml = (text: string) => text.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'})[c]!);

// Azure AI Speech text to speech: one POST of SSML per reading, answered with a stream of raw 16 kHz
// PCM. The default voice is multilingual, so it reads the target language whatever it is; a voice
// built for one language (en-US-AvaNeural, vi-VN-HoaiMyNeural) reads only that one.
export const azure: SynthesizerDefinition = {
	get defaults() {
		return {apiKey: azureSpeechKey(), baseUrl: azureSpeechEndpoint(), voice: 'en-US-AvaMultilingualNeural'};
	},
	create({apiKey, baseUrl, voice}) {
		if (!apiKey) throw new Error('no API key: set AZURE_SPEECH_KEY, PURFECT_SPEECH_AZURE_API_KEY or speech.providers.azure.apiKey');
		if (!baseUrl) throw new Error('no endpoint: set AZURE_SPEECH_ENDPOINT, PURFECT_SPEECH_AZURE_BASE_URL or speech.providers.azure.baseUrl');
		const url = `${baseUrl.replace(/\/+$/, '')}/tts/cognitiveservices/v1`;
		// The voice name starts with its locale: en-US-AvaNeural, vi-VN-HoaiMyNeural.
		const locale = voice!.match(/^[a-z]{2,3}-[A-Za-z0-9]+(?=-)/)?.[0] ?? 'en-US';
		return {
			sampleRate: 16_000,
			maxChars: 4096, // a cap of ours, not the service's: it keeps one reading short and cheap
			synthesize: (text, onAudio, signal) =>
				streamHttpAudio(
					{
						url,
						headers: {
							'Ocp-Apim-Subscription-Key': apiKey,
							'Content-Type': 'application/ssml+xml',
							'X-Microsoft-OutputFormat': 'raw-16khz-16bit-mono-pcm',
							'User-Agent': 'purfect',
						},
						body: `<speak version="1.0" xml:lang="${locale}"><voice name="${escapeXml(voice!)}">${escapeXml(text)}</voice></speak>`,
						signal,
					},
					onAudio,
				),
		};
	},
};
