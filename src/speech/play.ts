import {spawn} from 'node:child_process';
import {UNKNOWN_LENGTH, wavHeader} from '../voice/audio.js';

// Plays PCM as it arrives. `finish` resolves when the last sound has been played, `stop` cuts it off.
export type Player = {write(pcm: Buffer): void; finish(): Promise<void>; stop(): void};
export type StartPlayer = (sampleRate: number, onError: (error: Error) => void) => Player;

// ffplay comes with ffmpeg, which voice input needs anyway. The PCM goes in behind a WAV header of
// unknown length, so no format options are needed (their names changed between ffmpeg versions).
export const ffplayPlayer: StartPlayer = (sampleRate, onError) => {
	const child = spawn('ffplay', ['-hide_banner', '-loglevel', 'error', '-nodisp', '-autoexit', '-i', 'pipe:0'], {stdio: ['pipe', 'ignore', 'pipe']});
	let stopped = false;
	let errors = '';
	child.stderr.on('data', (d: Buffer) => (errors += d.toString()));
	child.stdin.on('error', () => {}); // the player may exit before all audio is written
	const exited = new Promise<void>(resolve => {
		child.on('error', e => {
			onError((e as NodeJS.ErrnoException).code === 'ENOENT' ? new Error('ffplay is not installed (it comes with ffmpeg; macOS: brew install ffmpeg)') : e);
			resolve();
		});
		child.on('close', code => {
			if (code !== 0 && !stopped) onError(new Error(errors.trim().split('\n').pop() || `ffplay exited with code ${code}`));
			resolve();
		});
	});
	child.stdin.write(wavHeader(UNKNOWN_LENGTH, sampleRate));
	return {
		write: pcm => void child.stdin.write(pcm),
		finish() {
			child.stdin.end();
			return exited;
		},
		stop() {
			stopped = true;
			child.kill('SIGKILL');
		},
	};
};
