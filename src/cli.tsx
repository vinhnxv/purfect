import {spawnSync} from 'node:child_process';
import {closeSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {useEffect, useState} from 'react';
import {Box, Text, render, useApp, useInput} from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import {loadConfig, type Config} from './config.js';
import {rewrite, type Rewrite, type Usage} from './rewrite.js';

type Stage = 'compose' | 'rewriting' | 'review' | 'edit';

// Editor mode: `purfect <file>` lets Claude Code / Codex use it as $EDITOR (Ctrl+G).
// The file holds the draft; approving overwrites it, quitting leaves it untouched.
const file = process.argv[2];
const initialDraft = file ? readFileSync(file, 'utf8').trim() : '';

let config: Config;
try {
	config = loadConfig();
} catch (e) {
	process.stderr.write(`purfect: ${(e as Error).message}\n`);
	process.exit(1);
}

let approved: string | undefined;

function App() {
	const {exit} = useApp();
	const [stage, setStage] = useState<Stage>(initialDraft ? 'rewriting' : 'compose');
	const [draft, setDraft] = useState(initialDraft);
	const [result, setResult] = useState<Rewrite>();
	const [edited, setEdited] = useState('');
	const [error, setError] = useState<string>();

	useEffect(() => {
		if (stage !== 'rewriting') return;
		const controller = new AbortController();
		rewrite(draft, config, controller.signal).then(
			r => {
				setResult(r);
				setError(undefined);
				setStage('review');
			},
			(e: Error) => {
				if (controller.signal.aborted) return;
				setError(e.message);
				setStage('review');
			},
		);
		return () => controller.abort();
	}, [stage, draft]);

	useInput(
		(input, key) => {
			if (stage === 'rewriting' && key.escape) setStage('compose');
			if (stage === 'edit' && key.escape) setStage('review');
			if (stage !== 'review') return;
			if (input === 'a' && result && !error) {
				approved = result.prompt;
				exit();
			} else if (input === 'e' && result && !error) {
				setEdited(result.prompt);
				setStage('edit');
			} else if (input === 'r') {
				setStage('rewriting');
			} else if (input === 'b') {
				setStage('compose');
			} else if (input === 'q') {
				exit();
			}
		},
		{isActive: stage !== 'compose'},
	);

	return (
		<Box flexDirection="column" gap={1}>
			{stage === 'compose' ? (
				<Box flexDirection="column">
					<Text bold>Prompt (tiếng Việt hoặc tiếng Anh) — Enter để rewrite, Ctrl+C để thoát</Text>
					<Box>
						<Text color="cyan">› </Text>
						<TextInput
							value={draft}
							onChange={setDraft}
							onSubmit={value => value.trim() && setStage('rewriting')}
						/>
					</Box>
				</Box>
			) : (
				<Text dimColor>VI: {draft}</Text>
			)}

			{stage === 'rewriting' && (
				<Text>
					<Text color="green">
						<Spinner type="dots" />
					</Text>{' '}
					Đang rewrite sang tiếng Anh… (Esc để huỷ)
				</Text>
			)}

			{stage === 'review' && error && <Text color="red">Lỗi: {error}</Text>}

			{stage === 'review' && result && !error && (
				<Box flexDirection="column" gap={1}>
					<Box borderStyle="round" borderColor="green" paddingX={1}>
						<Text>{result.prompt}</Text>
					</Box>
					{result.explanation && (
						<Box flexDirection="column">
							<Text bold>Giải thích</Text>
							{result.explanation.meaning && <Text>Nghĩa: {result.explanation.meaning}</Text>}
							{result.explanation.structure && <Text>Cấu trúc: {result.explanation.structure}</Text>}
							{result.explanation.keywords.map(k => (
								<Box key={k.original + k.term} flexDirection="column">
									<Text>
										• <Text dimColor>{k.original}</Text> → <Text color="yellow">{k.term}</Text> ({k.meaning})
									</Text>
									{k.why && <Text dimColor>  {k.why}</Text>}
								</Box>
							))}
						</Box>
					)}
				</Box>
			)}

			{stage === 'review' && result?.usage && !error && <UsageLine usage={result.usage} />}

			{stage === 'review' && (
				<Text dimColor>
					{result && !error ? '[a] approve  [e] edit  ' : ''}[r] rewrite again  [b] back  [q] quit
				</Text>
			)}

			{stage === 'edit' && (
				<Box flexDirection="column">
					<Text bold>Chỉnh sửa — Enter để lưu, Esc để huỷ</Text>
					<Box>
						<Text color="cyan">› </Text>
						<TextInput
							value={edited}
							onChange={setEdited}
							onSubmit={value => {
								if (!value.trim()) return;
								setResult({prompt: value.trim()});
								setStage('review');
							}}
						/>
					</Box>
				</Box>
			)}
		</Box>
	);
}

function UsageLine({usage}: {usage: Usage}) {
	const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
	return (
		<Text dimColor>
			{usage.model} · {k(usage.inputTokens)} in · {k(usage.outputTokens)} out
			{usage.thinkingTokens > 0 && ` (${k(usage.thinkingTokens)} thinking)`}
			{usage.costUsd !== undefined && ` · ~$${usage.costUsd.toFixed(4)}`} ·{' '}
			{(usage.durationMs / 1000).toFixed(1)}s
		</Text>
	);
}

// The host CLI may launch us with its terminal still in raw output mode (Codex does),
// so "\n" no longer returns the cursor to column 0. Restore output processing for our
// run and put the host's exact settings back afterwards.
function fixTerminalOutput(): () => void {
	if (!process.stdout.isTTY) return () => {};
	const stty = (...args: string[]) => {
		const tty = openSync('/dev/tty', 'r');
		try {
			return spawnSync('stty', args, {stdio: [tty, 'pipe', 'ignore']}).stdout?.toString().trim();
		} finally {
			closeSync(tty);
		}
	};
	const saved = stty('-g');
	stty('opost', 'onlcr');
	return () => {
		if (saved) stty(saved);
	};
}

const restoreTerminal = file ? fixTerminalOutput() : () => {};
try {
	// In editor mode we own the screen like any $EDITOR; standalone stays inline so output persists.
	await render(<App />, {alternateScreen: Boolean(file)}).waitUntilExit();
} finally {
	restoreTerminal();
}

if (approved && file) {
	writeFileSync(file, approved + '\n');
} else if (approved) {
	// macOS clipboard; paste into Claude Code / Codex CLI. Stdout keeps it scriptable.
	const copied = spawnSync('pbcopy', {input: approved}).status === 0;
	process.stderr.write(copied ? '✔ Approved — copied to clipboard\n' : '✔ Approved\n');
	process.stdout.write(approved + '\n');
}
