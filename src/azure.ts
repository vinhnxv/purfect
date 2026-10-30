// Azure AI Speech is set up the way Microsoft's own samples are: AZURE_SPEECH_KEY, and
// AZURE_SPEECH_ENDPOINT for the resource's address, such as https://<name>.api.cognitive.microsoft.com/.
// Both are only fallbacks: PURFECT_VOICE_AZURE_* / PURFECT_SPEECH_AZURE_* and the config file take
// precedence, so voice and speech can still use different keys.
export const azureSpeechKey = () => process.env.AZURE_SPEECH_KEY || undefined;

export const azureSpeechEndpoint = () => process.env.AZURE_SPEECH_ENDPOINT?.replace(/\/+$/, '') || undefined;
