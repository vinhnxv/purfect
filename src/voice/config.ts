import {CONFIG_PATH, isObject, parseBoolean, readRawConfig} from '../config.js';
import {PROVIDERS} from './providers/index.js';
import type {ProviderSettings} from './types.js';

// Voice has its own block in the config file ("voice") and its own PURFECT_VOICE_* variables. It
// shares nothing with the rewrite backend, so it can use a different provider, key and endpoint.
export type VoiceConfig = {
	enabled: boolean;
	// Start recording as soon as the compose screen opens (an empty Ctrl+G).
	autoStart: boolean;
	provider: string;
	maxSeconds: number;
	// Microphone name (or index); the system default when unset.
	device?: string;
	settings: ProviderSettings;
};

const DEFAULT_PROVIDER = 'openai';
const DEFAULT_MAX_SECONDS = 60;
const MAX_SECONDS_LIMIT = 300;

const text = (value: unknown, where: string) => {
	if (value === undefined) return undefined;
	if (typeof value !== 'string') throw new Error(`${where} in ${CONFIG_PATH} must be a string`);
	return value || undefined;
};

const section = (parent: Record<string, unknown>, name: string, where: string): Record<string, unknown> => {
	if (parent[name] === undefined) return {};
	if (!isObject(parent[name])) throw new Error(`"${where}" in ${CONFIG_PATH} must be an object`);
	return parent[name];
};

// Precedence: PURFECT_VOICE_* environment > config file > defaults.
export function loadVoiceConfig(): VoiceConfig {
	const file = section(readRawConfig(), 'voice', 'voice');
	const env = (name: string) => process.env[`PURFECT_VOICE_${name}`] || undefined;
	const flag = (name: string, value: unknown) =>
		parseBoolean(env(name), `PURFECT_VOICE_${name}`) ?? parseBoolean(value, `"voice.${name.toLowerCase()}" in ${CONFIG_PATH}`) ?? false;

	const provider = env('PROVIDER') ?? text(file.provider, '"voice.provider"') ?? DEFAULT_PROVIDER;
	const definition = Object.hasOwn(PROVIDERS, provider) ? PROVIDERS[provider] : undefined;
	if (!definition) {
		throw new Error(`Unknown voice provider "${provider}" (PURFECT_VOICE_PROVIDER or "voice.provider" in ${CONFIG_PATH}); use one of: ${Object.keys(PROVIDERS).join(', ')}`);
	}

	const maxSeconds = Number(env('MAX_SECONDS') ?? file.maxSeconds ?? DEFAULT_MAX_SECONDS);
	if (!Number.isInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > MAX_SECONDS_LIMIT) {
		throw new Error(`voice max seconds (PURFECT_VOICE_MAX_SECONDS or "voice.maxSeconds" in ${CONFIG_PATH}) must be a whole number from 1 to ${MAX_SECONDS_LIMIT}`);
	}

	const mine = section(section(file, 'providers', 'voice.providers'), provider, `voice.providers.${provider}`);
	const prefix = provider.toUpperCase().replace(/\W/g, '_');
	const setting = (name: keyof ProviderSettings, suffix: string) =>
		env(`${prefix}_${suffix}`) ?? text(mine[name], `"voice.providers.${provider}.${name}"`) ?? definition.defaults[name];

	return {
		enabled: flag('ENABLED', file.enabled),
		autoStart: flag('AUTO_START', file.autoStart),
		provider,
		maxSeconds,
		device: env('DEVICE') ?? text(file.device, '"voice.device"'),
		settings: {apiKey: setting('apiKey', 'API_KEY'), baseUrl: setting('baseUrl', 'BASE_URL'), model: setting('model', 'MODEL')},
	};
}
