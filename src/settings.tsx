import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import {BACKENDS, CONFIG_PATH, DISPLAY_LANGUAGES, ENV_NAMES, LANGUAGES, languageLabel, type Config, type SettingKey} from './config.js';
import type {Messages} from './i18n.js';

const KEYS: SettingKey[] = [
	'targetLanguage',
	'displayLanguage',
	'languageTutor',
	'promptTutor',
	'backend',
	'model',
	'effort',
	'rewriteInstructions',
	'languageInstructions',
	'promptInstructions',
];

type Option = {value: string; label: string};

// Rows with a fixed set of values open a picker; the rest are typed.
function optionsFor(key: SettingKey, msgs: Messages): Option[] | undefined {
	if (key === 'targetLanguage') return LANGUAGES.map(l => ({value: l.code, label: languageLabel(l.code)}));
	if (key === 'displayLanguage') return DISPLAY_LANGUAGES.map(l => ({value: l.code, label: languageLabel(l.code)}));
	if (key === 'backend') return BACKENDS.map(b => ({value: b, label: b}));
	if (key === 'languageTutor' || key === 'promptTutor') {
		return [
			{value: 'true', label: msgs.settings.on},
			{value: 'false', label: msgs.settings.off},
		];
	}
	return undefined;
}

type Props = {
	config: Config;
	msgs: Messages;
	// Saves one setting and returns an error message, or nothing on success.
	onSave: (key: SettingKey, value: string) => string | undefined;
	onClose: () => void;
};

// The /config screen: pick a row, then pick or type its new value. Changes are saved at once.
export function Settings({config, msgs, onSave, onClose}: Props) {
	const t = msgs.settings;
	const [row, setRow] = useState(0);
	const [mode, setMode] = useState<'list' | 'pick' | 'text'>('list');
	const [option, setOption] = useState(0);
	const [text, setText] = useState('');
	const [feedback, setFeedback] = useState<{text: string; error?: boolean}>();

	const key = KEYS[row]!;
	const options = optionsFor(key, msgs);

	const valueOf = (k: SettingKey) => {
		const value = config[k];
		if (k === 'targetLanguage' || k === 'displayLanguage') return languageLabel(config[k]);
		if (typeof value === 'boolean') return value ? t.on : t.off;
		return value || t.unset;
	};

	const open = () => {
		setFeedback(undefined);
		if (options) {
			setOption(Math.max(0, options.findIndex(o => o.value === String(config[key]))));
			setMode('pick');
		} else {
			setText(String(config[key] ?? ''));
			setMode('text');
		}
	};

	const save = (value: string) => {
		const error = onSave(key, value);
		if (error) {
			setFeedback({text: error, error: true});
		} else {
			const shown = options?.find(o => o.value === value)?.label ?? (value.trim() || t.unset);
			const redo = key === 'targetLanguage' || key === 'displayLanguage' ? ` · ${t.redo}` : '';
			setFeedback({text: `${t.saved(t.labels[key], shown)}${redo}`});
		}
		setMode('list');
	};

	useInput((_input, k) => {
		if (mode === 'list') {
			if (k.escape) onClose();
			else if (k.upArrow) setRow(r => (r + KEYS.length - 1) % KEYS.length);
			else if (k.downArrow) setRow(r => (r + 1) % KEYS.length);
			else if (k.return) open();
		} else if (mode === 'pick') {
			if (k.escape) setMode('list');
			else if (k.upArrow) setOption(o => (o + options!.length - 1) % options!.length);
			else if (k.downArrow) setOption(o => (o + 1) % options!.length);
			else if (k.return) save(options![option]!.value);
		} else if (k.escape) {
			setMode('list');
		}
	});

	return (
		<Box flexDirection="column" gap={1}>
			<Box flexDirection="column">
				<Text bold>{mode === 'list' ? t.title : mode === 'pick' ? t.pick(t.labels[key]) : t.text(t.labels[key])}</Text>
				{mode === 'list' &&
					KEYS.map((k, i) => (
						// Label and value sit in separate boxes so wide characters (CJK, Thai) do not break the columns.
						<Box key={k}>
							<Text color={i === row ? 'cyan' : undefined}>{i === row ? '❯ ' : '  '}</Text>
							<Box width={34}>
								<Text color={i === row ? 'cyan' : undefined} dimColor={i !== row} wrap="truncate-end">
									{t.labels[k]}
								</Text>
							</Box>
							<Text dimColor={i !== row} wrap="truncate-end">
								{valueOf(k)}
								{process.env[ENV_NAMES[k]] ? `  (${t.env(ENV_NAMES[k])})` : ''}
							</Text>
						</Box>
					))}
				{mode === 'pick' &&
					options!.map((o, i) => (
						<Text key={o.value} color={i === option ? 'cyan' : undefined} dimColor={i !== option}>
							{i === option ? '❯' : ' '} {o.label}
						</Text>
					))}
				{mode === 'text' && (
					<Box>
						<Text color="cyan">› </Text>
						<TextInput value={text} onChange={setText} onSubmit={save} />
					</Box>
				)}
			</Box>
			{feedback && <Text color={feedback.error ? 'red' : 'green'}>{feedback.text}</Text>}
			<Text dimColor>{t.path(CONFIG_PATH)}</Text>
		</Box>
	);
}
