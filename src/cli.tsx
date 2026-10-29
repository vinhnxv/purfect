import {spawnSync} from 'node:child_process';
import {closeSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {useEffect, useState} from 'react';
import {Box, Text, render, useApp, useInput} from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import {loadConfig, type Config} from './config.js';
import {rewrite, type Refine, type Rewrite, type Usage} from './rewrite.js';

type Stage = 'compose' | 'rewriting' | 'review' | 'edit' | 'history';

// One entry in the version history; label says how it came about (the instruction, or what was done).
type Version = {result: Rewrite; label: string};

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

// Slash commands for the review chat box; the first letter works as a shortcut (/e = /edit).
const COMMANDS = [
	{name: 'approve', desc: 'Duyệt prompt này và đóng (Enter trống cũng vậy)'},
	{name: 'edit', desc: 'Tự sửa tay prompt tiếng Anh'},
	{name: 'history', desc: 'Xem mọi phiên bản đã chỉnh, chọn một bản để làm tiếp'},
	{name: 'undo', desc: 'Về phiên bản liền trước'},
	{name: 'redo', desc: 'Rewrite lại từ bản nháp gốc (thành một phiên bản mới)'},
	{name: 'back', desc: 'Quay lại sửa bản nháp'},
	{name: 'quit', desc: 'Thoát, không đổi gì'},
];

function App() {
	const {exit} = useApp();
	const [stage, setStage] = useState<Stage>(initialDraft ? 'rewriting' : 'compose');
	const [draft, setDraft] = useState(initialDraft);
	// Every rewrite, refinement and manual edit adds a version; nothing is ever removed, and picking
	// an old version only moves `current`, so the next change lands after the newest version.
	const [versions, setVersions] = useState<Version[]>([]);
	const [current, setCurrent] = useState(0);
	const [highlight, setHighlight] = useState(0);
	const [chat, setChat] = useState('');
	const [chatKey, setChatKey] = useState(0); // remounting the input is how Tab moves its cursor to the end
	const [pick, setPick] = useState(0);
	const [refining, setRefining] = useState<string>(); // instruction being applied; unset for a plain rewrite
	const [edited, setEdited] = useState('');
	const [error, setError] = useState<string>();
	const [notice, setNotice] = useState<string>();

	const result = versions[current]?.result;
	const canUse = Boolean(result) && !error;

	const addVersion = (version: Version) => {
		setVersions(vs => [...vs, version]);
		setCurrent(versions.length);
	};

	// A new draft starts a fresh history; redo keeps it and adds a version.
	const startRewrite = (fresh: boolean) => {
		if (fresh) {
			setVersions([]);
			setCurrent(0);
		}
		setRefining(undefined);
		setNotice(undefined);
		setStage('rewriting');
	};

	useEffect(() => {
		if (stage !== 'rewriting') return;
		const controller = new AbortController();
		const refine: Refine | undefined = refining && result ? {current: result.prompt, instruction: refining} : undefined;
		rewrite(draft, config, controller.signal, refine).then(
			r => {
				addVersion({result: r, label: refine ? refine.instruction : versions.length > 0 ? 'Rewrite lại' : 'Rewrite ban đầu'});
				setError(undefined);
				setStage('review');
			},
			(e: Error) => {
				if (controller.signal.aborted) return;
				// With an earlier version to fall back on, a failure is only a notice.
				if (versions.length > 0) setNotice(`Không làm được, giữ bản hiện tại: ${e.message}`);
				else setError(e.message);
				setStage('review');
			},
		);
		return () => controller.abort();
	}, [stage, draft]);

	// Commands matching what is typed after "/", minus the ones that cannot run right now.
	const available = (name: string) =>
		name === 'undo' ? current > 0 : name === 'history' ? versions.length > 1 : name === 'approve' || name === 'edit' ? canUse : true;
	const suggestions =
		stage === 'review' && chat.startsWith('/') && !chat.includes(' ')
			? COMMANDS.filter(c => c.name.startsWith(chat.slice(1).toLowerCase()) && available(c.name))
			: [];
	const selected = suggestions[Math.min(pick, suggestions.length - 1)];

	const move = (index: number, length: number, delta: number) => (index + delta + length) % length;

	useInput(
		(_input, key) => {
			if (stage === 'rewriting') {
				if (key.escape) setStage(versions.length > 0 ? 'review' : 'compose');
			} else if (stage === 'edit') {
				if (key.escape) setStage('review');
			} else if (stage === 'history') {
				if (key.escape) setStage('review');
				if (key.upArrow) setHighlight(h => move(h, versions.length, -1));
				if (key.downArrow) setHighlight(h => move(h, versions.length, 1));
				if (key.return) {
					setCurrent(highlight);
					setNotice(undefined);
					setStage('review');
				}
			} else if (key.escape) {
				setChat('');
			} else if (suggestions.length > 0) {
				const at = Math.min(pick, suggestions.length - 1);
				if (key.upArrow) setPick(move(at, suggestions.length, -1));
				if (key.downArrow) setPick(move(at, suggestions.length, 1));
				if (key.tab && selected) {
					setChat(`/${selected.name}`);
					setChatKey(k => k + 1);
				}
			}
		},
		{isActive: stage !== 'compose'},
	);

	const runCommand = (command: string) => {
		setNotice(undefined);
		if (!COMMANDS.some(c => c.name === command)) return setNotice(`Không có lệnh /${command}`);
		if (!available(command)) return setNotice(`Lệnh /${command} chưa dùng được lúc này`);
		if (command === 'approve') {
			approved = result!.prompt;
			exit();
		} else if (command === 'edit') {
			setEdited(result!.prompt);
			setStage('edit');
		} else if (command === 'history') {
			setHighlight(current);
			setStage('history');
		} else if (command === 'undo') {
			setCurrent(current - 1);
		} else if (command === 'redo') {
			startRewrite(false);
		} else if (command === 'back') {
			setRefining(undefined);
			setStage('compose');
		} else {
			exit();
		}
	};

	// The chat box is always on in review: text refines the prompt, /commands act, empty Enter approves.
	const submitChat = (value: string) => {
		const text = value.trim();
		setChat('');
		if (text.startsWith('/')) return runCommand(selected ? selected.name : text.slice(1).trim().toLowerCase());
		if (!text) return runCommand('approve');
		if (!canUse) return;
		setRefining(text);
		setNotice(undefined);
		setStage('rewriting');
	};

	return (
		<Box flexDirection="column" gap={1}>
			{stage === 'compose' ? (
				<Box flexDirection="column">
					<Text bold>Prompt (tiếng Việt hoặc tiếng Anh) — Enter để rewrite, Ctrl+C để thoát</Text>
					<Box>
						<Text color="cyan">› </Text>
						<TextInput value={draft} onChange={setDraft} onSubmit={value => value.trim() && startRewrite(true)} />
					</Box>
				</Box>
			) : (
				<Box flexDirection="column">
					<Text dimColor>VI: {draft}</Text>
					{versions.length > 1 && (
						<Text dimColor wrap="truncate-end">
							Phiên bản {current + 1}/{versions.length} · {versions[current]!.label}
						</Text>
					)}
				</Box>
			)}

			{stage === 'rewriting' && (
				<Text>
					<Text color="green">
						<Spinner type="dots" />
					</Text>{' '}
					{refining ? 'Đang chỉnh lại prompt…' : 'Đang rewrite sang tiếng Anh…'} (Esc để huỷ)
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

			{stage === 'review' && notice && <Text color="red">{notice}</Text>}

			{stage === 'review' && (
				<Box flexDirection="column">
					<Text dimColor>
						{canUse ? 'Nhắn để chỉnh lại (VD: ngắn hơn, thêm yêu cầu viết test) · Enter trống = duyệt · ' : ''}
						gõ / để xem lệnh
					</Text>
					<Box>
						<Text color="cyan">› </Text>
						<TextInput
							key={chatKey}
							value={chat}
							onChange={value => {
								setChat(value);
								setPick(0);
							}}
							onSubmit={submitChat}
						/>
					</Box>
					{suggestions.length > 0 && (
						<Box flexDirection="column">
							{suggestions.map(c => (
								<Text key={c.name} color={c === selected ? 'cyan' : undefined} dimColor={c !== selected}>
									{c === selected ? '❯' : ' '} /{c.name.padEnd(8)} {c.desc}
								</Text>
							))}
							<Text dimColor>  ↑↓ chọn · Tab điền · Enter chạy · Esc xoá</Text>
						</Box>
					)}
				</Box>
			)}

			{stage === 'history' && (
				<Box flexDirection="column" gap={1}>
					<Box flexDirection="column">
						<Text bold>Lịch sử phiên bản — ↑↓ chọn · Enter dùng bản này để làm tiếp · Esc huỷ</Text>
						{versions.map((v, i) => (
							<Text key={i} color={i === highlight ? 'cyan' : undefined} dimColor={i !== highlight} wrap="truncate-end">
								{i === highlight ? '❯' : ' '} v{i + 1}
								{i === current ? ' (đang dùng)' : ''} · {v.label}
							</Text>
						))}
					</Box>
					<Box borderStyle="round" borderColor="cyan" paddingX={1}>
						<Text>{versions[highlight]!.result.prompt}</Text>
					</Box>
				</Box>
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
								addVersion({result: {prompt: value.trim()}, label: 'Sửa tay'});
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
