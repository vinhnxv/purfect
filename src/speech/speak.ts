import type {SpeechConfig} from './config.js';
import {ffplayPlayer, type Player, type StartPlayer} from './play.js';
import {SYNTHESIZERS} from './providers/index.js';

export class TooLongError extends Error {
	constructor(
		readonly length: number,
		readonly max: number,
	) {
		super(`text too long: ${length} characters, the provider accepts ${max}`);
	}
}

// The last finished reading stays in memory, so reading the same version again plays at once and costs
// nothing; reading another text replaces it. The key holds everything that changes the sound (not the
// API key). A clip is stored only after the provider finished it.
let last: {key: string; chunks: Buffer[]} | undefined;

export type Speaking = {
	// Resolves when the text has been read; rejects when the provider or the player fails.
	done: Promise<void>;
	stop(): void;
};

// Reads the text aloud: the provider's audio goes to the player as it arrives. Throws at once when
// the provider cannot be set up (no API key) or the text is too long, before anything is requested.
export function startSpeaking(speech: SpeechConfig, text: string, onPlaying: () => void, startPlayer: StartPlayer = ffplayPlayer): Speaking {
	const synthesizer = SYNTHESIZERS[speech.provider]!.create(speech.settings);
	if (text.length > synthesizer.maxChars) throw new TooLongError(text.length, synthesizer.maxChars);

	const key = JSON.stringify([speech.provider, speech.settings.baseUrl, speech.settings.model, speech.settings.voice, speech.settings.language, text]);
	const cached = last?.key === key ? last.chunks : undefined;

	const controller = new AbortController();
	let player: Player | undefined;
	let failure: Error | undefined;
	const fail = (error: Error) => {
		failure ??= error;
		controller.abort();
	};

	const play = (pcm: Buffer) => {
		if (!player) {
			player = startPlayer(synthesizer.sampleRate, fail);
			onPlaying();
		}
		player.write(pcm);
	};

	const done = (async () => {
		try {
			if (cached) {
				cached.forEach(play);
			} else {
				const chunks: Buffer[] = [];
				await synthesizer.synthesize(
					text,
					pcm => {
						chunks.push(pcm);
						play(pcm);
					},
					controller.signal,
				);
				if (chunks.length > 0) last = {key, chunks};
			}
			if (!player) throw new Error('the provider returned no audio');
			await player.finish();
			if (failure) throw failure;
		} catch (e) {
			if (failure) throw failure;
			if (!controller.signal.aborted) throw e;
		} finally {
			player?.stop();
		}
	})();

	return {
		done,
		stop() {
			controller.abort();
			player?.stop();
		},
	};
}
