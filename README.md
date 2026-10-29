# purfect

Write a prompt in Vietnamese (or rough English), get it rewritten into clear English for
Claude Code / Codex CLI, with a short Vietnamese explanation of the key verbs and phrases.
Review, edit, then approve.

Rewriting runs through headless Claude Code (`claude -p`), so it uses your existing login.

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
draft in the prompt box, press `Ctrl+G`, approve with `a`, then press Enter to send.

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
| `backend`                | `PURFECT_BACKEND` | the CLI that launched purfect, else `claude` |
| `<backend>.model`        | `PURFECT_MODEL`   | `haiku` for claude, `gpt-6-luna` for codex |
| `<backend>.effort`       | `PURFECT_EFFORT`  | the backend CLI's default                  |

Env vars win over the file and apply to the active backend. Without `backend`, purfect uses the
CLI it was launched from (Claude Code → claude, Codex → codex). Set `backend` or `PURFECT_BACKEND`
to force one, e.g. rewrite with Codex while in Claude Code.

- Claude backend: `claude -p`, no tools, user settings skipped.
- Codex backend: `codex exec` in a read-only sandbox from the temp dir, session not saved. Codex
  always sends its own instructions and tool definitions, so expect ~18k input tokens per rewrite.

The review screen shows tokens and an estimated cost per rewrite. On a Claude subscription
the cost is a list-price estimate; usage counts against your plan limits (`/usage`).

Keys in review: `a` approve, `e` edit, `r` rewrite again, `b` back, `q` quit.
