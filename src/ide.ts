import {spawn, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, extname, join} from 'node:path';

export type Ide = {command: string; args: string[]; name: string};

// IDEs that can be found on the PATH, each with the flag that makes its launcher wait until the
// file is closed. Only VS Code has been tested. $EDITOR is not used: purfect is often $EDITOR itself.
const KNOWN: [command: string, wait: string][] = [
	['code', '--wait'],
	['cursor', '--wait'],
	['windsurf', '--wait'],
	['zed', '--wait'],
	['subl', '--wait'],
];

// Splits a command line into words, keeping quoted parts together ("My Editor" --wait).
export function splitCommand(text: string): string[] {
	const words: string[] = [];
	let word = '';
	let started = false;
	let quote: string | undefined;
	for (const ch of text) {
		if (quote) {
			if (ch === quote) quote = undefined;
			else word += ch;
		} else if (ch === '"' || ch === "'") {
			quote = ch;
			started = true;
		} else if (/\s/.test(ch)) {
			if (started) words.push(word);
			word = '';
			started = false;
		} else {
			word += ch;
			started = true;
		}
	}
	if (quote) throw new Error('the IDE command has an unclosed quote');
	if (started) words.push(word);
	return words;
}

const onPath = (command: string) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {stdio: 'ignore'}).status === 0;

// The configured command (`ide` / PURFECT_IDE, e.g. "code --wait"), else the first known IDE on the PATH.
export function resolveIde(setting?: string): Ide {
	if (setting?.trim()) {
		const [command, ...args] = splitCommand(setting);
		if (!command) throw new Error('the IDE command is empty');
		return {command, args, name: basename(command, extname(command))};
	}
	for (const [command, wait] of KNOWN) {
		if (onPath(command)) return {command, args: [wait], name: command};
	}
	throw new Error(`no IDE found on the PATH (looked for ${KNOWN.map(k => k[0]).join(', ')}); set "ide" in the config file or PURFECT_IDE, e.g. "code --wait"`);
}

// Opens the text in the IDE and resolves with the saved text once the file is closed there.
// The IDE command has to block until then (that is what --wait does); aborting only stops waiting.
export async function editInIde(text: string, ide: Ide, signal: AbortSignal): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), 'purfect-ide-'));
	const file = join(dir, 'prompt.md');
	try {
		writeFileSync(file, text + '\n');
		await new Promise<void>((resolve, reject) => {
			const child = spawn(ide.command, [...ide.args, file], {stdio: 'ignore', shell: process.platform === 'win32'});
			const cancel = () => {
				child.kill();
				reject(new Error('cancelled'));
			};
			signal.addEventListener('abort', cancel, {once: true});
			child.on('error', e => {
				signal.removeEventListener('abort', cancel);
				reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? new Error(`${ide.command} was not found; check the "ide" setting`) : e);
			});
			child.on('close', code => {
				signal.removeEventListener('abort', cancel);
				if (code === 0) resolve();
				else reject(new Error(`${ide.name} exited with code ${code}; its command must wait until the file is closed (e.g. --wait)`));
			});
		});
		return readFileSync(file, 'utf8').trim();
	} finally {
		rmSync(dir, {recursive: true, force: true});
	}
}
