import type {SynthesizerDefinition} from '../types.js';
import {azure} from './azure.js';
import {dashscope} from './dashscope.js';
import {openai} from './openai.js';
import {openaiRealtime} from './openai-realtime.js';
import {speechmatics} from './speechmatics.js';
import {soniox} from './soniox.js';

// Add a provider here: one file that exports a SynthesizerDefinition, one line below. Its config goes
// under "speech.providers.<id>" in the config file, and PURFECT_SPEECH_<ID>_API_KEY / _BASE_URL / _MODEL / _VOICE.
export const SYNTHESIZERS: Record<string, SynthesizerDefinition> = {'openai-realtime': openaiRealtime, openai, dashscope, speechmatics, azure, soniox};
