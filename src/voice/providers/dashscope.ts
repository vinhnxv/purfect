import {dashscopeApiKey, dashscopeBaseUrl} from '../../dashscope.js';
import {secondsOf, toWav} from '../audio.js';
import {SAMPLE_RATE, type ProviderDefinition} from '../types.js';

const TIMEOUT_MS = 60_000;
// What the service answers to a recording with nothing recognisable in it.
const NO_WORDS = 'ASR_RESPONSE_HAVE_NO_WORDS';

type Response = {text?: string; output?: {text?: string}; code?: string; message?: string};

// DashScope's speech recognition (qwen-audio-3.1-asr-flash and the other Qwen-Audio models) over
// its multimodal-generation endpoint. The recording goes up as a base64 data URI; the service takes
// up to five minutes of audio per request.
export const dashscope: ProviderDefinition = {
	get defaults() {
		return {apiKey: dashscopeApiKey(), baseUrl: dashscopeBaseUrl(), model: 'qwen-audio-3.1-asr-flash'};
	},
	create({apiKey, baseUrl, model}) {
		if (!apiKey) throw new Error('no API key: set DASHSCOPE_API_KEY, PURFECT_VOICE_DASHSCOPE_API_KEY or voice.providers.dashscope.apiKey');
		const url = `${baseUrl!.replace(/\/$/, '')}/api/v1/services/aigc/multimodal-generation/generation`;
		return {
			mode: 'batch',
			async transcribe(pcm, signal) {
				const seconds = secondsOf(pcm);
				const res = await fetch(url, {
					method: 'POST',
					headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-DashScope-SSE': 'disable'},
					body: JSON.stringify({
						model,
						input: {messages: [{role: 'user', content: [{type: 'input_audio', input_audio: {data: `data:audio/wav;base64,${toWav(pcm).toString('base64')}`}}]}]},
						parameters: {format: 'wav', sample_rate: String(SAMPLE_RATE)},
					}),
					signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
				});
				const body = (await res.json().catch(() => ({}))) as Response;
				if (!res.ok) {
					if (body.message === NO_WORDS) return {text: '', seconds};
					throw new Error(`HTTP ${res.status}: ${body.message ?? res.statusText}`);
				}
				// No list price is known for the model, so no cost is shown.
				return {text: (body.text ?? body.output?.text ?? '').trim(), seconds};
			},
		};
	},
};
