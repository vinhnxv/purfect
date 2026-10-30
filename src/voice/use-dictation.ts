import {useEffect, useRef, useState} from 'react';
import {startDictation, type Dictation} from './dictation.js';
import type {VoiceConfig} from './config.js';
import type {Transcript} from './types.js';

export type VoicePhase = 'idle' | 'recording' | 'transcribing';

type Callbacks = {onText(transcript: Transcript): void; onError(error: Error): void};

// Drives one dictation at a time for the interface: start, then stop (or cancel). The recording
// ends by itself after voice.maxSeconds.
export function useDictation(voice: VoiceConfig | undefined) {
	const [phase, setPhase] = useState<VoicePhase>('idle');
	const [seconds, setSeconds] = useState(0);
	const [partial, setPartial] = useState('');
	const session = useRef<Dictation | undefined>(undefined);
	const callbacks = useRef<Callbacks | undefined>(undefined);
	const startedAt = useRef(0);
	const run = useRef(0); // bumped on every start/cancel, so a late answer from an old run is ignored

	const finish = () => {
		session.current = undefined;
		setPhase('idle');
		setPartial('');
	};

	const cancel = () => {
		run.current++;
		session.current?.cancel();
		finish();
	};

	const stop = async () => {
		const active = session.current;
		if (!active) return;
		const mine = run.current;
		setPhase('transcribing');
		try {
			const transcript = await active.stop();
			if (run.current === mine) callbacks.current!.onText(transcript);
		} catch (e) {
			if (run.current === mine) callbacks.current!.onError(e as Error);
		} finally {
			if (run.current === mine) finish();
		}
	};

	// Throws when the provider cannot be set up (no API key, say), before anything is recorded.
	const start = (next: Callbacks) => {
		const mine = ++run.current;
		callbacks.current = next;
		session.current = startDictation(voice!, {
			onPartial: setPartial,
			onFailure: error => {
				if (run.current !== mine) return;
				cancel();
				next.onError(error);
			},
		});
		startedAt.current = Date.now();
		setSeconds(0);
		setPhase('recording');
	};

	const latestStop = useRef(stop);
	latestStop.current = stop;
	useEffect(() => {
		if (phase !== 'recording') return;
		const timer = setInterval(() => {
			const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
			setSeconds(elapsed);
			if (elapsed >= voice!.maxSeconds) void latestStop.current();
		}, 250);
		return () => clearInterval(timer);
	}, [phase]);

	// Leaving while recording must release the microphone.
	useEffect(() => () => session.current?.cancel(), []);

	return {phase, seconds, partial, start, stop, cancel};
}
