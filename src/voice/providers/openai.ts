import {toWav, secondsOf} from '../audio.js';
import type {ProviderDefinition} from '../types.js';

// Estimated list price in USD per minute of audio (OpenAI pricing page). Models not listed show no cost.
const PRICE_PER_MINUTE: Record<string, number> = {'gpt-transcribe': 0.0045};

const TIMEOUT_MS = 60_000;

type Response = {text?: string; languages?: {code?: string}[]; usage?: {seconds?: number}; error?: {message?: string}};

// OpenAI's /audio/transcriptions endpoint, or any server that speaks the same API.
export const openai: ProviderDefinition = {
	defaults: {baseUrl: 'https://api.openai.com/v1', model: 'gpt-transcribe'},
	create({apiKey, baseUrl, model}) {
		if (!apiKey) throw new Error('no API key: set PURFECT_VOICE_OPENAI_API_KEY or voice.providers.openai.apiKey');
		const url = `${baseUrl!.replace(/\/$/, '')}/audio/transcriptions`;
		return {
			mode: 'batch',
			async transcribe(pcm, signal) {
				const form = new FormData();
				form.set('model', model!);
				form.set('file', new Blob([new Uint8Array(toWav(pcm))], {type: 'audio/wav'}), 'speech.wav');
				const res = await fetch(url, {
					method: 'POST',
					headers: {Authorization: `Bearer ${apiKey}`},
					body: form,
					signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
				});
				const body = (await res.json().catch(() => ({}))) as Response;
				if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error?.message ?? res.statusText}`);
				const seconds = body.usage?.seconds ?? secondsOf(pcm);
				const price = PRICE_PER_MINUTE[model!];
				return {
					text: (body.text ?? '').trim(),
					language: body.languages?.[0]?.code,
					seconds,
					costUsd: price === undefined ? undefined : (price * seconds) / 60,
				};
			},
		};
	},
};
