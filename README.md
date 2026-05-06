# codex-autopilot-npm

`codex-autopilot-npm` is an npm CLI recreation of the PowerShell `codex-autopilot` workflow. It resumes existing Codex sessions and keeps running turn by turn until the configured turn budget, a non-zero Codex exit, or a conservative stall recovery path stops the run.

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

## Requirements

- Windows is the primary target.
- Node.js 20 or newer.
- Codex CLI available as `codex`.
- Optional: `fzf` for searchable session selection.

## Usage

```powershell
npm start
```

After global installation or local linking:

```powershell
cauto --max-turns 5
```

The full command `codex-autopilot` is also available, but `cauto` is the recommended short alias.

The default interactive flow is:

1. Select a Codex session.
2. Select a resume prompt if `--resume-prompt` was not passed.
3. Select max turns if `--max-turns` was not passed.
4. Continue the session turn by turn.

## Common Options

```powershell
cauto --session-id <uuid> --max-turns 10
cauto --codex-execution-mode full-auto
cauto --codex-execution-mode sandbox --codex-sandbox-mode workspace-write
cauto --retry-count 2 --retry-delay-seconds 10
```

PowerShell-style option names are also accepted, for example `-MaxTurns 10` and `-SessionId <uuid>`.

## Verification

```powershell
npm test
```
