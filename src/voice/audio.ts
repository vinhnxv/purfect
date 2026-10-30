import {SAMPLE_RATE} from './types.js';

// Length field value for a WAV whose size is not known yet (audio that is still being generated).
export const UNKNOWN_LENGTH = 0xffffffff;

export function wavHeader(dataBytes: number, sampleRate = SAMPLE_RATE): Buffer {
	const header = Buffer.alloc(44);
	header.write('RIFF', 0);
	header.writeUInt32LE(dataBytes === UNKNOWN_LENGTH ? UNKNOWN_LENGTH : 36 + dataBytes, 4);
	header.write('WAVEfmt ', 8);
	header.writeUInt32LE(16, 16); // fmt chunk size
	header.writeUInt16LE(1, 20); // PCM
	header.writeUInt16LE(1, 22); // mono
	header.writeUInt32LE(sampleRate, 24);
	header.writeUInt32LE(sampleRate * 2, 28); // bytes per second
	header.writeUInt16LE(2, 32); // bytes per frame
	header.writeUInt16LE(16, 34); // bits per sample
	header.write('data', 36);
	header.writeUInt32LE(dataBytes, 40);
	return header;
}

// Wraps raw PCM in a WAV header, the container most HTTP speech APIs accept.
export const toWav = (pcm: Buffer): Buffer => Buffer.concat([wavHeader(pcm.length), pcm]);

export const secondsOf = (pcm: Buffer) => pcm.length / (SAMPLE_RATE * 2);

// Loudest sample in a chunk; 0 means digital silence, which is what a denied microphone delivers.
export function peakOf(pcm: Buffer): number {
	let peak = 0;
	for (let i = 0; i + 1 < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
	return peak;
}
