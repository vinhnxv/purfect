# purfect

Write a prompt in Vietnamese (or rough English), get it rewritten into clear English for
Claude Code / Codex CLI, with a short Vietnamese explanation of the key verbs and phrases.
Review, edit, then approve.

Rewriting runs through headless Claude Code (`claude -p`), so it uses your existing login.
The model defaults to `haiku`; set `PURFECT_MODEL` (e.g. `sonnet`, `opus`) to override it.

## Usage

```sh
npm install
npm start                # standalone: approved prompt is copied to the clipboard
bin/purfect.js FILE      # editor mode: rewrites FILE in place on approve
```

### Inside Claude Code

Set `EDITOR` to `bin/purfect.js` (e.g. in a project's `.claude/settings.json` `env`), type a
draft in the prompt box, press `Ctrl+G`, approve with `a`, then press Enter to send.

Keys in review: `a` approve, `e` edit, `r` rewrite again, `b` back, `q` quit.
