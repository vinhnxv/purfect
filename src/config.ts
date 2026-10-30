import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename, dirname, join} from 'node:path';

export const BACKENDS = ['claude', 'codex', 'openai'] as const;
export type Backend = (typeof BACKENDS)[number];

// Languages for the rewrite target. `name` is what the model is told; `native` is what the picker shows.
// The interface and the explanations are limited to DISPLAY_CODES, the languages with a message bundle.
export const LANGUAGES = [
	{code: 'en', name: 'English', native: 'English'},
	{code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt'},
	{code: 'zh', name: 'Chinese (Simplified)', native: '简体中文'},
	{code: 'ja', name: 'Japanese', native: '日本語'},
	{code: 'ko', name: 'Korean', native: '한국어'},
	{code: 'fr', name: 'French', native: 'Français'},
	{code: 'de', name: 'German', native: 'Deutsch'},
	{code: 'es', name: 'Spanish', native: 'Español'},
	{code: 'pt', name: 'Portuguese', native: 'Português'},
	{code: 'it', name: 'Italian', native: 'Italiano'},
	{code: 'ru', name: 'Russian', native: 'Русский'},
	{code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia'},
	{code: 'th', name: 'Thai', native: 'ไทย'},
	{code: 'hi', name: 'Hindi', native: 'हिन्दी'},
	{code: 'ar', name: 'Arabic', native: 'العربية'},
	{code: 'tr', name: 'Turkish', native: 'Türkçe'},
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const DISPLAY_CODES = ['en', 'vi', 'fr', 'de', 'it', 'es', 'pt', 'ja', 'zh', 'ko'] as const;
export type DisplayCode = (typeof DISPLAY_CODES)[number];
export const DISPLAY_LANGUAGES = LANGUAGES.filter(l => (DISPLAY_CODES as readonly string[]).includes(l.code));

const LANGUAGE_CODES = LANGUAGES.map(l => l.code);

export const languageName = (code: LanguageCode) => LANGUAGES.find(l => l.code === code)!.name;
export const languageLabel = (code: LanguageCode) => {
	const language = LANGUAGES.find(l => l.code === code)!;
	return `${language.native} (${code})`;
};

// Valid values for `claude --effort`. Codex effort levels vary per model, so Codex validates its own.
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// CLIs that can launch purfect as their editor; each maps to the backend of the same name.
const HOST_CLIS: readonly Backend[] = ['claude', 'codex'];

// Settings editable in the app (and the environment variable that overrides each).
export const ENV_NAMES = {
	targetLanguage: 'PURFECT_TARGET_LANG',
	displayLanguage: 'PURFECT_DISPLAY_LANG',
	backend: 'PURFECT_BACKEND',
	model: 'PURFECT_MODEL',
	effort: 'PURFECT_EFFORT',
	languageTutor: 'PURFECT_LANGUAGE_TUTOR',
	promptTutor: 'PURFECT_PROMPT_TUTOR',
	rewriteInstructions: 'PURFECT_REWRITE_INSTRUCTIONS',
	languageInstructions: 'PURFECT_LANGUAGE_INSTRUCTIONS',
	promptInstructions: 'PURFECT_PROMPT_INSTRUCTIONS',
	ide: 'PURFECT_IDE',
} as const;
export type SettingKey = keyof typeof ENV_NAMES;

// Where each tutor and instruction setting lives in the config file:
//   {"tutors": {"language": {"enabled": true, "instructions": "…"}, "prompt": {…}}, "rewrite": {"instructions": "…"}}
const FILE_PATHS = {
	languageTutor: ['tutors', 'language', 'enabled'],
	promptTutor: ['tutors', 'prompt', 'enabled'],
	languageInstructions: ['tutors', 'language', 'instructions'],
	promptInstructions: ['tutors', 'prompt', 'instructions'],
	rewriteInstructions: ['rewrite', 'instructions'],
	ide: ['ide'],
} as const;
type TutorKey = keyof typeof FILE_PATHS;

// Resolved settings for the active backend. Unset effort falls back to the backend's own default.
// baseUrl and apiKey apply to the openai backend only.
export type Config = {
	backend: Backend;
	targetLanguage: LanguageCode;
	displayLanguage: DisplayCode;
	// The two tutors shown under a rewrite. Switching one off drops its section from the prompt, so
	// the model does not generate it. Instructions are extra user guidance added to that section.
	languageTutor: boolean;
	promptTutor: boolean;
	rewriteInstructions?: string;
	languageInstructions?: string;
	promptInstructions?: string;
	// Command that opens a file in the user's IDE and waits until it is closed (the /ide command).
	ide?: string;
	model?: string;
	effort?: string;
	baseUrl?: string;
	apiKey?: string;
};

const SETTING_KEYS = ['model', 'effort', 'baseUrl', 'apiKey'] as const;
type BackendSettings = Partial<Record<(typeof SETTING_KEYS)[number], string>>;
type ConfigFile = {
	backend?: Backend;
	targetLanguage?: LanguageCode;
	displayLanguage?: DisplayCode;
	languageTutor?: boolean;
	promptTutor?: boolean;
	rewriteInstructions?: string;
	languageInstructions?: string;
	promptInstructions?: string;
	ide?: string;
} & Partial<Record<Backend, BackendSettings>>;

const DEFAULT_BACKEND: Backend = 'claude';
const DEFAULT_TARGET_LANGUAGE: LanguageCode = 'en';
const DEFAULT_DISPLAY_LANGUAGE: DisplayCode = 'en';
const DEFAULT_MODELS: Record<Backend, string> = {claude: 'haiku', codex: 'gpt-6-luna', openai: 'gpt-6-luna'};
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export const CONFIG_PATH = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'purfect', 'config.json');

// Precedence: environment (PURFECT_*) > config file > defaults.
// The default backend is the CLI that launched us (Ctrl+G), falling back to claude; an explicit
// `chosenBackend` (picked inside the app) beats all of them.
// Per-host overrides go through env: the `env` block of .claude/settings.json for Claude Code,
// or the command that launches Codex.
export function loadConfig(chosenBackend?: Backend): Config {
	const file = readConfigFile();
	const backend =
		chosenBackend ?? check(process.env[ENV_NAMES.backend] || undefined, BACKENDS, ENV_NAMES.backend) ?? file.backend ?? detectHostCli() ?? DEFAULT_BACKEND;
	const settings = file[backend] ?? {};
	const effort = process.env[ENV_NAMES.effort] || settings.effort;
	if (backend === 'claude') check(effort, CLAUDE_EFFORTS, process.env[ENV_NAMES.effort] ? ENV_NAMES.effort : `"claude.effort" in ${CONFIG_PATH}`);
	return {
		backend,
		targetLanguage: parseLanguage(process.env[ENV_NAMES.targetLanguage], ENV_NAMES.targetLanguage) ?? file.targetLanguage ?? DEFAULT_TARGET_LANGUAGE,
		displayLanguage: (parseLanguage(process.env[ENV_NAMES.displayLanguage], ENV_NAMES.displayLanguage, DISPLAY_CODES) as DisplayCode | undefined) ?? file.displayLanguage ?? DEFAULT_DISPLAY_LANGUAGE,
		languageTutor: parseBoolean(process.env[ENV_NAMES.languageTutor], ENV_NAMES.languageTutor) ?? file.languageTutor ?? true,
		promptTutor: parseBoolean(process.env[ENV_NAMES.promptTutor], ENV_NAMES.promptTutor) ?? file.promptTutor ?? true,
		rewriteInstructions: process.env[ENV_NAMES.rewriteInstructions] || file.rewriteInstructions,
		languageInstructions: process.env[ENV_NAMES.languageInstructions] || file.languageInstructions,
		promptInstructions: process.env[ENV_NAMES.promptInstructions] || file.promptInstructions,
		ide: process.env[ENV_NAMES.ide] || file.ide,
		model: process.env[ENV_NAMES.model] || settings.model || DEFAULT_MODELS[backend],
		effort,
		...(backend === 'openai' && {
			baseUrl: process.env.PURFECT_BASE_URL || settings.baseUrl || DEFAULT_OPENAI_BASE_URL,
			apiKey: process.env.PURFECT_API_KEY || settings.apiKey || process.env.OPENAI_API_KEY,
		}),
	};
}

// Saves one setting to the config file and returns the session config with it applied. The session
// takes the value as chosen even when an environment variable would override it on the next launch.
// Everything else in the file (API keys, other backends) is left as it was.
export function saveSetting(current: Config, key: SettingKey, value: string): Config {
	if (key === 'targetLanguage') {
		const language = parseLanguage(value, key)!;
		updateConfigFile(data => void (data[key] = language));
		return {...current, targetLanguage: language};
	}
	if (key === 'displayLanguage') {
		const language = parseLanguage(value, key, DISPLAY_CODES) as DisplayCode;
		updateConfigFile(data => void (data[key] = language));
		return {...current, displayLanguage: language};
	}
	if (key === 'backend') {
		const backend = check(value, BACKENDS, key)!;
		updateConfigFile(data => void (data.backend = backend));
		const {model, effort, baseUrl, apiKey} = loadConfig(backend);
		return {...current, backend, model, effort, baseUrl, apiKey};
	}
	if (key === 'languageTutor' || key === 'promptTutor') {
		const enabled = parseBoolean(value, key)!;
		updateConfigFile(data => setPath(data, FILE_PATHS[key], enabled));
		return {...current, [key]: enabled};
	}
	if (key in FILE_PATHS) {
		// The tutor and rewrite instructions; blank removes them.
		const text = value.trim() || undefined;
		updateConfigFile(data => setPath(data, FILE_PATHS[key as TutorKey], text));
		return {...current, [key]: text};
	}
	// model and effort belong to the active backend; blank clears the override.
	const setting = value.trim() || undefined;
	if (key === 'effort' && current.backend === 'claude') check(setting, CLAUDE_EFFORTS, key);
	updateConfigFile(data => {
		const section = (isObject(data[current.backend]) ? data[current.backend] : (data[current.backend] = {})) as Record<string, unknown>;
		if (setting) section[key] = setting;
		else delete section[key];
	});
	return {...current, [key]: setting ?? (key === 'model' ? DEFAULT_MODELS[current.backend] : undefined)};
}

function setPath(data: Record<string, unknown>, path: readonly string[], value: boolean | string | undefined): void {
	let node = data;
	for (const name of path.slice(0, -1)) node = (isObject(node[name]) ? node[name] : (node[name] = {})) as Record<string, unknown>;
	const last = path[path.length - 1]!;
	if (value === undefined) delete node[last];
	else node[last] = value;
}

export function readRawConfig(): Record<string, unknown> {
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
	if (!isObject(data)) throw new Error(`${CONFIG_PATH} must contain a JSON object`);
	return data;
}

// A new file may hold an API key, so it starts private; an existing file keeps its permissions.
function updateConfigFile(mutate: (data: Record<string, unknown>) => void): void {
	const data = readRawConfig();
	mutate(data);
	mkdirSync(dirname(CONFIG_PATH), {recursive: true});
	writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2) + '\n', {mode: 0o600});
}

function readConfigFile(): ConfigFile {
	const data = readRawConfig();
	const result: ConfigFile = {
		backend: check(data.backend, BACKENDS, `"backend" in ${CONFIG_PATH}`),
		targetLanguage: parseLanguage(data.targetLanguage, `"targetLanguage" in ${CONFIG_PATH}`),
		displayLanguage: parseLanguage(data.displayLanguage, `"displayLanguage" in ${CONFIG_PATH}`, DISPLAY_CODES) as DisplayCode | undefined,
	};
	readTutors(data, result);
	if (data.ide !== undefined) {
		if (typeof data.ide !== 'string') throw new Error(`"ide" in ${CONFIG_PATH} must be a string`);
		result.ide = data.ide || undefined;
	}
	for (const backend of BACKENDS) {
		const section = data[backend];
		if (section === undefined) continue;
		if (!isObject(section)) throw new Error(`"${backend}" in ${CONFIG_PATH} must be an object`);
		const settings: BackendSettings = {};
		for (const key of SETTING_KEYS) {
			if (section[key] === undefined) continue;
			if (typeof section[key] !== 'string') throw new Error(`"${backend}.${key}" in ${CONFIG_PATH} must be a string`);
			settings[key] = section[key];
		}
		result[backend] = settings;
	}
	return result;
}

// Reads the nested tutor and rewrite blocks into the flat ConfigFile fields.
function readTutors(data: Record<string, unknown>, result: ConfigFile): void {
	const section = (parent: Record<string, unknown>, name: string, where: string) => {
		if (parent[name] === undefined) return {};
		if (!isObject(parent[name])) throw new Error(`"${where}" in ${CONFIG_PATH} must be an object`);
		return parent[name];
	};
	const text = (block: Record<string, unknown>, name: string, where: string) => {
		if (block[name] === undefined) return undefined;
		if (typeof block[name] !== 'string') throw new Error(`"${where}.${name}" in ${CONFIG_PATH} must be a string`);
		return block[name];
	};
	const tutors = section(data, 'tutors', 'tutors');
	const language = section(tutors, 'language', 'tutors.language');
	const prompt = section(tutors, 'prompt', 'tutors.prompt');
	const rewrite = section(data, 'rewrite', 'rewrite');
	result.languageTutor = parseBoolean(language.enabled, `"tutors.language.enabled" in ${CONFIG_PATH}`);
	result.promptTutor = parseBoolean(prompt.enabled, `"tutors.prompt.enabled" in ${CONFIG_PATH}`);
	result.languageInstructions = text(language, 'instructions', 'tutors.language');
	result.promptInstructions = text(prompt, 'instructions', 'tutors.prompt');
	result.rewriteInstructions = text(rewrite, 'instructions', 'rewrite');
}

// Walk up the process tree to the nearest claude or codex ancestor. Env markers are not enough:
// Codex sets none, and CLAUDECODE leaks into a Codex session started from inside Claude Code.
function detectHostCli(): Backend | undefined {
	const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,comm='], {encoding: 'utf8'});
	if (ps.status !== 0) return undefined;
	const processes = new Map<number, {ppid: number; name: string}>();
	for (const line of ps.stdout.split('\n')) {
		const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
		if (match) processes.set(Number(match[1]), {ppid: Number(match[2]), name: basename(match[3].trim())});
	}
	for (let pid = process.ppid, depth = 0; pid > 1 && depth < 10; depth++) {
		const proc = processes.get(pid);
		if (!proc) break;
		if ((HOST_CLIS as readonly string[]).includes(proc.name)) return proc.name as Backend;
		pid = proc.ppid;
	}
	return undefined;
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function check<T extends string>(value: unknown, allowed: readonly T[], source: string): T | undefined {
	if (value === undefined) return undefined;
	if (!allowed.includes(value as T)) throw new Error(`${source} must be one of ${allowed.join(', ')}`);
	return value as T;
}

// Accepts true/false, or 1/0, on/off, yes/no as text (environment variables are always text).
export function parseBoolean(value: unknown, source: string): boolean | undefined {
	if (value === undefined || value === '') return undefined;
	if (typeof value === 'boolean') return value;
	const word = typeof value === 'string' ? value.trim().toLowerCase() : '';
	if (['1', 'true', 'on', 'yes'].includes(word)) return true;
	if (['0', 'false', 'off', 'no'].includes(word)) return false;
	throw new Error(`${source} must be true or false`);
}

// Accepts a code ("ja") or a name ("Japanese", "日本語"), case-insensitive; blank counts as unset.
function parseLanguage(value: unknown, source: string, allowed: readonly LanguageCode[] = LANGUAGE_CODES): LanguageCode | undefined {
	if (value === undefined || value === '') return undefined;
	const wanted = typeof value === 'string' ? value.trim().toLowerCase() : '';
	const found = LANGUAGES.find(l => allowed.includes(l.code) && [l.code, l.name, l.native].some(name => name.toLowerCase() === wanted));
	if (!found) throw new Error(`${source} must be one of ${allowed.join(', ')}`);
	return found.code;
}
