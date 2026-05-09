const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const fs = require('node:fs/promises');

const { writeAutopilotLog, writeVisibleOutputLog } = require('../src/log');

test('writes autopilot events as JSON lines', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-log-'));
  const file = path.join(dir, 'events.jsonl');

  await writeAutopilotLog(file, 'event=turn_start turn=1 max_turns=3');

  const lines = (await fs.readFile(file, 'utf8')).trim().split(/\r?\n/);
  const record = JSON.parse(lines[0]);
  assert.match(record.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(record.message, 'event=turn_start turn=1 max_turns=3');
});

test('writes visible output as raw transcript content', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-log-'));
  const file = path.join(dir, 'transcript.log');

  await writeVisibleOutputLog(file, 'hello\n');

  assert.equal(await fs.readFile(file, 'utf8'), 'hello\n');
});
