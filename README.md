# purfect

Write a prompt in Vietnamese (or rough English), get it rewritten into clear English for
Claude Code / Codex CLI, with a short Vietnamese explanation of the key verbs and phrases.
Review, edit, then approve.

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
| `backend`                | `PURFECT_BACKEND`  | the CLI that launched purfect, else `claude` |
| `<backend>.model`        | `PURFECT_MODEL`    | `haiku` for claude, `gpt-6-luna` for codex and openai |
| `<backend>.effort`       | `PURFECT_EFFORT`   | the backend's default                      |
| `openai.baseUrl`         | `PURFECT_BASE_URL` | `https://api.openai.com/v1`                |
| `openai.apiKey`          | `PURFECT_API_KEY`  | `OPENAI_API_KEY`                           |

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

The rewrite stays faithful to the draft: no added or dropped meaning (time cues such as
"lúc nãy" become "earlier"), vague references (this, that, above, the other file) stay vague,
and verbs follow the intent ("sửa lại" is "fix", "sửa lại lần nữa" is "fix again"). Identifiers,
file names and code are kept as written. English mistakes in the draft are listed in the
explanation with why the fix is right.

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
| `/edit`    | Edit the English prompt by hand                       |
| `/history` | List every version, pick one to continue from         |
| `/undo`    | Go to the previous version                            |
| `/redo`    | Rewrite again from the original draft (a new version) |
| `/back`    | Go back and change the draft                          |
| `/quit`    | Quit without changing anything                        |

Versions are append-only: every rewrite, refinement and manual edit adds one, and nothing is
deleted. Picking an old version in `/history` only moves the pointer, so refining from it adds
a new version at the end and all the others stay available.

Each refinement sends the original draft, the current prompt and your instruction, and returns
the full revised prompt with a fresh explanation (same backend and cost as a rewrite).
