import {randomUUID} from 'node:crypto';
import {dashscopeApiKey, dashscopeBaseUrl} from '../../dashscope.js';
import {streamOverWebSocket} from '../socket.js';
import type {SynthesizerDefinition} from '../types.js';

const SAMPLE_RATE = 24_000;

type ServerEvent = {header?: {event?: string; error_code?: string; error_message?: string}};

// DashScope's speech synthesis (qwen-audio-3.1-tts-plus and the other Qwen-Audio / CosyVoice models)
// over its WebSocket protocol: run-task, then the text, then finish-task, with the audio coming back
// as binary frames of 24 kHz PCM.
export const dashscope: SynthesizerDefinition = {
	get defaults() {
		return {apiKey: dashscopeApiKey(), baseUrl: dashscopeBaseUrl(), model: 'qwen-audio-3.1-tts-plus', voice: 'longanhuan_v3.1'};
	},
	create({apiKey, baseUrl, model, voice}) {
		if (!apiKey) throw new Error('no API key: set DASHSCOPE_API_KEY, PURFECT_SPEECH_DASHSCOPE_API_KEY or speech.providers.dashscope.apiKey');
		const url = `${baseUrl!.replace(/^http/, 'ws').replace(/\/$/, '')}/api-ws/v1/inference`;
		return {
			sampleRate: SAMPLE_RATE,
			maxChars: 2000, // a cap of ours, not the service's: it keeps one reading short and cheap
			synthesize(text, onAudio, signal) {
				const taskId = randomUUID().replaceAll('-', '');
				const send = (action: string, payload: object) => ({header: {action, task_id: taskId, streaming: 'duplex'}, payload});
				return streamOverWebSocket({
					service: 'DashScope API',
					url,
					headers: {Authorization: `bearer ${apiKey}`},
					signal,
					onOpen: channel =>
						channel.send(
							send('run-task', {
								task_group: 'audio',
								task: 'tts',
								function: 'SpeechSynthesizer',
								model,
								parameters: {text_type: 'PlainText', voice, format: 'pcm', sample_rate: SAMPLE_RATE},
								input: {},
							}),
						),
					onMessage(data, channel) {
						if (typeof data !== 'string') return onAudio(Buffer.from(data));
						const {header} = JSON.parse(data) as ServerEvent;
						if (header?.event === 'task-started') {
							channel.send(send('continue-task', {input: {text}}));
							channel.send(send('finish-task', {input: {}}));
						} else if (header?.event === 'task-finished') {
							channel.finish();
						} else if (header?.event === 'task-failed') {
							channel.finish(new Error(header.error_message ?? header.error_code ?? 'the DashScope API reported a failure'));
						}
					},
				});
			},
		};
	},
};
