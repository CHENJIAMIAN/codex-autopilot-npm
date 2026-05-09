const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const fs = require('node:fs/promises');

const {
  createRunLogPlan,
  writeLatestRunPointer,
  writeRunMetadata
} = require('../src/run-logs');

test('creates a per-run log plan under the session directory', () => {
  const plan = createRunLogPlan({
    logRoot: 'D:\\Logs',
    sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    now: new Date('2026-05-09T12:30:45.123Z'),
    pid: 42,
    randomSuffix: 'abc123'
  });

  assert.equal(plan.runId, '20260509-123045-123-p42-abc123');
  assert.equal(
    plan.runDirectory,
    path.join('D:\\Logs', 'sessions', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'runs', '20260509-123045-123-p42-abc123')
  );
  assert.equal(plan.eventLogFile, path.join(plan.runDirectory, 'events.jsonl'));
  assert.equal(plan.transcriptFile, path.join(plan.runDirectory, 'transcript.log'));
  assert.equal(plan.metaFile, path.join(plan.runDirectory, 'meta.json'));
  assert.equal(
    plan.latestRunFile,
    path.join('D:\\Logs', 'sessions', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'latest-run.json')
  );
});

test('preserves explicit log file paths while keeping run metadata discoverable', () => {
  const plan = createRunLogPlan({
    logRoot: 'D:\\Logs',
    sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    now: new Date('2026-05-09T12:30:45.123Z'),
    pid: 42,
    randomSuffix: 'abc123',
    eventLogFile: 'D:\\Custom\\events.jsonl',
    transcriptFile: 'D:\\Custom\\transcript.log'
  });

  assert.equal(plan.eventLogFile, 'D:\\Custom\\events.jsonl');
  assert.equal(plan.transcriptFile, 'D:\\Custom\\transcript.log');
  assert.equal(plan.metaFile, path.join(plan.runDirectory, 'meta.json'));
  assert.equal(plan.latestRunFile, path.join('D:\\Logs', 'sessions', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'latest-run.json'));
});

test('writes run metadata and latest-run pointer as JSON files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-run-logs-'));
  const plan = createRunLogPlan({
    logRoot: dir,
    sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    now: new Date('2026-05-09T12:30:45.123Z'),
    pid: 42,
    randomSuffix: 'abc123'
  });

  await writeRunMetadata({
    plan,
    metadata: {
      sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      runId: plan.runId,
      status: 'running',
      maxTurns: 10
    }
  });
  await writeLatestRunPointer({ plan });

  const meta = JSON.parse(await fs.readFile(plan.metaFile, 'utf8'));
  const latest = JSON.parse(await fs.readFile(plan.latestRunFile, 'utf8'));

  assert.equal(meta.status, 'running');
  assert.equal(meta.maxTurns, 10);
  assert.equal(latest.sessionId, 'ffffffff-ffff-ffff-ffff-ffffffffffff');
  assert.equal(latest.runId, plan.runId);
  assert.equal(latest.runDirectory, plan.runDirectory);
  assert.equal(latest.eventLogFile, plan.eventLogFile);
  assert.equal(latest.transcriptFile, plan.transcriptFile);
  assert.equal(latest.metaFile, plan.metaFile);
});
