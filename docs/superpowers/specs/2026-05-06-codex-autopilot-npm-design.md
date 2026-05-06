# codex-autopilot-npm Design

## Goal

Build a new npm package project at `D:\Desktop\codex-autopilot-npm` that recreates the behavior of `D:\Desktop\codex-autopilot` without depending on the original PowerShell script.

## Recommended Approach

Use a full Node.js CLI rewrite. This is better than a thin npm wrapper because the output is a real npm package, can be tested with Node tooling, and does not depend on the original repository remaining in place.

## Architecture

The package exposes a `codex-autopilot` binary via `package.json#bin`. The CLI parses kebab-case and PowerShell-style options, resolves defaults, selects a session, resolves interactive prompt and turn options, then calls the autopilot loop.

Core modules are intentionally small:

- `src/cli.js`: CLI entry point, argument parsing, process exit handling.
- `src/autopilot.js`: turn loop, retries, run-state updates, Codex invocation orchestration.
- `src/codex.js`: Codex argument construction, executable resolution, process spawning, stall recovery.
- `src/sessions.js`: Codex rollout discovery, primary-session filtering, preview and cwd extraction.
- `src/pickers.js`: `fzf` selection and numbered fallback selection.
- `src/state.js`: `run-state.json` reading, writing, validation, resume-turn calculation.
- `src/text.js`: UTF-8 file IO, atomic writes, SHA-256 helper.
- `src/log.js`: timestamped log append helper.
- `src/ui.js`: Chinese UI strings and default prompt/turn options.

## Data Flow

The CLI reads options and default paths, then resolves the session from either `--session-id` or the session picker. It reads resume prompts from `resume-prompts.txt`; if missing or empty, it falls back to built-in Chinese defaults. The autopilot loop builds `codex exec` arguments, clears the last-message file, runs Codex in the selected session working directory, records last-message metadata in `run-state.json`, logs structured events, and either sleeps for the next turn or exits.

## Error Handling

Missing sessions, missing working directories, invalid selections, unsupported execution modes, and invalid sandbox modes fail with explicit messages. Non-zero Codex exits can be retried on the same turn; exhausted retries stop the run and preserve diagnostic state. Stall recovery kills the Codex process tree only when the turn has exceeded the timeout and the last-message file has non-empty stable content.

## Testing

Use Node's built-in `node:test` runner. Tests cover argument construction, prompt defaults, run-state restore semantics, rollout parsing, option parsing, and autopilot loop behavior through injected fake process runners.
