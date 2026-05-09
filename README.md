# codex-autopilot-npm

`codex-autopilot-npm` is a Windows-focused CLI for resuming an existing Codex session and keeping it moving turn by turn. It recreates the PowerShell `codex-autopilot` workflow as a published npm package.

## Install

```powershell
npm install -g codex-autopilot-npm
```

After installation, use the short command:

```powershell
cauto
```

The full command `codex-autopilot` is also available.

## Quick Start

The default interactive flow is:

1. Select an existing Codex session.
2. Select a resume prompt, or choose `自定义提示语` and type one directly.
3. Select max turns if `--max-turns` was not passed.
4. Continue the session turn by turn until it exits or reaches the turn budget.

## Features

- Pick an existing Codex session by `fzf` when available, or by numbered fallback.
- Resume a selected session with `codex exec ... resume`.
- Choose resume prompts from a user-level `resume-prompts.txt`, with bundled defaults as fallback.
- Choose max turns interactively when not provided.
- Persist `run-state.json` so interrupted runs can continue from the next turn.
- Retry transient non-zero `codex exec` exits without consuming extra turns.
- Isolate the Codex last-message output file per Node process.
- Read Codex rollout JSONL files and show working directory plus preview.
- Preserve UTF-8 output for Chinese prompts and logs.
- Run without interactive prompts using `--headless` for scheduled or background execution.
- Write per-run logs under each Codex session, with visible output separated from structured events.

## Common Commands

```powershell
cauto
cauto --max-turns 5
cauto --session-id <uuid> --max-turns 10
cauto --headless --session-id <uuid> --max-turns 10 --resume-prompt "继续"
cauto --headless --session-id <uuid> --log-root D:\Logs\codex-autopilot
cauto --headless --session-id <uuid> --transcript-file D:\Logs\transcript.log --event-log-file D:\Logs\events.jsonl
cauto --codex-execution-mode full-auto
cauto --codex-execution-mode sandbox --codex-sandbox-mode workspace-write
cauto --retry-count 2 --retry-delay-seconds 10
```

PowerShell-style option names are also accepted, for example `-MaxTurns 10` and `-SessionId <uuid>`.

`--headless` disables interactive session, prompt, and turn-count pickers. It requires `--session-id`; when `--resume-prompt` or `--max-turns` are omitted, the usual defaults are used.

## Resume Prompts

Custom resume prompts should be stored in:

```text
%USERPROFILE%\.codex-autopilot\resume-prompts.txt
```

Each non-empty line is one selectable prompt. This user-level file is read before the bundled `resume-prompts.txt`, so npm upgrades or reinstalls do not overwrite personal prompts. If the user-level file is missing or empty, the bundled prompts are used.

Use `--resume-prompts-file <path>` to bypass both defaults and read prompts from one explicit file.

## Logs

When no explicit log files are provided, each run gets its own directory:

```text
logs/
  sessions/
    <session-id>/
      runs/
        <timestamp>-p<pid>-<suffix>/
          transcript.log
          events.jsonl
          meta.json
      latest-run.json
```

`transcript.log` contains only the visible output that would be shown to the user. `events.jsonl` contains structured autopilot events for diagnostics. `meta.json` records the session, run id, working directory, options, log paths, and exit status. `latest-run.json` points to the newest run for that session.

`--log-root` changes the base directory for default per-run logs. `--transcript-file` and `--event-log-file` override only those files. The older `--log-file` option is kept as an alias for `--event-log-file`.

## Requirements

- Windows is the primary target.
- Node.js 20 or newer.
- Codex CLI available as `codex`.
- Optional: `fzf` for searchable session selection.

## Development

```powershell
npm start
```

## Verification

```powershell
npm test
```
