import type {ProviderDefinition} from '../types.js';
import {openai} from './openai.js';

// Add a provider here: one file that exports a ProviderDefinition, one line below. Its config goes
// under "voice.providers.<id>" in the config file, and PURFECT_VOICE_<ID>_API_KEY / _BASE_URL / _MODEL.
export const PROVIDERS: Record<string, ProviderDefinition> = {openai};
