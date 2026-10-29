import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];
// effort is unset by default: claude then uses the model's own default.
export type Config = {model: string; effort?: Effort};

const DEFAULTS: Config = {model: 'haiku'};

export const CONFIG_PATH = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'purfect', 'config.json');

// Precedence: environment (PURFECT_*) > config file > defaults.
// Per-project overrides go through env, e.g. the `env` block of .claude/settings.json.
export function loadConfig(): Config {
	const file = readConfigFile();
	return {
		model: process.env.PURFECT_MODEL || file.model || DEFAULTS.model,
		effort: checkEffort(process.env.PURFECT_EFFORT || undefined, 'PURFECT_EFFORT') ?? file.effort,
	};
}

function readConfigFile(): Partial<Config> {
	let text: string;
	try {
		text = readFileSync(CONFIG_PATH, 'utf8');
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
		throw e;
	}
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (e) {
		throw new Error(`Invalid JSON in ${CONFIG_PATH}: ${(e as Error).message}`);
	}
	if (typeof data !== 'object' || data === null || Array.isArray(data)) {
		throw new Error(`${CONFIG_PATH} must contain a JSON object`);
	}
	const {model, effort} = data as Record<string, unknown>;
	if (model !== undefined && typeof model !== 'string') {
		throw new Error(`"model" in ${CONFIG_PATH} must be a string`);
	}
	return {model, effort: checkEffort(effort, `"effort" in ${CONFIG_PATH}`)};
}

function checkEffort(value: unknown, source: string): Effort | undefined {
	if (value === undefined) return undefined;
	if (!EFFORTS.includes(value as Effort)) {
		throw new Error(`${source} must be one of ${EFFORTS.join(', ')}`);
	}
	return value as Effort;
}
