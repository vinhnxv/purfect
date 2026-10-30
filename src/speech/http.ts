const CONNECT_TIMEOUT_MS = 30_000;

type Options = {
	url: string;
	headers: Record<string, string>;
	// An object is sent as JSON; a string is sent as is, with the Content-Type the caller sets.
	body: object | string;
	signal: AbortSignal;
};

// POSTs a body to a service that answers with raw audio, and hands the audio over as it
// streams, so playback can start before the clip is complete.
export async function streamHttpAudio({url, headers, body, signal}: Options, onAudio: (pcm: Buffer) => void): Promise<void> {
	// The timeout covers only waiting for the first response, not the whole clip.
	const connect = new AbortController();
	const timer = setTimeout(() => connect.abort(), CONNECT_TIMEOUT_MS);
	let res: Response;
	try {
		res = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.any([signal, connect.signal])});
	} catch (error) {
		// fetch reports every network failure as "fetch failed"; name the host so the user can see what to check.
		if (signal.aborted || (error as Error).name === 'AbortError') throw error;
		throw new Error(`could not reach ${new URL(url).host} (check the address and your connection)`);
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
