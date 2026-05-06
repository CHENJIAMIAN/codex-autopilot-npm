const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  getCodexExecArgumentList,
  getCodexExecutablePath,
  testCodexTurnStalled
} = require('../src/codex');

test('builds yolo resume arguments with output before resume', () => {
  const args = getCodexExecArgumentList({
    lastMessageFile: 'C:\\Temp\\last.txt',
    resumePrompt: 'Continue executing.'
  });

  assert.deepEqual(args, [
    'exec',
    '--yolo',
    '-o',
    'C:\\Temp\\last.txt',
    'resume',
    '--last',
    'Continue executing.'
  ]);
});

test('builds explicit session resume arguments', () => {
  const args = getCodexExecArgumentList({
    lastMessageFile: 'C:\\Temp\\last.txt',
    resumePrompt: 'Continue executing.',
    sessionId: '11111111-2222-3333-4444-555555555555'
  });

  assert.deepEqual(args, [
    'exec',
    '--yolo',
    '-o',
    'C:\\Temp\\last.txt',
    'resume',
    '11111111-2222-3333-4444-555555555555',
    'Continue executing.'
  ]);
});

test('builds sandbox arguments with profile before sandbox', () => {
  const args = getCodexExecArgumentList({
    lastMessageFile: 'C:\\Temp\\last.txt',
    resumePrompt: 'Continue executing.',
    codexExecutionMode: 'sandbox',
    codexSandboxMode: 'workspace-write',
    codexProfile: 'safe-defaults'
  });

  assert.deepEqual(args, [
    'exec',
    '--profile',
    'safe-defaults',
    '--sandbox',
    'workspace-write',
    '-o',
    'C:\\Temp\\last.txt',
    'resume',
    '--last',
    'Continue executing.'
  ]);
});

test('prefers installed codex.exe path before generic command', () => {
  const appData = 'C:\\Users\\tester\\AppData\\Roaming';
  const preferred = path.join(appData, 'npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe');

  const resolved = getCodexExecutablePath({
    env: { APPDATA: appData },
    existsSync: (candidate) => candidate === preferred,
    which: () => {
      throw new Error('should not resolve generic command');
    }
  });

  assert.equal(resolved, preferred);
});

test('detects a stalled turn only when last message is non-empty and stable', async () => {
  const tmp = await fsTempFile('stable last message');
  const old = new Date(Date.now() - 60_000);
  await require('node:fs/promises').utimes(tmp, old, old);

  assert.equal(testCodexTurnStalled({
    turnStartTime: new Date(Date.now() - 120_000),
    lastMessageFile: tmp,
    turnStallTimeoutSeconds: 30,
    lastMessageStableSeconds: 30
  }), true);
});

async function fsTempFile(content) {
  const fs = require('node:fs/promises');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-test-'));
  const file = path.join(dir, 'last.txt');
  await fs.writeFile(file, content, 'utf8');
  return file;
}
