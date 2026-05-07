const pathModule = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');

const { getCodexExecArgumentList, invokeCodexCommand, getCodexExecutablePath, convertToProcessArgumentString } = require('./codex');
const { writeAutopilotLog } = require('./log');
const { createStatusLine, formatStatusLine } = require('./status-line');
const { getAutopilotResumeTurn, readAutopilotRunState, writeAutopilotRunState } = require('./state');
const { readTextFileIfExists } = require('./text');
const { ui } = require('./ui');

async function invokeCodexAutopilot({
  maxTurns = 50,
  sleepSeconds = 3,
  retryCount = 0,
  retryDelaySeconds = 5,
  lastMessageFile,
  logFile,
  turnStallTimeoutSeconds = 1800,
  lastMessageStableSeconds = 30,
  resumePrompt,
  sessionId = '',
  workingDirectory = '',
  runStateFile,
  codexExecutionMode = 'yolo',
  codexSandboxMode = 'workspace-write',
  codexProfile = '',
  codexRunner,
  writeHost = console.log,
  setWindowTitle = setDefaultWindowTitle,
  sleep = defaultSleep
}) {
  const log = async (message) => writeAutopilotLog(logFile, message);
  const statusLine = createStatusLine({ writeHost });
  const writeOutput = (message = '') => statusLine.println(message);
  const workingDirectoryName = workingDirectory ? pathModule.basename(workingDirectory) : '';
  const restoreLogs = [];
  let turn = getAutopilotResumeTurn({
    state: await readAutopilotRunState(runStateFile),
    maxTurns,
    sessionId,
    workingDirectory,
    log: (message) => restoreLogs.push(message)
  });
  for (const message of restoreLogs) await log(message);

  if (turn >= maxTurns) {
    setWindowTitle(getWindowTitle({ phase: 'Completed' }));
    statusLine.finish(formatStatusLine({
      phase: '已完成',
      turn: maxTurns,
      maxTurns,
      retryAttempt: 0,
      retryCount,
      sessionId,
      workingDirectoryName
    }));
    writeOutput(ui.maxTurnsReached.replace('{0}', maxTurns));
    return 0;
  }

  let lastMessage = '';
  while (turn < maxTurns) {
    turn += 1;
    await log(`event=turn_start turn=${turn} max_turns=${maxTurns} session_id=${sessionId || '-'} working_directory=${workingDirectory || '-'}`);
    setWindowTitle(getWindowTitle({ phase: 'Running', turn, maxTurns }));
    statusLine.render(formatStatusLine({
      phase: '运行中',
      turn,
      maxTurns,
      retryAttempt: 0,
      retryCount,
      sessionId,
      workingDirectoryName
    }));
    writeOutput('');
    writeOutput(getTurnBanner({ turn, maxTurns, phase: 'Begin' }));

    const args = getCodexExecArgumentList({
      lastMessageFile,
      resumePrompt,
      sessionId,
      codexExecutionMode,
      codexSandboxMode,
      codexProfile
    });

    let attempt = 0;
    let exitCode = 0;
    let stallRecovered = false;
    do {
      statusLine.render(formatStatusLine({
        phase: attempt > 0 ? '重试中' : '运行中',
        turn,
        maxTurns,
        retryAttempt: attempt,
        retryCount,
        sessionId,
        workingDirectoryName
      }));
      await clearLastMessageFile({ path: lastMessageFile, turn, attempt, log });
      const executablePath = codexRunner ? 'codex' : getCodexExecutablePath();
      const commandForLog = convertToProcessArgumentString([executablePath, ...args]);
      await log(`event=exec_invoke turn=${turn} attempt=${attempt} command=${commandForLog}`);
      const commandResult = await runCodex({
        codexRunner,
        args,
        turn,
        attempt,
        workingDirectory,
        lastMessageFile,
        turnStallTimeoutSeconds,
        lastMessageStableSeconds,
        log
      });

      if (Number.isInteger(commandResult)) {
        exitCode = commandResult;
        stallRecovered = false;
      } else if (commandResult && Number.isInteger(commandResult.exitCode)) {
        exitCode = commandResult.exitCode;
        stallRecovered = Boolean(commandResult.stallRecovered);
      } else {
        throw new Error('codexRunner returned an unsupported result');
      }

      await log(`event=exec_exit turn=${turn} exit_code=${exitCode}`);
      if (exitCode !== 0 && attempt < retryCount) {
        attempt += 1;
        await log(`event=exec_retry turn=${turn} attempt=${attempt} max_retries=${retryCount} exit_code=${exitCode} failure_class=exec_exit_nonzero delay_seconds=${retryDelaySeconds}`);
        if (retryDelaySeconds > 0) await sleep(retryDelaySeconds);
      } else {
        break;
      }
    } while (true);

    if (exitCode !== 0) {
      const stopReason = retryCount > 0 ? 'exec_retry_exhausted' : 'exec_exit_nonzero';
      lastMessage = await readLastMessageFile({ path: lastMessageFile, turn, log });
      setWindowTitle(getWindowTitle({ phase: 'Failed', exitCode }));
      statusLine.finish(formatStatusLine({
        phase: '失败',
        turn,
        maxTurns,
        retryAttempt: attempt,
        retryCount,
        sessionId,
        workingDirectoryName
      }));
      await log(`event=stop reason=${stopReason} turn=${turn} exit_code=${exitCode}`);
      await writeAutopilotRunState({
        path: runStateFile,
        turn,
        maxTurns,
        lastExitCode: exitCode,
        stopReason,
        sessionId,
        workingDirectory,
        lastMessage,
        stallRecovered
      });
      writeOutput(ui.execExitCode.replace('{0}', exitCode));
      return exitCode;
    }

    lastMessage = await readLastMessageFile({ path: lastMessageFile, turn, log });
    if (lastMessage.trim()) {
      writeOutput('');
      writeOutput(ui.lastMessageHeader);
      writeOutput(lastMessage.trimEnd());
      writeOutput('----------------------------');
    }

    writeOutput(getTurnBanner({ turn, maxTurns, phase: 'End' }));
    await log(`event=turn_end turn=${turn} exit_code=${exitCode}`);
    await writeAutopilotRunState({
      path: runStateFile,
      turn,
      maxTurns,
      lastExitCode: exitCode,
      stopReason: turn < maxTurns ? 'loop_continue' : 'max_turns_reached',
      sessionId,
      workingDirectory,
      lastMessage,
      stallRecovered
    });

    if (turn < maxTurns) {
      statusLine.render(formatStatusLine({
        phase: '休眠中',
        turn,
        maxTurns,
        retryAttempt: attempt,
        retryCount,
        sessionId,
        workingDirectoryName,
        sleepSeconds
      }));
      await log(`event=sleep_start turn=${turn} seconds=${sleepSeconds}`);
      if (sleepSeconds > 0) await sleep(sleepSeconds);
      await log(`event=sleep_end turn=${turn}`);
      await log(`event=loop_continue next_turn=${turn + 1}`);
    }
  }

  setWindowTitle(getWindowTitle({ phase: 'Completed' }));
  statusLine.finish(formatStatusLine({
    phase: '已完成',
    turn,
    maxTurns,
    retryAttempt: 0,
    retryCount,
    sessionId,
    workingDirectoryName
  }));
  await log(`event=stop reason=max_turns_reached turn=${turn} exit_code=0`);
  await writeAutopilotRunState({
    path: runStateFile,
    turn,
    maxTurns,
    lastExitCode: 0,
    stopReason: 'max_turns_reached',
    sessionId,
    workingDirectory,
    lastMessage,
    stallRecovered: false
  });
  writeOutput(ui.maxTurnsReached.replace('{0}', maxTurns));
  return 0;
}

async function runCodex({
  codexRunner,
  args,
  turn,
  attempt,
  workingDirectory,
  lastMessageFile,
  turnStallTimeoutSeconds,
  lastMessageStableSeconds,
  log
}) {
  if (codexRunner) {
    return codexRunner({ args, turn, attempt, cwd: workingDirectory });
  }
  return invokeCodexCommand({
    argumentList: args,
    cwd: workingDirectory,
    turn,
    lastMessageFile,
    turnStallTimeoutSeconds,
    lastMessageStableSeconds,
    log
  });
}

async function clearLastMessageFile({ path, turn, attempt, log }) {
  const directory = pathModule.dirname(path);
  if (directory && directory !== '.') {
    await mkdir(directory, { recursive: true });
  }
  await writeFile(path, '', 'utf8');
  await log(`event=last_message_cleared turn=${turn} attempt=${attempt}`);
}

async function readLastMessageFile({ path, turn, log }) {
  const message = await readTextFileIfExists(path);
  await log(`event=last_message_read turn=${turn} length=${message.length}`);
  return message;
}

function getTurnBanner({ turn, maxTurns, phase = 'Begin' }) {
  const label = phase === 'End' ? '结束' : '开始';
  return `========== Turn ${turn} / ${maxTurns} ${label} ==========`;
}

function getWindowTitle({ phase = 'Idle', turn = 0, maxTurns = 0, exitCode = 0 }) {
  if (phase === 'Running') return `codex-autopilot | Turn ${turn}/${maxTurns}`;
  if (phase === 'Completed') return 'codex-autopilot | 已完成';
  if (phase === 'Failed') return `codex-autopilot | 失败(${exitCode})`;
  return 'codex-autopilot';
}

function setDefaultWindowTitle(title) {
  process.title = title;
}

function defaultSleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

module.exports = {
  invokeCodexAutopilot,
  getTurnBanner,
  getWindowTitle
};
