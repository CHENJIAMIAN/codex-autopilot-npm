# codex-autopilot-npm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a test-covered npm CLI recreation of the PowerShell `codex-autopilot` project.

**Architecture:** The CLI is decomposed into small CommonJS modules for UI constants, text IO, run state, sessions, Codex execution, pickers, and the autopilot loop. The executable entry point wires these modules together and exposes npm `bin` support.

**Tech Stack:** Node.js CommonJS, built-in `node:test`, built-in `child_process`, built-in `readline`, no runtime npm dependencies.

---

### Task 1: Project Baseline And Tests

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `README.md`
- Create: `resume-prompts.txt`
- Create: `tests/*.test.js`

- [ ] **Step 1: Write failing tests for desired module APIs**

Create tests for Codex argument construction, run-state resume behavior, session rollout parsing, CLI argument parsing, and autopilot loop retries.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test`

Expected: FAIL because `src/*` modules do not exist yet.

### Task 2: Foundation Modules

**Files:**
- Create: `src/ui.js`
- Create: `src/text.js`
- Create: `src/log.js`
- Create: `src/state.js`

- [ ] **Step 1: Implement default UI constants and prompt loading**

- [ ] **Step 2: Implement UTF-8 text IO and atomic writes**

- [ ] **Step 3: Implement run-state read, write, and resume-turn calculation**

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- tests/state.test.js`

Expected: PASS for state tests.

### Task 3: Codex And Session Modules

**Files:**
- Create: `src/codex.js`
- Create: `src/sessions.js`

- [ ] **Step 1: Implement Codex exec argument construction**

- [ ] **Step 2: Implement Codex executable resolution and process helpers**

- [ ] **Step 3: Implement Codex rollout parsing and primary-session filtering**

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- tests/codex.test.js tests/sessions.test.js`

Expected: PASS for Codex and session tests.

### Task 4: CLI And Autopilot Loop

**Files:**
- Create: `src/pickers.js`
- Create: `src/autopilot.js`
- Create: `src/cli.js`

- [ ] **Step 1: Implement CLI option parsing and defaults**

- [ ] **Step 2: Implement interactive selection helpers**

- [ ] **Step 3: Implement the autopilot loop with retries, logs, state writes, and sleeps**

- [ ] **Step 4: Run full tests**

Run: `npm test`

Expected: PASS.

### Task 5: Verification And Commit

**Files:**
- Modify as needed after verification.

- [ ] **Step 1: Run full verification**

Run: `npm test`

Expected: all tests pass without warnings.

- [ ] **Step 2: Inspect git diff**

Run: `git status --short`

Expected: only intended new project files.

- [ ] **Step 3: Commit**

Run: `git add . && git commit -m "初始化 npm 版 codex-autopilot"`

Expected: commit succeeds.
