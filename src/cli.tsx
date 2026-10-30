import {spawnSync} from 'node:child_process';
import {closeSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {useEffect, useState} from 'react';
import {Box, Text, render, useApp, useInput} from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import {IPA_LANGUAGES, languageLabel, loadConfig, saveSetting, type Config, type SettingKey} from './config.js';
import {loadVoiceConfig, type VoiceConfig} from './voice/config.js';
import {NoSpeechError} from './voice/dictation.js';
import {loadSpeechConfig, type SpeechConfig} from './speech/config.js';
import {SYNTHESIZERS} from './speech/providers/index.js';
import {TooLongError} from './speech/speak.js';
import {useSpeech} from './speech/use-speech.js';
import {useDictation} from './voice/use-dictation.js';
import {COMMAND_NAMES, messages} from './i18n.js';
import {ipa, rewrite, type Refine, type Rewrite, type Usage} from './rewrite.js';
import {editInIde, resolveIde, type Ide} from './ide.js';
import {Settings} from './settings.js';

type Stage = 'compose' | 'rewriting' | 'review' | 'edit' | 'ide' | 'ipa' | 'history' | 'config';

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

// Voice input has its own config. A mistake in it only disables voice, with the reason shown when used.
let voice: VoiceConfig | undefined;
let voiceProblem: string | undefined;
try {
	voice = loadVoiceConfig();
} catch (e) {
	voiceProblem = (e as Error).message;
}

// Reading aloud has its own config too, with the same soft failure.
let speech: SpeechConfig | undefined;
let speechProblem: string | undefined;
try {
	speech = loadSpeechConfig();
} catch (e) {
	speechProblem = (e as Error).message;
}

// Some voices read only some languages (Speechmatics: English only). Without a speech config nothing blocks.
const speaksTarget = (language: string) => {
	const only = speech && SYNTHESIZERS[speech.provider]?.languages;
	return !only || only.includes(language);
};

let approved: string | undefined;

function App() {
	const {exit} = useApp();
	// Session settings: /config changes them here and saves them to the config file.
	const [cfg, setCfg] = useState(config);
	const msgs = messages(cfg.displayLanguage);
	const [stage, setStage] = useState<Stage>(initialDraft ? 'rewriting' : 'compose');
	const [draft, setDraft] = useState(initialDraft);
	// Every rewrite, refinement and manual edit adds a version; nothing is ever removed, and picking
	// an old version only moves `current`, so the next change lands after the newest version.
	const [versions, setVersions] = useState<Version[]>([]);
	const [current, setCurrent] = useState(0);
	const [highlight, setHighlight] = useState(0);
	const [chat, setChat] = useState('');
	const [chatKey, setChatKey] = useState(0); // remounting the input is how Tab moves its cursor to the end
	const [draftKey, setDraftKey] = useState(0); // same for the draft box, after voice adds text
	const dictation = useDictation(voice);
	const speaking = useSpeech(speech);
	const [pick, setPick] = useState(0);
	const [refining, setRefining] = useState<{instruction: string; improve?: boolean}>(); // unset for a plain rewrite
	const [warnedFor, setWarnedFor] = useState<string>(); // prompt we already warned about unfilled placeholders
	const [edited, setEdited] = useState('');
	const [ipaText, setIpaText] = useState<{prompt: string; text: string}>(); // IPA shown under the prompt it was made for
	const [ide, setIde] = useState<Ide>(); // the IDE the prompt is open in while stage is 'ide'
	const [error, setError] = useState<string>();
	const [noticeState, setNoticeState] = useState<{text: string; info?: boolean}>();
	// Warnings are red; `info` marks a plain confirmation.
	const setNotice = (text?: string, info = false) => setNoticeState(text ? {text, info} : undefined);
	const notice = noticeState?.text;

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
		const refine: Refine | undefined = refining && result ? {current: result.prompt, ...refining} : undefined;
		rewrite(draft, cfg, controller.signal, refine).then(
			r => {
				if (refine?.improve && (r.prompt === refine.current || r.tips?.length === 0)) {
					setNotice(msgs.alreadyClear);
				} else {
					addVersion({
						result: r,
						label: refine?.improve ? msgs.labels.improve : refine ? refine.instruction : versions.length > 0 ? msgs.labels.again : msgs.labels.first,
					});
				}
				setError(undefined);
				setStage('review');
			},
			(e: Error) => {
				if (controller.signal.aborted) return;
				// With an earlier version to fall back on, a failure is only a notice.
				if (versions.length > 0) setNotice(msgs.kept(e.message));
				else setError(e.message);
				setStage('review');
			},
		);
		return () => controller.abort();
	}, [stage, draft]);

	// Esc stops the reading, and it never outlives the prompt it was reading.
	useInput((_input, key) => key.escape && speaking.stop(), {isActive: speaking.phase !== 'idle'});
	useEffect(() => {
		if (stage !== 'review') speaking.stop();
	}, [stage]);

	// /ipa: asks the backend for the IPA of the current prompt, then shows it under the prompt.
	useEffect(() => {
		if (stage !== 'ipa') return;
		const controller = new AbortController();
		const prompt = result!.prompt;
		ipa(prompt, cfg, controller.signal).then(
			text => {
				setIpaText({prompt, text});
				setStage('review');
			},
			(e: Error) => {
				if (controller.signal.aborted) return;
				setNotice(e.message);
				setStage('review');
			},
		);
		return () => controller.abort();
	}, [stage]);

	// /ide: the prompt opens in the IDE; closing the file there adds the saved text as a new version.
	useEffect(() => {
		if (stage !== 'ide' || !ide) return;
		const controller = new AbortController();
		editInIde(result!.prompt, ide, controller.signal).then(
			text => {
				if (text && text !== result!.prompt) addVersion({result: {prompt: text}, label: msgs.labels.manual});
				else setNotice(msgs.ide.unchanged, true);
				setStage('review');
			},
			(e: Error) => {
				if (controller.signal.aborted) return;
				setNotice(e.message);
				setStage('review');
			},
		);
		return () => controller.abort();
	}, [stage, ide]);

	// Commands matching what is typed after "/", minus the ones that cannot run right now.
	const available = (name: string) =>
		name === 'undo' ? current > 0 : name === 'history' ? versions.length > 1 : name === 'approve' || name === 'edit' || name === 'ide' || name === 'improve' ? canUse : name === 'speak' ? canUse && speaksTarget(cfg.targetLanguage) : name === 'ipa' ? canUse && IPA_LANGUAGES.includes(cfg.targetLanguage) : true;
	const commands = COMMAND_NAMES.map(name => ({name, desc: msgs.commands[name]}));
	const suggestions =
		stage === 'review' && chat.startsWith('/') && !chat.includes(' ')
			? commands.filter(c => c.name.startsWith(chat.slice(1).toLowerCase()) && available(c.name))
			: [];
	const selected = suggestions[Math.min(pick, suggestions.length - 1)];

	const move = (index: number, length: number, delta: number) => (index + delta + length) % length;

	// Speech becomes text in the draft (compose) or the chat box (review); the user checks it, then presses Enter.
	const startVoice = (into: 'draft' | 'chat') => {
		setNotice(undefined);
		if (!voice?.enabled) return setNotice(voiceProblem ?? msgs.voice.off);
		try {
			dictation.start({
				onText: t => {
					if (into === 'draft') {
						setDraft(d => (d.trim() ? `${d.trim()} ${t.text}` : t.text));
						setDraftKey(k => k + 1);
					} else {
						setChat(t.text);
						setChatKey(k => k + 1);
					}
					const detail = [t.seconds !== undefined && `${Math.round(t.seconds)}s`, t.costUsd !== undefined && `~$${t.costUsd.toFixed(t.costUsd < 0.001 ? 5 : 4)}`].filter(Boolean).join(' · ');
					setNotice(msgs.voice.done(detail), true);
				},
				onError: e => setNotice(e instanceof NoSpeechError ? msgs.voice.noSpeech : msgs.voice.error(e.message)),
			});
		} catch (e) {
			setNotice(msgs.voice.error((e as Error).message));
		}
	};

	// An empty Ctrl+G can open straight into recording.
	useEffect(() => {
		if (voice?.enabled && voice.autoStart && stage === 'compose') startVoice('draft');
	}, []);

	// Tab starts and stops recording. While it runs, Enter stops it instead of sending the box.
	useInput(
		(_input, key) => {
			if (dictation.phase === 'recording') {
				if (key.tab || key.return) void dictation.stop();
				else if (key.escape) dictation.cancel();
			} else if (dictation.phase === 'transcribing') {
				if (key.escape) dictation.cancel();
			} else if (key.tab) {
				startVoice(stage === 'compose' ? 'draft' : 'chat');
			}
		},
		{isActive: dictation.phase !== 'idle' || stage === 'compose' || (stage === 'review' && chat === '')},
	);

	useInput(
		(_input, key) => {
			if (stage === 'rewriting') {
				if (key.escape) setStage(versions.length > 0 ? 'review' : 'compose');
			} else if (stage === 'edit' || stage === 'ide' || stage === 'ipa') {
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
		{isActive: stage !== 'compose' && stage !== 'config' && dictation.phase === 'idle'},
	);

	const runCommand = (command: string) => {
		setNotice(undefined);
		if (!(COMMAND_NAMES as readonly string[]).includes(command)) return setNotice(msgs.unknownCommand(command));
		if (command === 'ipa' && !IPA_LANGUAGES.includes(cfg.targetLanguage)) return setNotice(msgs.ipa.unsupported(languageLabel(cfg.targetLanguage)));
		if (command === 'speak' && speech?.enabled && !speaksTarget(cfg.targetLanguage)) {
			const only = SYNTHESIZERS[speech.provider]!.languages!.map(code => languageLabel(code as Config['targetLanguage']));
			return setNotice(msgs.speech.unsupported(languageLabel(cfg.targetLanguage), only.join(', ')));
		}
		if (!available(command)) return setNotice(msgs.unavailable(command));
		if (command === 'approve') {
			// Improve mode leaves "[...?]" placeholders; make approving them as-is a deliberate second step.
			if (/\[[^\]\n]*[?？]\]/.test(result!.prompt) && warnedFor !== result!.prompt) {
				setWarnedFor(result!.prompt);
				return setNotice(msgs.placeholders);
			}
			approved = result!.prompt;
			exit();
		} else if (command === 'improve') {
			setRefining({instruction: 'improve', improve: true});
			setStage('rewriting');
		} else if (command === 'edit') {
			setEdited(result!.prompt);
			setStage('edit');
		} else if (command === 'speak') {
			// A second /speak stops it.
			if (speaking.phase !== 'idle') return speaking.stop();
			if (!speech?.enabled) return setNotice(speechProblem ?? msgs.speech.off);
			const fail = (e: Error) => setNotice(e instanceof TooLongError ? msgs.speech.tooLong(e.length, e.max) : msgs.speech.error(e.message));
			try {
				speaking.speak(result!.prompt, fail);
			} catch (e) {
				fail(e as Error);
			}
		} else if (command === 'ipa') {
			// A second /ipa hides the transcription again.
			if (ipaText?.prompt === result!.prompt) setIpaText(undefined);
			else setStage('ipa');
		} else if (command === 'ide') {
			try {
				setIde(resolveIde(cfg.ide));
				setStage('ide');
			} catch (e) {
				setNotice((e as Error).message);
			}
		} else if (command === 'voice') {
			startVoice('chat');
		} else if (command === 'tutor') {
			// One switch for both tutors: off if either is on, otherwise on. Fine control is in /config.
			const enable = !(cfg.languageTutor || cfg.promptTutor);
			try {
				setCfg(saveSetting(saveSetting(cfg, 'languageTutor', String(enable)), 'promptTutor', String(enable)));
				setNotice(enable ? msgs.tutorsOn : msgs.tutorsOff, true);
			} catch (e) {
				setNotice((e as Error).message);
			}
		} else if (command === 'config') {
			setStage('config');
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

	const applySetting = (key: SettingKey, value: string): string | undefined => {
		try {
			setCfg(saveSetting(cfg, key, value));
		} catch (e) {
			return (e as Error).message;
		}
		return undefined;
	};

	// The chat box is always on in review: text refines the prompt, /commands act, empty Enter approves.
	const submitChat = (value: string) => {
		const text = value.trim();
		setChat('');
		if (text.startsWith('/')) return runCommand(selected ? selected.name : text.slice(1).trim().toLowerCase());
		if (!text) return runCommand('approve');
		if (!canUse) return;
		setRefining({instruction: text});
		setNotice(undefined);
		setStage('rewriting');
	};

	return (
		<Box flexDirection="column" gap={1}>
			{stage === 'compose' ? (
				<Box flexDirection="column">
					<Text bold>{msgs.composeTitle}</Text>
					<Box>
						<Text color="cyan">› </Text>
						<TextInput key={draftKey} value={draft} focus={dictation.phase === 'idle'} onChange={setDraft} onSubmit={value => value.trim() && startRewrite(true)} />
					</Box>
					<VoiceStatus voice={voice} dictation={dictation} msgs={msgs} showHint />
				</Box>
			) : (
				<Box flexDirection="column">
					<Text dimColor>{msgs.draft}: {draft}</Text>
					{versions.length > 1 && (
						<Text dimColor wrap="truncate-end">
							{msgs.version(current + 1, versions.length, versions[current]!.label)}
						</Text>
					)}
				</Box>
			)}

			{stage === 'rewriting' && (
				<Text>
					<Text color="green">
						<Spinner type="dots" />
					</Text>{' '}
					{refining?.improve ? msgs.working.improve : refining ? msgs.working.refine : msgs.working.rewrite(languageLabel(cfg.targetLanguage))}
				</Text>
			)}

			{stage === 'ipa' && (
				<Text>
					<Text color="green">
						<Spinner type="dots" />
					</Text>{' '}
					{msgs.ipa.working}
				</Text>
			)}

			{stage === 'ide' && ide && (
				<Text>
					<Text color="green">
						<Spinner type="dots" />
					</Text>{' '}
					{msgs.ide.waiting(ide.name)}
				</Text>
			)}

			{stage === 'review' && error && <Text color="red">{msgs.error(error)}</Text>}

			{stage === 'review' && result && !error && (
				<Box flexDirection="column" gap={1}>
					<Box borderStyle="round" borderColor="green" paddingX={1}>
						<Text>{result.prompt}</Text>
					</Box>
					{result.explanation && (
						<Box flexDirection="column">
							<Text bold>Language tutor</Text>
							{result.explanation.meaning && <Text>{msgs.meaning}: {result.explanation.meaning}</Text>}
							{result.explanation.structure && <Text>{msgs.structure}: {result.explanation.structure}</Text>}
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
					{result.tips && (
						<Box flexDirection="column">
							<Text bold color="yellow">
								Prompt tutor
							</Text>
							{result.tips.length === 0 ? (
								<Text dimColor>{msgs.promptClear}</Text>
							) : (
								result.tips.map(t => <Text key={t}>• {t}</Text>)
							)}
						</Box>
					)}
				</Box>
			)}

			{stage === 'review' && ipaText?.prompt === result?.prompt && !error && (
				<Box flexDirection="column">
					<Text bold color="magenta">
						{msgs.ipa.title}
					</Text>
					<Text>{ipaText!.text}</Text>
				</Box>
			)}

			{stage === 'review' && result?.usage && !error && <UsageLine usage={result.usage} />}

			{stage === 'review' && speaking.phase !== 'idle' && (
				<Text>
					<Text color="green">{speaking.phase === 'loading' ? <Spinner type="dots" /> : '▶'}</Text>{' '}
					{speaking.phase === 'loading' ? msgs.speech.loading : msgs.speech.speaking}
				</Text>
			)}

			{(stage === 'review' || stage === 'compose') && noticeState && <Text color={noticeState.info ? 'green' : 'red'}>{noticeState.text}</Text>}

			{stage === 'review' && (
				<Box flexDirection="column">
					{canUse && (
						<Text bold color="green">
							{msgs.approveHint}
						</Text>
					)}
					<Text dimColor>
						{canUse ? msgs.refineHint : ''}
						{msgs.commandHint}
					</Text>
					<Box>
						<Text color="cyan">› </Text>
						<TextInput
							key={chatKey}
							value={chat}
							focus={dictation.phase === 'idle'}
							onChange={value => {
								setChat(value);
								setPick(0);
							}}
							onSubmit={submitChat}
						/>
					</Box>
					<VoiceStatus voice={voice} dictation={dictation} msgs={msgs} showHint={chat === ''} />
					{suggestions.length > 0 && (
						<Box flexDirection="column">
							{suggestions.map(c => (
								<Text key={c.name} color={c === selected ? 'cyan' : undefined} dimColor={c !== selected}>
									{c === selected ? '❯' : ' '} /{c.name.padEnd(8)} {c.desc}
								</Text>
							))}
							<Text dimColor>  {msgs.suggestKeys}</Text>
						</Box>
					)}
				</Box>
			)}

			{stage === 'history' && (
				<Box flexDirection="column" gap={1}>
					<Box flexDirection="column">
						<Text bold>{msgs.historyTitle}</Text>
						{versions.map((v, i) => (
							<Text key={i} color={i === highlight ? 'cyan' : undefined} dimColor={i !== highlight} wrap="truncate-end">
								{i === highlight ? '❯' : ' '} v{i + 1}
								{i === current ? msgs.inUse : ''} · {v.label}
							</Text>
						))}
					</Box>
					<Box borderStyle="round" borderColor="cyan" paddingX={1}>
						<Text>{versions[highlight]!.result.prompt}</Text>
					</Box>
				</Box>
			)}

			{stage === 'config' && <Settings config={cfg} msgs={msgs} onSave={applySetting} onClose={() => setStage('review')} />}

			{stage === 'edit' && (
				<Box flexDirection="column">
					<Text bold>{msgs.editTitle}</Text>
					<Box>
						<Text color="cyan">› </Text>
						<TextInput
							value={edited}
							onChange={setEdited}
							onSubmit={value => {
								if (!value.trim()) return;
								addVersion({result: {prompt: value.trim()}, label: msgs.labels.manual});
								setStage('review');
							}}
						/>
					</Box>
				</Box>
			)}
		</Box>
	);
}

type Dictation = ReturnType<typeof useDictation>;

// Recording and transcribing progress, or a hint that Tab speaks (only when voice is on).
function VoiceStatus({voice, dictation, msgs, showHint}: {voice?: VoiceConfig; dictation: Dictation; msgs: ReturnType<typeof messages>; showHint: boolean}) {
	if (dictation.phase === 'recording') {
		return (
			<Box flexDirection="column">
				<Text color="red">● {msgs.voice.recording(dictation.seconds, voice!.maxSeconds)}</Text>
				{dictation.partial && <Text dimColor>{dictation.partial}</Text>}
			</Box>
		);
	}
	if (dictation.phase === 'transcribing') {
		return (
			<Text>
				<Text color="green">
					<Spinner type="dots" />
				</Text>{' '}
				{msgs.voice.transcribing}
			</Text>
		);
	}
	return voice?.enabled && showHint ? <Text dimColor>{msgs.voice.hint}</Text> : null;
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
