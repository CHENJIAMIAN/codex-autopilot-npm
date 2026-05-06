const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const fs = require('node:fs/promises');

const {
  getCodexSessionEntries,
  getSessionIdFromRolloutPath,
  getSessionPreviewFromRollout,
  testIsPrimarySessionRollout
} = require('../src/sessions');

test('extracts session id from rollout file name', () => {
  const sessionId = '11111111-2222-3333-4444-555555555555';
  const file = `rollout-2026-05-06T01-02-03-${sessionId}.jsonl`;

  assert.equal(getSessionIdFromRolloutPath(file), sessionId);
});

test('reads preview from event user message', async () => {
  const file = await tempRollout([
    { type: 'session_meta', payload: { cwd: 'D:\\Work' } },
    { type: 'event_msg', payload: { type: 'user_message', message: '第一行\n第二行' } }
  ]);

  assert.equal(await getSessionPreviewFromRollout(file), '第一行 第二行');
});

test('filters subagent rollouts as non-primary', async () => {
  const file = await tempRollout([
    { type: 'session_meta', payload: { source: { subagent: true }, cwd: 'D:\\Work' } }
  ]);

  assert.equal(await testIsPrimarySessionRollout(file), false);
});

test('returns sorted primary session entries with cwd', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-sessions-'));
  const sessionId = '11111111-2222-3333-4444-555555555555';
  const file = path.join(dir, `rollout-2026-05-06T01-02-03-${sessionId}.jsonl`);
  await fs.writeFile(file, [
    JSON.stringify({ type: 'session_meta', payload: { cwd: 'D:\\Work' } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: '继续' } })
  ].join('\n'), 'utf8');

  const entries = await getCodexSessionEntries({ sessionsDir: dir, maxCount: 30 });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].sessionId, sessionId);
  assert.equal(entries[0].workingDirectory, 'D:\\Work');
  assert.equal(entries[0].preview, '继续');
});

async function tempRollout(items) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-rollout-'));
  const file = path.join(dir, 'rollout-2026-05-06T01-02-03-11111111-2222-3333-4444-555555555555.jsonl');
  await fs.writeFile(file, items.map((item) => JSON.stringify(item)).join('\n'), 'utf8');
  return file;
}
