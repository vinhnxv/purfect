import {useEffect, useRef, useState} from 'react';
import type {SpeechConfig} from './config.js';
import {startSpeaking, type Speaking} from './speak.js';

export type SpeechPhase = 'idle' | 'loading' | 'speaking';

// Reads one text aloud at a time: loading until the first audio arrives, then speaking.
export function useSpeech(speech: SpeechConfig | undefined) {
	const [phase, setPhase] = useState<SpeechPhase>('idle');
	const session = useRef<Speaking | undefined>(undefined);
	const run = useRef(0); // bumped on every speak/stop, so a late result from an old run is ignored

	const stop = () => {
		run.current++;
		session.current?.stop();
		session.current = undefined;
		setPhase('idle');
	};

	// Throws when the provider cannot be set up or the text is too long, before anything is requested.
	const speak = (text: string, language: string, onError: (error: Error) => void) => {
		stop();
		const mine = run.current;
		const active = startSpeaking({...speech!, settings: {...speech!.settings, language}}, text, () => {
			if (run.current === mine) setPhase('speaking');
		});
		session.current = active;
		setPhase('loading');
		active.done.then(
			() => {
				if (run.current === mine) stop();
			},
			(e: Error) => {
				if (run.current !== mine) return;
				stop();
				onError(e);
			},
		);
	};

	// Leaving while it speaks must silence it.
	useEffect(() => () => session.current?.stop(), []);

	return {phase, speak, stop};
}
