const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const fs = require('node:fs/promises');

const {
  getAutopilotResumeTurn,
  readAutopilotRunState,
  writeAutopilotRunState
} = require('../src/state');

test('writes run state with last message summary', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-state-'));
  const file = path.join(dir, 'run-state.json');

  await writeAutopilotRunState({
    path: file,
    turn: 2,
    maxTurns: 5,
    lastExitCode: 0,
    stopReason: 'loop_continue',
    sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: 'D:\\Work',
    lastMessage: '继续执行',
    stallRecovered: false
  });

  const state = await readAutopilotRunState(file);
  assert.equal(state.turn, 2);
  assert.equal(state.max_turns, 5);
  assert.equal(state.last_message_length, '继续执行'.length);
  assert.match(state.last_message_sha256, /^[a-f0-9]{64}$/);
});

test('resumes from next turn after loop_continue for same session and cwd', () => {
  const logs = [];
  const turn = getAutopilotResumeTurn({
    state: {
      session_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      working_directory: 'D:\\Work',
      turn: 2,
      last_exit_code: 0,
      stop_reason: 'loop_continue'
    },
    maxTurns: 5,
    sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: 'D:\\Work',
    log: (message) => logs.push(message)
  });

  assert.equal(turn, 2);
  assert.deepEqual(logs, ['event=run_state_restored turn=2 next_turn=3']);
});

test('ignores completed run states instead of resuming', () => {
  const logs = [];
  const turn = getAutopilotResumeTurn({
    state: {
      session_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      working_directory: 'D:\\Work',
      turn: 5,
      last_exit_code: 0,
      stop_reason: 'max_turns_reached'
    },
    maxTurns: 5,
    sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: 'D:\\Work',
    log: (message) => logs.push(message)
  });

  assert.equal(turn, 0);
  assert.deepEqual(logs, ['event=run_state_ignored reason=max_turns_reached turn=5 exit_code=0']);
});

test('ignores state with a different working directory', () => {
  const logs = [];
  const turn = getAutopilotResumeTurn({
    state: {
      session_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      working_directory: 'D:\\Other',
      turn: 1,
      last_exit_code: 0,
      stop_reason: 'loop_continue'
    },
    maxTurns: 5,
    sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    workingDirectory: 'D:\\Work',
    log: (message) => logs.push(message)
  });

  assert.equal(turn, 0);
  assert.deepEqual(logs, ['event=run_state_ignored reason=working_directory_mismatch']);
});
