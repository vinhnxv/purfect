# purfect

Write a prompt in any language (or rough English), get it rewritten into clear English, or any
other target language, for Claude Code / Codex CLI. Two tutors sit under the result, in your
display language:

- **Language tutor**: a short explanation of the key verbs and phrases, including mistakes in
  your English (or whichever target language you practice).
- **Prompt tutor**: tips on whether the prompt is clear enough for an agent to act on (target,
  expected result and how to check it, scope, one task at a time) with a phrase you can add.
  A clear prompt gets no tips.

Review, refine in the chat box, then approve.

Rewriting runs through headless Claude Code (`claude -p`) or Codex (`codex exec`), so it uses
your existing login; no API key needed. It can also call any OpenAI-compatible API (OpenAI,
OpenRouter, Ollama, LM Studio, …). Requires Node 22+.

> **Platform support:** purfect has only been tested on macOS. It may work on Linux and Windows,
> but neither has been tested. Detecting which CLI launched purfect relies on `ps`, so on
> Windows set `backend` (or `PURFECT_BACKEND`) explicitly.

## Usage

```sh
npm install
npm start                # standalone: approved prompt is copied to the clipboard
bin/purfect.js FILE      # editor mode: rewrites FILE in place on approve
```

### Inside Codex

Codex reads only `VISUAL`/`EDITOR` from its environment, so set it when launching:

```sh
VISUAL=/path/to/purfect/bin/purfect.js codex
```

Press `Ctrl+G` in the composer.

### Inside Claude Code

Set `EDITOR` to `bin/purfect.js` (e.g. in a project's `.claude/settings.json` `env`), type a
draft in the prompt box, press `Ctrl+G` (or `Ctrl+X Ctrl+E` in terminals such as Warp that
take `Ctrl+G`), approve with `a`, then press Enter to send.

### In Warp

Warp binds `Ctrl+G` to its own [Rich Input](https://docs.warp.dev/agent-platform/cli-agents/rich-input/)
editor whenever it detects Claude Code or Codex, so the key never reaches the agent and purfect
does not open. Pick one:

- Change Warp's Rich Input shortcut in **Settings > Agents > Third party CLI agents**, so that
  `Ctrl+G` reaches the agent again. Turning off only the Rich Input button or its auto-open may
  not free the key.
- In Claude Code, press `Ctrl+X Ctrl+E` instead; it opens the same external editor. Codex has no
  such alternative, so use the first option there.

Text typed in Rich Input is sent to the agent as it is. It does not pass through purfect.

## Settings

Optional file `~/.config/purfect/config.json` (or `$XDG_CONFIG_HOME/purfect/config.json`):

```json
{
  "claude": { "model": "haiku" },
  "codex": { "model": "gpt-6-luna", "effort": "low" }
}
```

| Setting                  | Env var           | Default                                    |
| ------------------------ | ----------------- | ------------------------------------------ |
| `targetLanguage`         | `PURFECT_TARGET_LANG`  | `en`                                   |
| `displayLanguage`        | `PURFECT_DISPLAY_LANG` | `en`                                   |
| `tutors.language.enabled` | `PURFECT_LANGUAGE_TUTOR` | `true`                              |
| `tutors.prompt.enabled`  | `PURFECT_PROMPT_TUTOR` | `true`                                 |
| `rewrite.instructions`   | `PURFECT_REWRITE_INSTRUCTIONS`  | none                          |
| `tutors.language.instructions` | `PURFECT_LANGUAGE_INSTRUCTIONS` | none                    |
| `tutors.prompt.instructions`   | `PURFECT_PROMPT_INSTRUCTIONS`   | none                    |
| `backend`                | `PURFECT_BACKEND`  | the CLI that launched purfect, else `claude` |
| `<backend>.model`        | `PURFECT_MODEL`    | `haiku` for claude, `gpt-6-luna` for codex and openai |
| `<backend>.effort`       | `PURFECT_EFFORT`   | the backend's default                      |
| `ide`                    | `PURFECT_IDE`      | the first of `code`, `cursor`, `windsurf`, `zed`, `subl` on the PATH, run with `--wait` |
| `openai.baseUrl`         | `PURFECT_BASE_URL` | `https://api.openai.com/v1`                |
| `openai.apiKey`          | `PURFECT_API_KEY`  | `OPENAI_API_KEY`                           |

`targetLanguage` is the language prompts are rewritten into: `en`, `vi`, `zh`, `ja`, `ko`, `fr`,
`de`, `es`, `pt`, `it`, `ru`, `id`, `th`, `hi`, `ar` or `tr` (a name such as `Japanese` works
too). `displayLanguage` is the language of the interface and of both tutors' explanations; it is
limited to the languages with a translated interface: `en`, `vi`, `fr`, `de`, `it`, `es`, `pt`,
`ja`, `zh`, `ko`. You can change all of these without editing the file: type `/config` in the
review screen. Changes are saved to the file and apply at once.

### Tutors and extra instructions

Each tutor can be switched off. A tutor that is off is left out of the prompt, so the model does
not write it: with both off, a rewrite produces about a ninth of the output tokens and returns
sooner. `/improve` still uses the Prompt tutor's judgement to find what is missing, and shows its
tips, even while that tutor is off. Type `/tutor` in the review screen to switch both off or on,
or use `/config` for each one.

Each tutor, and the rewrite itself, takes extra instructions in your own words. They are added to
that section of the prompt and can shape the output but not the reply format or the rule to stay
faithful to your draft. Keep them short; they are sent with every request.

```json
{
  "rewrite": { "instructions": "Keep the words deploy and PR in English. Never add please." },
  "tutors": {
    "language": { "enabled": true, "instructions": "I often get prepositions wrong; list those first." },
    "prompt": { "enabled": true, "instructions": "This repo uses pnpm; suggest adding the test command." }
  }
}
```

Env vars win over the file and apply to the active backend. Without `backend`, purfect uses the
CLI it was launched from (Claude Code → claude, Codex → codex). Set `backend` or `PURFECT_BACKEND`
to force one, e.g. rewrite with Codex while in Claude Code. Detection walks up the process tree
to the nearest `claude` or `codex` process (macOS/Linux `ps`).

- Claude backend: `claude -p`, no tools, user settings skipped.
- OpenAI backend (`backend: "openai"`): one `POST {baseUrl}/chat/completions` call, no tools.
  It is never auto-detected; set `backend` or `PURFECT_BACKEND=openai`. The key must match the
  provider, and model ids follow the provider's naming (e.g. `openai/gpt-6-luna` on OpenRouter).
  Keep the key in env vars, or `chmod 600` the config file if you put it there.
- Codex backend: `codex exec` in a read-only sandbox from the temp dir, session not saved. Codex
  always sends its own instructions and core tools; purfect turns off unused features (browser,
  plugins, multi-agent, …), which brings input from ~18k down to ~12.6k tokens per rewrite.

The review screen shows tokens and an estimated cost per rewrite: Claude reports its own,
Codex and the OpenAI backend are computed from a price table in `src/rewrite.ts` (OpenAI standard
API prices; models not in the table, including provider-prefixed ids, show no cost). On a Claude or ChatGPT subscription these are list-price
estimates for comparison; usage counts against your plan limits instead. Typical rewrite:
Haiku ~$0.0005, Luna ~$0.0015 (Codex sends ~13k input tokens vs ~1.2k for Claude).

## Voice input

Speak instead of typing. Two places use it:

- **Empty draft:** open purfect (Ctrl+G) with nothing written, press `Tab`, and talk. The text lands
  in the draft box for you to check; Enter rewrites it.
- **Review screen:** press `Tab` on an empty chat box (or type `/voice`) and say what to change
  ("shorter", "add a test requirement"). The text lands in the chat box; Enter applies it.

`Tab` or `Enter` stops recording, `Esc` cancels. Recording ends by itself after `maxSeconds`.
Always read the text before sending: names such as `parseConfig` are often misheard.

Voice is **off by default** and is separate from the rewrite: its own block in the config file,
its own `PURFECT_VOICE_*` variables, its own key and endpoint. Nothing is shared with the
`openai` backend, and `OPENAI_API_KEY` / `PURFECT_API_KEY` are never used for voice.

```json
{
  "voice": {
    "enabled": true,
    "provider": "openai",
    "providers": { "openai": { "apiKey": "sk-…" } }
  }
}
```

| Setting                        | Env var                         | Default                       |
| ------------------------------ | ------------------------------- | ----------------------------- |
| `voice.enabled`                | `PURFECT_VOICE_ENABLED`         | `false`                       |
| `voice.autoStart`              | `PURFECT_VOICE_AUTO_START`      | `false` (record on opening an empty draft) |
| `voice.provider`               | `PURFECT_VOICE_PROVIDER`        | `openai`                      |
| `voice.maxSeconds`             | `PURFECT_VOICE_MAX_SECONDS`     | `60` (1 to 300)               |
| `voice.device`                 | `PURFECT_VOICE_DEVICE`          | the system microphone         |
| `voice.providers.<id>.apiKey`  | `PURFECT_VOICE_<ID>_API_KEY`    | none                          |
| `voice.providers.<id>.baseUrl` | `PURFECT_VOICE_<ID>_BASE_URL`   | the provider's own            |
| `voice.providers.<id>.model`   | `PURFECT_VOICE_<ID>_MODEL`      | the provider's own            |
| `voice.providers.<id>.language` | `PURFECT_VOICE_<ID>_LANGUAGE`  | the provider's own (`speechmatics` and `azure` need one) |

Requirements: `ffmpeg` on the PATH (macOS: `brew install ffmpeg`), and permission for your
terminal app to use the microphone (macOS: System Settings → Privacy & Security → Microphone).
The audio is sent to the provider, so voice stays off until you turn it on.

Providers:

- `openai` (default): `/audio/transcriptions` with `gpt-transcribe` (listed at about $0.0045 per
  minute; purfect shows the cost after each use).
- `dashscope`: Alibaba Cloud Model Studio, `qwen-audio-3.1-asr-flash`, which takes up to five
  minutes of audio per request. No price is known to purfect, so no cost is shown. See
  [DashScope](#dashscope) for the key and host.
- `speechmatics`: Speechmatics Agent STT (`linden-1`), streamed over a WebSocket, so the words
  appear while you speak and the last ones arrive right after you stop. It needs the language
  up front (`"auto"` is rejected): set `voice.providers.speechmatics.language` or
  `PURFECT_VOICE_SPEECHMATICS_LANGUAGE`; the default is `en`. Other codes the service accepted when
  tried include `vi`, `fr`, `de`, `es`, `ja`, `ko`, `pt`, `it` and `cmn` (Mandarin; `zh` is
  rejected). No price is known to purfect, so no cost is shown. See [Speechmatics](#speechmatics).
- `azure`: Azure AI Speech recognition of short audio, one request after you stop. It needs a
  locale up front (there is no automatic detection): set `voice.providers.azure.language` or
  `PURFECT_VOICE_AZURE_LANGUAGE`; the default is `en-US`, and Vietnamese is `vi-VN`. The service's
  documentation caps a request at 60 seconds, which is also the default `voice.maxSeconds`. No
  cost is shown. See [Azure AI Speech](#azure-ai-speech).
- `soniox`: Soniox real-time STT (`stt-rt-v5`), streamed over a WebSocket like `speechmatics`, so
  the words appear while you speak. It detects the language by itself (Vietnamese and English were
  both recognised with no setting); `voice.providers.soniox.language` is only an optional hint.
  No price is known to purfect, so no cost is shown. See [Soniox](#soniox).

Only macOS has been tested.

### Adding a provider

Providers sit behind one interface in `src/voice/types.ts`, in two shapes:

- **batch** (`transcribe(pcm, signal)`): one request with the whole recording after you stop.
- **live** (`open(handlers, signal)`): audio is streamed while you speak, partial text arrives
  through `onPartial`, and `finish()` returns the final text.

Audio is always 16 kHz mono 16-bit PCM. To add one, write a file under `src/voice/providers/`
that exports a `ProviderDefinition` (`defaults` and `create(settings)`) and register it in
`src/voice/providers/index.ts`. Its settings then work under `voice.providers.<id>` and
`PURFECT_VOICE_<ID>_*` with no other change.

## Reading aloud

`/speak` reads the current prompt aloud so you can hear how it sounds; `/speak` again or `Esc`
stops it. The voice is AI-generated, and purfect says so while it plays.

Like voice input, it is **off by default** and separate from everything else: its own `speech`
block in the config file, its own `PURFECT_SPEECH_*` variables, its own key and endpoint. Nothing
is shared with the rewrite backend or with voice input, so the speech key has to be set on its
own, even for the same OpenAI account. The prompt text is sent to the provider.

```json
{
  "speech": {
    "enabled": true,
    "provider": "openai-realtime",
    "providers": { "openai-realtime": { "apiKey": "sk-…", "voice": "marin" } }
  }
}
```

| Setting                         | Env var                          | Default                |
| ------------------------------- | -------------------------------- | ---------------------- |
| `speech.enabled`                | `PURFECT_SPEECH_ENABLED`         | `false`                |
| `speech.provider`               | `PURFECT_SPEECH_PROVIDER`        | `openai-realtime`      |
| `speech.providers.<id>.apiKey`  | `PURFECT_SPEECH_<ID>_API_KEY`    | none                   |
| `speech.providers.<id>.baseUrl` | `PURFECT_SPEECH_<ID>_BASE_URL`   | the provider's own     |
| `speech.providers.<id>.model`   | `PURFECT_SPEECH_<ID>_MODEL`      | the provider's own     |
| `speech.providers.<id>.voice`   | `PURFECT_SPEECH_<ID>_VOICE`      | the provider's own     |

Requirements: `ffplay`, which comes with `ffmpeg` (macOS: `brew install ffmpeg`). The audio plays
as it arrives, so it starts before the whole clip is ready. Only macOS has been tested.

Providers (each has its own settings block, so each needs its own key; the id in the env var
is upper-cased with `-` as `_`, e.g. `PURFECT_SPEECH_OPENAI_REALTIME_API_KEY`):

- `openai-realtime` (default): `gpt-realtime-2.1-mini` over the Realtime API (a WebSocket), voice
  `marin`. It is a conversational model, so purfect tells it to be a plain reader and fences the text
  in `<read>` tags; against the live API it read the text word for word, even text that sounds like
  an instruction. Listed at $0.60 per 1M text tokens in, $2.40 out and $20 per 1M audio tokens out.
  The first sound arrives about 1 to 2 seconds after `/speak`, sometimes longer.
- `openai`: `gpt-4o-mini-tts` through `/audio/speech`, voice `marin` (listed at $0.60 per 1M text
  tokens in and $12 per 1M audio tokens out). OpenAI has announced that this model shuts down on
  2027-01-06 and points to the Realtime API instead, so use `openai-realtime` for anything lasting.

- `dashscope`: Alibaba Cloud Model Studio, `qwen-audio-3.1-tts-plus`, voice `longanhuan_v3.1`
  (the others for this model are `longanlingxin_v3.1`, `xunanchuan_v3.1` and `longanfengyue_v3.1`),
  over its WebSocket. Listed at $0.30 per 10,000 characters (Singapore). See [DashScope](#dashscope)
  for the key and host.

- `speechmatics`: Speechmatics text to speech (preview), voice `sarah`; the others are `theo` (UK) and
  `megan`, `jack` (US). It has **English voices only**, so `/speak` is hidden, and says why when
  typed, while the target language is not English. An unknown voice name is not an error: the
  service falls back to a default voice. See [Speechmatics](#speechmatics).
- `azure`: Azure AI Speech text to speech, default voice `en-US-AvaMultilingualNeural`, which reads
  the target language whatever it is (tried with English and Vietnamese). A voice built for one
  language, such as `vi-VN-HoaiMyNeural`, reads only that language, so set `speech.providers.azure.voice`
  (or `PURFECT_SPEECH_AZURE_VOICE`) to match your target. See [Azure AI Speech](#azure-ai-speech).
- `soniox`: Soniox text to speech (`tts-rt-v2`), voice `Adrian`. All of its 200 voices read all of its
  63 languages, which include every target language purfect offers; purfect tells the service the
  target language of the text. The service cuts a request's audio at two minutes, so texts over
  1500 characters are refused. See [Soniox](#soniox).

Texts over 4096 characters (2000 for `dashscope`, 1500 for `soniox`) are refused. The cost of a reading is not shown.

The last finished reading is kept in memory, so `/speak` on the same text, provider, model and
voice plays again at once and costs nothing; reading a different text replaces it. Nothing is
written to disk, and the clip is gone when purfect exits.

### DashScope

The `dashscope` provider for voice input and for reading aloud is set up the way Alibaba's own
tools are, from two standard variables:

| Variable             | Meaning                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `DASHSCOPE_API_KEY`  | The API key.                                                                                              |
| `DASHSCOPE_API_HOST` | Your workspace host, e.g. `<workspace-id>.ap-southeast-1.maas.aliyuncs.com`. Without it, `dashscope-intl.aliyuncs.com`. |

They are only fallbacks. `PURFECT_VOICE_DASHSCOPE_*` / `PURFECT_SPEECH_DASHSCOPE_*` and the
`voice.providers.dashscope` / `speech.providers.dashscope` blocks win, so voice and speech can still
use different keys. Select it with `"provider": "dashscope"` in the `voice` or `speech` block.

### Speechmatics

The `speechmatics` provider for voice input and for reading aloud reads one standard variable:

| Variable               | Meaning       |
| ---------------------- | ------------- |
| `SPEECHMATICS_API_KEY` | The API key.  |

It is only a fallback. `PURFECT_VOICE_SPEECHMATICS_API_KEY` / `PURFECT_SPEECH_SPEECHMATICS_API_KEY` and
the `voice.providers.speechmatics` / `speech.providers.speechmatics` blocks win, so voice and speech
can still use different keys. Select it with `"provider": "speechmatics"` in the `voice` or `speech`
block. Its default hosts are `global.rt.speechmatics.com` (speech to text, which routes to the
nearest region; pin one with `baseUrl`, e.g. `https://eu.rt.speechmatics.com`) and
`preview.tts.speechmatics.com` (text to speech).

### Azure AI Speech

The `azure` provider for voice input and for reading aloud is set up from two variables:

| Variable                | Meaning                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `AZURE_SPEECH_KEY`      | The key of the Speech resource.                                                          |
| `AZURE_SPEECH_ENDPOINT` | The resource's endpoint, e.g. `https://<name>.api.cognitive.microsoft.com/` (Keys and Endpoint in the Azure portal). |

They are only fallbacks. `PURFECT_VOICE_AZURE_*` / `PURFECT_SPEECH_AZURE_*` (`_API_KEY`, `_BASE_URL`)
and the `voice.providers.azure` / `speech.providers.azure` blocks win, so voice and speech can still
use different keys. Select it with `"provider": "azure"` in the `voice` or `speech` block. The
free (F0) tier limits how often requests may be made; the service then answers with HTTP 429 and
purfect shows its message.

### Soniox

The `soniox` provider for voice input and for reading aloud reads one standard variable:

| Variable          | Meaning      |
| ----------------- | ------------ |
| `SONIOX_API_KEY`  | The API key. |

It is only a fallback. `PURFECT_VOICE_SONIOX_API_KEY` / `PURFECT_SPEECH_SONIOX_API_KEY` and the
`voice.providers.soniox` / `speech.providers.soniox` blocks win, so voice and speech can still use
different keys. Select it with `"provider": "soniox"` in the `voice` or `speech` block. Pick another
voice with `speech.providers.soniox.voice` (or `PURFECT_SPEECH_SONIOX_VOICE`); the names are in the
Soniox console and in `GET https://api.soniox.com/v1/tts-models`.

### Adding a speech provider

A provider is a `Synthesizer` (`src/speech/types.ts`): `synthesize(text, onAudio, signal)` calls
`onAudio` with mono 16-bit PCM at the provider's `sampleRate`, as it arrives. A service that returns
the whole clip calls it once; a streaming one (chunked HTTP, WebSocket) calls it many times, and
nothing else changes. `openai` (chunked HTTP) and `openai-realtime` (WebSocket) are the two examples.
A provider that reads only some languages lists them in `languages`; `/speak` then refuses the others.
Write a file under `src/speech/providers/` that exports a
`SynthesizerDefinition` (`defaults` and `create(settings)`) and register it in
`src/speech/providers/index.ts`. Its settings then work under `speech.providers.<id>` and
`PURFECT_SPEECH_<ID>_*` with no other change.

## Rewrite rules

The Prompt tutor's checks follow Anthropic's
[prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
(be clear and direct, give context, say what to do rather than what not to do, define how to
verify). Its tips are advice only: they are never applied to the rewrite on their own.

The rewrite stays faithful to the draft: no added or dropped meaning (time cues such as
"lúc nãy" become "earlier"), vague references (this, that, above, the other file) stay vague,
and verbs follow the intent. Identifiers, file names and code are kept as written. Mistakes in
the draft's target-language parts are listed in the explanation with why the fix is right. For
Vietnamese drafts rewritten into English there are extra verb rules ("sửa lại" is "fix",
"sửa lại lần nữa" is "fix again").

## Review screen

The chat box under the result is always on:

- Type what to change ("ngắn hơn", "thêm yêu cầu viết test", "make it more polite") and press
  Enter: the prompt is revised in place, as many times as you like.
- Empty Enter approves.
- Type `/` to list commands with a short explanation; keep typing to filter (`/e` → `/edit`),
  `↑↓` to move, `Tab` to complete, `Enter` to run, `Esc` to clear.

| Command    | Does                                                  |
| ---------- | ----------------------------------------------------- |
| `/approve` | Approve this prompt and close                         |
| `/edit`    | Edit the rewritten prompt by hand                     |
| `/ide`     | Edit the rewritten prompt in your IDE (VS Code, Cursor, …) |
| `/ipa`     | Show the IPA pronunciation of the prompt, sentence by sentence; again hides it |
| `/speak`  | Read the prompt aloud with an AI voice (needs speech on); again stops it |
| `/improve` | Make the prompt clearer; gaps become `[...?]` to fill |
| `/voice`   | Speak an instruction instead of typing it (needs voice on) |
| `/history` | List every version, pick one to continue from         |
| `/undo`    | Go to the previous version                            |
| `/redo`    | Rewrite again from the original draft (a new version) |
| `/back`    | Go back and change the draft                          |
| `/tutor`   | Switch both tutors on or off (saved)                  |
| `/config`  | Change languages, tutors, instructions, backend, model, effort (saved) |
| `/quit`    | Quit without changing anything                        |

`/ide` opens the prompt in your IDE as a temporary `prompt.md`. Save and close the file there
and the text comes back as a new version; `Esc` in purfect stops waiting. The IDE command must
block until the file is closed, which is what `--wait` does. To use another one, set `ide` (or
`PURFECT_IDE`) to the full command, e.g. `"code --wait"` or `"\"/path/My IDE\" --wait"`. `$EDITOR`
is not used, because purfect is often `$EDITOR` itself. Only VS Code has been tested.

`/ipa` asks the model for an IPA transcription of the current prompt (one extra request, with the
same backend) and shows it under the prompt. It is offered only when the target language is
English, French, German, Spanish, Portuguese, Italian, Russian, Indonesian, Turkish or Vietnamese,
whose spelling is enough for a reliable transcription. For Chinese, Japanese, Korean, Thai, Hindi
and Arabic it is hidden and says so. The transcription comes from the model, so treat it as a guide.

Versions are append-only: every rewrite, refinement and manual edit adds one, and nothing is
deleted. Picking an old version in `/history` only moves the pointer, so refining from it adds
a new version at the end and all the others stay available.

`/improve` never invents details: whatever is missing (action, specific target, expected result)
becomes a placeholder such as `[which file?]`, and the Prompt tutor says what was unclear. Answer
in the chat box to fill them. Approving a prompt that still has placeholders asks for a second
`/approve`. A prompt that is already clear is left alone.

Each refinement sends the original draft, the current prompt and your instruction, and returns
the full revised prompt with a fresh explanation (same backend and cost as a rewrite).

## License

[MIT](LICENSE)
