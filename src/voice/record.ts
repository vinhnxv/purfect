import {spawn} from 'node:child_process';
import {SAMPLE_RATE} from './types.js';

export type Recorder = {stop(): Promise<void>};
export type RecordOptions = {
	device?: string;
	onChunk(pcm: Buffer): void;
	// The recording broke while running (device unplugged, permission revoked).
	onError(error: Error): void;
};

// Where ffmpeg reads the microphone from. macOS and Linux use the system default when no device is
// named; Windows (DirectShow) needs a name. Only macOS has been tested.
function inputArgs(device?: string): string[] {
	if (process.platform === 'darwin') return ['-f', 'avfoundation', '-i', `:${device ?? 'default'}`];
	if (process.platform === 'win32') {
		if (!device) throw new Error('set voice.device (or PURFECT_VOICE_DEVICE) to your microphone name on Windows');
		return ['-f', 'dshow', '-i', `audio=${device}`];
	}
	return ['-f', 'pulse', '-i', device ?? 'default'];
}

// Streams raw PCM from the microphone through ffmpeg until stop() is called.
export function record({device, onChunk, onError}: RecordOptions): Recorder {
	const ffmpeg = spawn(
		'ffmpeg',
		['-hide_banner', '-loglevel', 'error', ...inputArgs(device), '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', 'pipe:1'],
		{stdio: ['pipe', 'pipe', 'pipe']},
	);
	let stopping = false;
	let stderr = '';
	const closed = new Promise<void>(resolve => {
		ffmpeg.on('close', code => {
			process.off('exit', kill);
			if (!stopping && code !== 0) onError(new Error(stderr.trim().split('\n').pop() || `ffmpeg exited with code ${code}`));
			resolve();
		});
		ffmpeg.on('error', e => {
			onError((e as NodeJS.ErrnoException).code === 'ENOENT' ? new Error('ffmpeg is not installed (macOS: brew install ffmpeg)') : e);
			resolve();
		});
	});
	// Never leave a microphone open behind us.
	const kill = () => ffmpeg.kill('SIGKILL');
	process.once('exit', kill);
	ffmpeg.stdout.on('data', onChunk);
	ffmpeg.stderr.on('data', (data: Buffer) => (stderr += data));
	ffmpeg.stdin.on('error', () => {});

	return {
		async stop() {
			stopping = true;
			ffmpeg.stdin.end('q'); // ffmpeg's own "quit" key, which lets it flush the last audio
			const timer = setTimeout(kill, 1500);
			await closed;
			clearTimeout(timer);
		},
	};
}
