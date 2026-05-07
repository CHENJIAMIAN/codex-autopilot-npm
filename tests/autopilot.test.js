const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const fs = require('node:fs/promises');

const { invokeCodexAutopilot } = require('../src/autopilot');

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

test('renders status line during automatic turns and finishes cleanly', async () => {
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
    writes.some((message) => typeof message === 'string' && message.includes('[运行中] Turn 1/1 | retry 0/2 | session abcdef12')),
    `expected running status line in writes: ${JSON.stringify(writes)}`
  );
  assert.ok(
    writes.some((message) => typeof message === 'string' && message.includes('[已完成] Turn 1/1')),
    `expected completed status line in writes: ${JSON.stringify(writes)}`
  );
  assert.ok(
    writes.includes(''),
    `expected newline marker in writes: ${JSON.stringify(writes)}`
  );
});

test('renders sleeping status line between turns', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-sleep-'));
  const lastMessageFile = path.join(dir, 'last.txt');
  const runStateFile = path.join(dir, 'run-state.json');
  const logFile = path.join(dir, 'autopilot.log');
  const writes = [];

  const exitCode = await invokeCodexAutopilot({
    maxTurns: 2,
    sleepSeconds: 3,
    retryCount: 1,
    lastMessageFile,
    logFile,
    runStateFile,
    resumePrompt: '继续',
    sessionId: 'abcdef12-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: dir,
    codexRunner: async ({ turn }) => {
      await fs.writeFile(lastMessageFile, `answer ${turn}`, 'utf8');
      return 0;
    },
    writeHost: (message) => writes.push(message),
    setWindowTitle: () => {},
    sleep: async () => {}
  });

  assert.equal(exitCode, 0);
  assert.ok(
    writes.some((message) => typeof message === 'string' && message.includes('[休眠中] Turn 1/2 | retry 0/1') && message.includes('sleep 3s')),
    `expected sleeping status line in writes: ${JSON.stringify(writes)}`
  );
  const firstAnswerIndex = writes.findIndex((message) => message === 'answer 1');
  const rerenderAfterAnswerIndex = writes.findIndex((message, index) => index > firstAnswerIndex && typeof message === 'string' && message.includes('[运行中] Turn 1/2 | retry 0/1'));
  const nextBannerIndex = writes.findIndex((message) => typeof message === 'string' && message.includes('========== Turn 2 / 2 开始 ==========')); 
  const rerenderAfterNextBannerIndex = writes.findIndex((message, index) => index > nextBannerIndex && typeof message === 'string' && message.includes('[运行中] Turn 2/2 | retry 0/1'));
  assert.ok(
    firstAnswerIndex >= 0 && rerenderAfterAnswerIndex > firstAnswerIndex && nextBannerIndex >= 0 && rerenderAfterNextBannerIndex > nextBannerIndex,
    `expected status line to restore after banner output: ${JSON.stringify(writes)}`
  );
});

test('renders failed status line before stopping on non-zero exit', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-failed-status-'));
  const lastMessageFile = path.join(dir, 'last.txt');
  const runStateFile = path.join(dir, 'run-state.json');
  const logFile = path.join(dir, 'autopilot.log');
  const writes = [];

  const exitCode = await invokeCodexAutopilot({
    maxTurns: 1,
    sleepSeconds: 0,
    retryCount: 1,
    retryDelaySeconds: 0,
    lastMessageFile,
    logFile,
    runStateFile,
    resumePrompt: '继续',
    sessionId: 'abcdef12-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: dir,
    codexRunner: async () => 9,
    writeHost: (message) => writes.push(message),
    setWindowTitle: () => {},
    sleep: async () => {}
  });

  assert.equal(exitCode, 9);
  assert.ok(
    writes.some((message) => typeof message === 'string' && message.includes('[失败] Turn 1/1 | retry 1/1')),
    `expected failed status line in writes: ${JSON.stringify(writes)}`
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
