import {CONFIG_PATH, parseBoolean, readRawConfig, section, text} from '../config.js';
import {SYNTHESIZERS} from './providers/index.js';
import type {SpeechSettings} from './types.js';

// Reading aloud has its own block in the config file ("speech") and its own PURFECT_SPEECH_*
// variables. It shares nothing with the rewrite backend or with voice input, so each can use a
// different provider, key and endpoint.
export type SpeechConfig = {
	enabled: boolean;
	provider: string;
	settings: SpeechSettings;
};

// The Realtime API is OpenAI's replacement for /audio/speech, whose models shut down on 2027-01-06.
const DEFAULT_PROVIDER = 'openai-realtime';

// Precedence: PURFECT_SPEECH_* environment > config file > defaults.
export function loadSpeechConfig(): SpeechConfig {
	const file = section(readRawConfig(), 'speech', 'speech');
	const env = (name: string) => process.env[`PURFECT_SPEECH_${name}`] || undefined;

	const provider = env('PROVIDER') ?? text(file.provider, '"speech.provider"') ?? DEFAULT_PROVIDER;
	const definition = Object.hasOwn(SYNTHESIZERS, provider) ? SYNTHESIZERS[provider] : undefined;
	if (!definition) {
		throw new Error(`Unknown speech provider "${provider}" (PURFECT_SPEECH_PROVIDER or "speech.provider" in ${CONFIG_PATH}); use one of: ${Object.keys(SYNTHESIZERS).join(', ')}`);
	}

	const mine = section(section(file, 'providers', 'speech.providers'), provider, `speech.providers.${provider}`);
	const prefix = provider.toUpperCase().replace(/\W/g, '_');
	const setting = (name: keyof SpeechSettings, suffix: string) =>
		env(`${prefix}_${suffix}`) ?? text(mine[name], `"speech.providers.${provider}.${name}"`) ?? definition.defaults[name];

	return {
		enabled: parseBoolean(env('ENABLED'), 'PURFECT_SPEECH_ENABLED') ?? parseBoolean(file.enabled, `"speech.enabled" in ${CONFIG_PATH}`) ?? false,
		provider,
		settings: {apiKey: setting('apiKey', 'API_KEY'), baseUrl: setting('baseUrl', 'BASE_URL'), model: setting('model', 'MODEL'), voice: setting('voice', 'VOICE')},
	};
}
