const CONNECT_TIMEOUT_MS = 30_000;

type Options = {
	url: string;
	headers: Record<string, string>;
	body: object;
	signal: AbortSignal;
};

// POSTs a JSON body to a service that answers with raw audio, and hands the audio over as it
// streams, so playback can start before the clip is complete.
export async function streamHttpAudio({url, headers, body, signal}: Options, onAudio: (pcm: Buffer) => void): Promise<void> {
	// The timeout covers only waiting for the first response, not the whole clip.
	const connect = new AbortController();
	const timer = setTimeout(() => connect.abort(), CONNECT_TIMEOUT_MS);
	let res: Response;
	try {
		res = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: JSON.stringify(body), signal: AbortSignal.any([signal, connect.signal])});
	} finally {
		clearTimeout(timer);
	}
	if (!res.ok) {
		// Error bodies are JSON from most services and an HTML page from some gateways.
		const error = (await res.json().catch(() => ({}))) as {error?: {message?: string}; message?: string; detail?: string};
		throw new Error(`HTTP ${res.status}: ${error.error?.message ?? error.message ?? error.detail ?? res.statusText}`);
	}
	const reader = res.body!.getReader();
	for (;;) {
		const {done, value} = await reader.read();
		if (done) return;
		onAudio(Buffer.from(value));
	}
}
