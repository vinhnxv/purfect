import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {useEffect, useState} from 'react';
import {Box, Text, render, useApp, useInput} from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import {rewrite, type Rewrite} from './rewrite.js';

type Stage = 'compose' | 'rewriting' | 'review' | 'edit';

// Editor mode: `purfect <file>` lets Claude Code / Codex use it as $EDITOR (Ctrl+G).
// The file holds the draft; approving overwrites it, quitting leaves it untouched.
const file = process.argv[2];
const initialDraft = file ? readFileSync(file, 'utf8').trim() : '';

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
		rewrite(draft, controller.signal).then(
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

await render(<App />).waitUntilExit();

if (approved && file) {
	writeFileSync(file, approved + '\n');
} else if (approved) {
	// macOS clipboard; paste into Claude Code / Codex CLI. Stdout keeps it scriptable.
	const copied = spawnSync('pbcopy', {input: approved}).status === 0;
	process.stderr.write(copied ? '✔ Approved — copied to clipboard\n' : '✔ Approved\n');
	process.stdout.write(approved + '\n');
}
