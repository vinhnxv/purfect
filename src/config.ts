import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename, join} from 'node:path';

export const BACKENDS = ['claude', 'codex'] as const;
export type Backend = (typeof BACKENDS)[number];

// Valid values for `claude --effort`. Codex effort levels vary per model, so Codex validates its own.
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// Resolved settings for the active backend. Unset effort falls back to the backend CLI's own default.
export type Config = {backend: Backend; model?: string; effort?: string};

type BackendSettings = {model?: string; effort?: string};
type ConfigFile = {backend?: Backend} & Partial<Record<Backend, BackendSettings>>;

const DEFAULT_BACKEND: Backend = 'claude';
const DEFAULT_MODELS: Record<Backend, string> = {claude: 'haiku', codex: 'gpt-6-luna'};

export const CONFIG_PATH = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'purfect', 'config.json');

// Precedence: environment (PURFECT_*) > config file > defaults.
// The default backend is the CLI that launched us (Ctrl+G), falling back to claude.
// Per-host overrides go through env: the `env` block of .claude/settings.json for Claude Code,
// or the command that launches Codex.
export function loadConfig(): Config {
	const file = readConfigFile();
	const backend = check(process.env.PURFECT_BACKEND || undefined, BACKENDS, 'PURFECT_BACKEND') ?? file.backend ?? detectHostCli() ?? DEFAULT_BACKEND;
	const settings = file[backend] ?? {};
	const effort = process.env.PURFECT_EFFORT || settings.effort;
	if (backend === 'claude') check(effort, CLAUDE_EFFORTS, process.env.PURFECT_EFFORT ? 'PURFECT_EFFORT' : `"claude.effort" in ${CONFIG_PATH}`);
	return {
		backend,
		model: process.env.PURFECT_MODEL || settings.model || DEFAULT_MODELS[backend],
		effort,
	};
}

function readConfigFile(): ConfigFile {
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
	const result: ConfigFile = {backend: check(data.backend, BACKENDS, `"backend" in ${CONFIG_PATH}`)};
	for (const backend of BACKENDS) {
		const section = data[backend];
		if (section === undefined) continue;
		if (!isObject(section)) throw new Error(`"${backend}" in ${CONFIG_PATH} must be an object`);
		for (const key of ['model', 'effort'] as const) {
			if (section[key] !== undefined && typeof section[key] !== 'string') {
				throw new Error(`"${backend}.${key}" in ${CONFIG_PATH} must be a string`);
			}
		}
		result[backend] = {model: section.model as string | undefined, effort: section.effort as string | undefined};
	}
	return result;
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
		if ((BACKENDS as readonly string[]).includes(proc.name)) return proc.name as Backend;
		pid = proc.ppid;
	}
	return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function check<T extends string>(value: unknown, allowed: readonly T[], source: string): T | undefined {
	if (value === undefined) return undefined;
	if (!allowed.includes(value as T)) throw new Error(`${source} must be one of ${allowed.join(', ')}`);
	return value as T;
}
