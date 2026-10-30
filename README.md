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
| `/improve` | Make the prompt clearer; gaps become `[...?]` to fill |
| `/history` | List every version, pick one to continue from         |
| `/undo`    | Go to the previous version                            |
| `/redo`    | Rewrite again from the original draft (a new version) |
| `/back`    | Go back and change the draft                          |
| `/tutor`   | Switch both tutors on or off (saved)                  |
| `/config`  | Change languages, tutors, instructions, backend, model, effort (saved) |
| `/quit`    | Quit without changing anything                        |

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
