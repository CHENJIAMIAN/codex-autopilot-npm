const { readTextFileUtf8, writeTextFileUtf8Atomic, getTextSha256 } = require('./text');

async function writeAutopilotRunState({
  path,
  turn,
  maxTurns,
  lastExitCode,
  stopReason = '',
  sessionId = '',
  workingDirectory = '',
  lastMessage = '',
  stallRecovered = false
}) {
  if (!path) return;
  const message = lastMessage ?? '';
  const state = {
    updated_at: new Date().toISOString(),
    session_id: sessionId || '',
    working_directory: workingDirectory || '',
    turn,
    max_turns: maxTurns,
    last_exit_code: lastExitCode,
    stop_reason: stopReason,
    stall_recovered: Boolean(stallRecovered),
    last_message_length: message.length,
    last_message_sha256: getTextSha256(message)
  };

  await writeTextFileUtf8Atomic(path, `${JSON.stringify(state, null, 2)}\n`);
}

async function readAutopilotRunState(path) {
  if (!path) return null;
  try {
    const content = await readTextFileUtf8(path);
    if (!content.trim()) return null;
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    return { invalid: true, error: error.message };
  }
}

function runStateValueEquals(actual, expected) {
  if (!expected || !String(expected).trim()) {
    return !actual || !String(actual).trim();
  }
  return String(actual ?? '').trim() === String(expected).trim();
}

function toRunStateInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && String(value).trim() === String(parsed) ? parsed : null;
}

function getAutopilotResumeTurn({
  state,
  maxTurns,
  sessionId = '',
  workingDirectory = '',
  log = () => {}
}) {
  if (!state) return 0;

  if (state.invalid) {
    log(`event=run_state_ignored reason=invalid_json message=${state.error}`);
    return 0;
  }

  if (!runStateValueEquals(state.session_id, sessionId)) {
    log('event=run_state_ignored reason=session_mismatch');
    return 0;
  }

  if (!runStateValueEquals(state.working_directory, workingDirectory)) {
    log('event=run_state_ignored reason=working_directory_mismatch');
    return 0;
  }

  const stateTurn = toRunStateInt(state.turn);
  const stateExitCode = toRunStateInt(state.last_exit_code);
  const stateStopReason = String(state.stop_reason || '');

  if (stateTurn === null || stateExitCode === null || stateTurn < 1) {
    log('event=run_state_ignored reason=invalid_fields');
    return 0;
  }

  if (stateStopReason !== 'loop_continue' || stateExitCode !== 0) {
    log(`event=run_state_ignored reason=${stateStopReason || 'unknown'} turn=${stateTurn} exit_code=${stateExitCode}`);
    return 0;
  }

  if (stateTurn >= maxTurns) {
    log(`event=run_state_complete turn=${stateTurn} max_turns=${maxTurns}`);
    return maxTurns;
  }

  log(`event=run_state_restored turn=${stateTurn} next_turn=${stateTurn + 1}`);
  return stateTurn;
}

module.exports = {
  writeAutopilotRunState,
  readAutopilotRunState,
  getAutopilotResumeTurn
};
