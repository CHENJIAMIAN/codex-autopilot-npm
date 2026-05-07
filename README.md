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
- Choose resume prompts from `resume-prompts.txt`.
- Choose max turns interactively when not provided.
- Persist `run-state.json` so interrupted runs can continue from the next turn.
- Retry transient non-zero `codex exec` exits without consuming extra turns.
- Isolate the Codex last-message output file per Node process.
- Read Codex rollout JSONL files and show working directory plus preview.
- Preserve UTF-8 output for Chinese prompts and logs.

## Common Commands

```powershell
cauto
cauto --max-turns 5
cauto --session-id <uuid> --max-turns 10
cauto --codex-execution-mode full-auto
cauto --codex-execution-mode sandbox --codex-sandbox-mode workspace-write
cauto --retry-count 2 --retry-delay-seconds 10
```

PowerShell-style option names are also accepted, for example `-MaxTurns 10` and `-SessionId <uuid>`.

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
