const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const fs = require('node:fs/promises');

const { invokeCodexAutopilot, getWindowTitle } = require('../src/autopilot');

test('continues for max turns and writes loop state', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-loop-'));
  const lastMessageFile = path.join(dir, 'last.txt');
  const runStateFile = path.join(dir, 'run-state.json');
  const logFile = path.join(dir, 'autopilot.log');
  const invocations = [];

  const exitCode = await invokeCodexAutopilot({
    maxTurns: 2,
    sleepSeconds: 0,
    lastMessageFile,
    logFile,
    runStateFile,
    resumePrompt: '继续',
    sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: dir,
    codexRunner: async ({ turn }) => {
      invocations.push(turn);
      await fs.writeFile(lastMessageFile, `answer ${turn}`, 'utf8');
      return 0;
    },
    writeHost: () => {},
    setWindowTitle: () => {},
    sleep: async () => {}
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(invocations, [1, 2]);
  const state = JSON.parse(await fs.readFile(runStateFile, 'utf8'));
  assert.equal(state.turn, 2);
  assert.equal(state.stop_reason, 'max_turns_reached');
});

test('retries non-zero exits without consuming another turn', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-retry-'));
  const lastMessageFile = path.join(dir, 'last.txt');
  const runStateFile = path.join(dir, 'run-state.json');
  const logFile = path.join(dir, 'autopilot.log');
  const attempts = [];

  const exitCode = await invokeCodexAutopilot({
    maxTurns: 1,
    sleepSeconds: 0,
    retryCount: 1,
    retryDelaySeconds: 0,
    lastMessageFile,
    logFile,
    runStateFile,
    resumePrompt: '继续',
    sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: dir,
    codexRunner: async ({ turn, attempt }) => {
      attempts.push({ turn, attempt, before: await safeRead(lastMessageFile) });
      if (attempt === 0) return 12;
      await fs.writeFile(lastMessageFile, 'retry recovered', 'utf8');
      return 0;
    },
    writeHost: () => {},
    setWindowTitle: () => {},
    sleep: async () => {}
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(attempts, [
    { turn: 1, attempt: 0, before: '' },
    { turn: 1, attempt: 1, before: '' }
  ]);
});

test('returns non-zero exit code when retries are exhausted', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-fail-'));
  const lastMessageFile = path.join(dir, 'last.txt');
  const runStateFile = path.join(dir, 'run-state.json');
  const logFile = path.join(dir, 'autopilot.log');

  const exitCode = await invokeCodexAutopilot({
    maxTurns: 1,
    sleepSeconds: 0,
    retryCount: 1,
    retryDelaySeconds: 0,
    lastMessageFile,
    logFile,
    runStateFile,
    resumePrompt: '继续',
    sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: dir,
    codexRunner: async () => 13,
    writeHost: () => {},
    setWindowTitle: () => {},
    sleep: async () => {}
  });

  assert.equal(exitCode, 13);
  const state = JSON.parse(await fs.readFile(runStateFile, 'utf8'));
  assert.equal(state.stop_reason, 'exec_retry_exhausted');
  assert.equal(state.last_exit_code, 13);
});

test('creates parent directory for custom last message file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-custom-last-'));
  const lastMessageFile = path.join(dir, 'nested', 'last.txt');
  const runStateFile = path.join(dir, 'run-state.json');
  const logFile = path.join(dir, 'autopilot.log');

  const exitCode = await invokeCodexAutopilot({
    maxTurns: 1,
    sleepSeconds: 0,
    lastMessageFile,
    logFile,
    runStateFile,
    resumePrompt: '继续',
    sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: dir,
    codexRunner: async () => {
      await fs.writeFile(lastMessageFile, 'created', 'utf8');
      return 0;
    },
    writeHost: () => {},
    setWindowTitle: () => {},
    sleep: async () => {}
  });

  assert.equal(exitCode, 0);
  assert.equal(await fs.readFile(lastMessageFile, 'utf8'), 'created');
});

test('does not render status line during automatic turns', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-status-'));
  const lastMessageFile = path.join(dir, 'last.txt');
  const runStateFile = path.join(dir, 'run-state.json');
  const logFile = path.join(dir, 'autopilot.log');
  const writes = [];

  const exitCode = await invokeCodexAutopilot({
    maxTurns: 1,
    sleepSeconds: 0,
    retryCount: 2,
    lastMessageFile,
    logFile,
    runStateFile,
    resumePrompt: '继续',
    sessionId: 'abcdef12-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: dir,
    codexRunner: async () => {
      await fs.writeFile(lastMessageFile, 'done', 'utf8');
      return 0;
    },
    writeHost: (message) => writes.push(message),
    setWindowTitle: () => {},
    sleep: async () => {}
  });

  assert.equal(exitCode, 0);
  assert.ok(
    writes.every((message) => typeof message !== 'string' || !message.includes('[运行中] Turn 1/1 | retry 0/2 | session abcdef12')),
    `expected no running status line in writes: ${JSON.stringify(writes)}`
  );
});

test('writes host-visible output to the autopilot log', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-visible-log-'));
  const lastMessageFile = path.join(dir, 'last.txt');
  const runStateFile = path.join(dir, 'run-state.json');
  const logFile = path.join(dir, 'autopilot.log');

  const exitCode = await invokeCodexAutopilot({
    maxTurns: 1,
    sleepSeconds: 0,
    lastMessageFile,
    logFile,
    runStateFile,
    resumePrompt: '继续',
    sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: dir,
    codexRunner: async () => {
      await fs.writeFile(lastMessageFile, 'final answer', 'utf8');
      return 0;
    },
    writeHost: () => {},
    setWindowTitle: () => {},
    sleep: async () => {}
  });

  assert.equal(exitCode, 0);
  const log = await fs.readFile(logFile, 'utf8');
  assert.match(log, /========== Turn 1 \/ 1 开始 ==========\n/);
  assert.match(log, /--- 模型的最后消息 ---\n/);
  assert.match(log, /final answer\n/);
  assert.doesNotMatch(log, /event=visible_output/);
  assert.doesNotMatch(log, /source=host/);
});

test('formats extended window titles for running phases', () => {
  assert.equal(
    getWindowTitle({
      phase: 'Running',
      turn: 3,
      maxTurns: 10,
      retryAttempt: 0,
      retryCount: 2,
      sessionId: 'abcdef12-ffff-ffff-ffff-ffffffffffff'
    }),
    'codex-autopilot | 运行中 3/10 | retry 0/2 | session abcdef12'
  );

  assert.equal(
    getWindowTitle({
      phase: 'Retrying',
      turn: 3,
      maxTurns: 10,
      retryAttempt: 1,
      retryCount: 2,
      sessionId: 'abcdef12-ffff-ffff-ffff-ffffffffffff'
    }),
    'codex-autopilot | 重试中 3/10 | retry 1/2 | session abcdef12'
  );
});

test('updates window title with retry and session progress during automatic turns', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-title-'));
  const lastMessageFile = path.join(dir, 'last.txt');
  const runStateFile = path.join(dir, 'run-state.json');
  const logFile = path.join(dir, 'autopilot.log');
  const titles = [];

  const exitCode = await invokeCodexAutopilot({
    maxTurns: 2,
    sleepSeconds: 0,
    retryCount: 1,
    retryDelaySeconds: 0,
    lastMessageFile,
    logFile,
    runStateFile,
    resumePrompt: '继续',
    sessionId: 'abcdef12-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: dir,
    codexRunner: async ({ turn, attempt }) => {
      if (turn === 1 && attempt === 0) return 9;
      await fs.writeFile(lastMessageFile, `answer ${turn}`, 'utf8');
      return 0;
    },
    writeHost: () => {},
    setWindowTitle: (title) => titles.push(title),
    sleep: async () => {}
  });

  assert.equal(exitCode, 0);
  assert.ok(
    titles.includes('codex-autopilot | 运行中 1/2 | retry 0/1 | session abcdef12'),
    `expected running title in ${JSON.stringify(titles)}`
  );
  assert.ok(
    titles.includes('codex-autopilot | 重试中 1/2 | retry 1/1 | session abcdef12'),
    `expected retry title in ${JSON.stringify(titles)}`
  );
  assert.ok(
    titles.includes('codex-autopilot | 休眠中 1/2 | retry 1/1 | session abcdef12'),
    `expected sleeping title in ${JSON.stringify(titles)}`
  );
  assert.ok(
    titles.includes('codex-autopilot | 已完成 2/2 | session abcdef12'),
    `expected completed title in ${JSON.stringify(titles)}`
  );
});

test('reapplies window title while a turn is still running', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-title-guard-'));
  const lastMessageFile = path.join(dir, 'last.txt');
  const runStateFile = path.join(dir, 'run-state.json');
  const logFile = path.join(dir, 'autopilot.log');
  const titles = [];

  const exitCode = await invokeCodexAutopilot({
    maxTurns: 1,
    sleepSeconds: 0,
    retryCount: 0,
    titleRefreshIntervalMs: 10,
    lastMessageFile,
    logFile,
    runStateFile,
    resumePrompt: '继续',
    sessionId: 'abcdef12-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: dir,
    codexRunner: async () => {
      await fs.writeFile(lastMessageFile, 'answer 1', 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 35));
      return 0;
    },
    writeHost: () => {},
    setWindowTitle: (title) => titles.push(title),
    sleep: async () => {}
  });

  assert.equal(exitCode, 0);
  const runningTitle = 'codex-autopilot | 运行中 1/1 | retry 0/0 | session abcdef12';
  assert.ok(
    titles.filter((title) => title === runningTitle).length >= 3,
    `expected running title to be reapplied, got ${JSON.stringify(titles)}`
  );
});

async function safeRead(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}
