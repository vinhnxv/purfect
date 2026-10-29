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

### Inside Claude Code

Set `EDITOR` to `bin/purfect.js` (e.g. in a project's `.claude/settings.json` `env`), type a
draft in the prompt box, press `Ctrl+G`, approve with `a`, then press Enter to send.

## Settings

Optional file `~/.config/purfect/config.json` (or `$XDG_CONFIG_HOME/purfect/config.json`):

```json
{ "model": "haiku", "effort": "low" }
```

| Setting | Env var         | Default |
| ------- | --------------- | ------- |
| `model` | `PURFECT_MODEL` | `haiku` |
| `effort` | `PURFECT_EFFORT` | model default (`low`, `medium`, `high`, `xhigh`, `max`) |

Env vars win over the file. For per-project overrides, set them in the project's
`.claude/settings.json` `env` block.

The review screen shows tokens and an estimated cost per rewrite. On a Claude subscription
the cost is a list-price estimate; usage counts against your plan limits (`/usage`).

Keys in review: `a` approve, `e` edit, `r` rewrite again, `b` back, `q` quit.
