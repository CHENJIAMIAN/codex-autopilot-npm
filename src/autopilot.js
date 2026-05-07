const pathModule = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');

const { getCodexExecArgumentList, invokeCodexCommand, getCodexExecutablePath, convertToProcessArgumentString } = require('./codex');
const { writeAutopilotLog } = require('./log');
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
  titleRefreshIntervalMs = 1000,
  writeHost = console.log,
  setWindowTitle = setDefaultWindowTitle,
  sleep = defaultSleep
}) {
  const log = async (message) => writeAutopilotLog(logFile, message);
  const titleGuard = createWindowTitleGuard({
    setWindowTitle,
    refreshIntervalMs: titleRefreshIntervalMs
  });
  try {
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
      titleGuard.set(getWindowTitle({
        phase: 'Completed',
        turn: maxTurns,
        maxTurns,
        sessionId
      }));
      writeHost(ui.maxTurnsReached.replace('{0}', maxTurns));
      return 0;
    }

    let lastMessage = '';
    while (turn < maxTurns) {
      turn += 1;
      await log(`event=turn_start turn=${turn} max_turns=${maxTurns} session_id=${sessionId || '-'} working_directory=${workingDirectory || '-'}`);
      titleGuard.set(getWindowTitle({
        phase: 'Running',
        turn,
        maxTurns,
        retryAttempt: 0,
        retryCount,
        sessionId
      }));
      writeHost('');
      writeHost(getTurnBanner({ turn, maxTurns, phase: 'Begin' }));

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
        titleGuard.set(getWindowTitle({
          phase: attempt > 0 ? 'Retrying' : 'Running',
          turn,
          maxTurns,
          retryAttempt: attempt,
          retryCount,
          sessionId
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
        titleGuard.set(getWindowTitle({
          phase: 'Failed',
          turn,
          maxTurns,
          retryAttempt: attempt,
          retryCount,
          sessionId,
          exitCode
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
        writeHost(ui.execExitCode.replace('{0}', exitCode));
        return exitCode;
      }

      lastMessage = await readLastMessageFile({ path: lastMessageFile, turn, log });
      if (lastMessage.trim()) {
        writeHost('');
        writeHost(ui.lastMessageHeader);
        writeHost(lastMessage.trimEnd());
        writeHost('----------------------------');
      }

      writeHost(getTurnBanner({ turn, maxTurns, phase: 'End' }));
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
        titleGuard.set(getWindowTitle({
          phase: 'Sleeping',
          turn,
          maxTurns,
          retryAttempt: attempt,
          retryCount,
          sessionId
        }));
        await log(`event=sleep_start turn=${turn} seconds=${sleepSeconds}`);
        if (sleepSeconds > 0) await sleep(sleepSeconds);
        await log(`event=sleep_end turn=${turn}`);
        await log(`event=loop_continue next_turn=${turn + 1}`);
      }
    }

    titleGuard.set(getWindowTitle({
      phase: 'Completed',
      turn,
      maxTurns,
      sessionId,
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
    writeHost(ui.maxTurnsReached.replace('{0}', maxTurns));
    return 0;
  } finally {
    titleGuard.stop();
  }
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

function getWindowTitle({
  phase = 'Idle',
  turn = 0,
  maxTurns = 0,
  retryAttempt = 0,
  retryCount = 0,
  sessionId = '',
  exitCode = 0
}) {
  const sessionPart = sessionId ? ` | session ${sessionId.slice(0, 8)}` : '';
  if (phase === 'Running') return `codex-autopilot | 运行中 ${turn}/${maxTurns} | retry ${retryAttempt}/${retryCount}${sessionPart}`;
  if (phase === 'Retrying') return `codex-autopilot | 重试中 ${turn}/${maxTurns} | retry ${retryAttempt}/${retryCount}${sessionPart}`;
  if (phase === 'Sleeping') return `codex-autopilot | 休眠中 ${turn}/${maxTurns} | retry ${retryAttempt}/${retryCount}${sessionPart}`;
  if (phase === 'Completed') return `codex-autopilot | 已完成 ${turn}/${maxTurns}${sessionPart}`;
  if (phase === 'Failed') return `codex-autopilot | 失败 ${turn}/${maxTurns} | retry ${retryAttempt}/${retryCount}${sessionPart} | exit ${exitCode}`;
  return 'codex-autopilot';
}

function setDefaultWindowTitle(title) {
  process.title = title;
}

function createWindowTitleGuard({
  setWindowTitle,
  refreshIntervalMs = 1000,
  timerFactory = setInterval,
  clearTimer = clearInterval
}) {
  let currentTitle = '';
  let timer = null;

  function ensureTimer() {
    if (timer || refreshIntervalMs <= 0) return;
    timer = timerFactory(() => {
      if (currentTitle) setWindowTitle(currentTitle);
    }, refreshIntervalMs);
    if (typeof timer?.unref === 'function') timer.unref();
  }

  function set(title) {
    currentTitle = title;
    setWindowTitle(title);
    ensureTimer();
  }

  function stop() {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
  }

  return {
    set,
    stop
  };
}

function defaultSleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

module.exports = {
  createWindowTitleGuard,
  invokeCodexAutopilot,
  getTurnBanner,
  getWindowTitle
};
