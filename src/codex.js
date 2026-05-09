const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const EXECUTION_MODES = new Set(['yolo', 'full-auto', 'sandbox']);
const SANDBOX_MODES = new Set(['read-only', 'workspace-write', 'danger-full-access']);

function getCodexExecArgumentList({
  lastMessageFile,
  resumePrompt = '',
  sessionId = '',
  codexExecutionMode = 'yolo',
  codexSandboxMode = 'workspace-write',
  codexProfile = ''
}) {
  if (!lastMessageFile) {
    throw new Error('lastMessageFile is required');
  }
  if (!EXECUTION_MODES.has(codexExecutionMode)) {
    throw new Error(`Unsupported codex execution mode: ${codexExecutionMode}`);
  }
  if (!SANDBOX_MODES.has(codexSandboxMode)) {
    throw new Error(`Unsupported codex sandbox mode: ${codexSandboxMode}`);
  }

  const args = ['exec'];
  if (codexProfile && codexProfile.trim()) {
    args.push('--profile', codexProfile);
  }

  if (codexExecutionMode === 'full-auto') {
    args.push('--full-auto');
  } else if (codexExecutionMode === 'sandbox') {
    args.push('--sandbox', codexSandboxMode);
  } else {
    args.push('--yolo');
  }

  args.push('-o', lastMessageFile);
  if (sessionId) {
    args.push('resume', sessionId, resumePrompt);
  } else {
    args.push('resume', '--last', resumePrompt);
  }
  return args;
}

function getCodexExecutablePath({
  env = process.env,
  existsSync = fs.existsSync,
  which = defaultWhich
} = {}) {
  const appData = env.APPDATA || '';
  if (appData) {
    const preferredExePath = path.join(appData, 'npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe');
    if (existsSync(preferredExePath)) return preferredExePath;

    const preferredWrapperPath = path.join(appData, 'npm\\codex.ps1');
    if (existsSync(preferredWrapperPath)) return preferredWrapperPath;
  }

  return which('codex');
}

function defaultWhich(command) {
  const resolver = process.platform === 'win32' ? 'where.exe' : 'command';
  const args = process.platform === 'win32' ? [command] : ['-v', command];
  const result = childProcess.spawnSync(resolver, args, {
    encoding: 'utf8',
    shell: process.platform !== 'win32'
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`Unable to find executable: ${command}`);
  }

  return result.stdout.split(/\r?\n/).find(Boolean).trim();
}

function startCodexProcess({
  filePath,
  argumentList,
  cwd,
  spawn = childProcess.spawn,
  stdout = process.stdout,
  stderr = process.stderr,
  onStdoutChunk,
  onStderrChunk
}) {
  const lower = filePath.toLowerCase();
  const shouldPipeOutput = Boolean(
    onStdoutChunk ||
    onStderrChunk ||
    stdout !== process.stdout ||
    stderr !== process.stderr
  );
  const stdio = shouldPipeOutput ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'];
  let processHandle;

  if (lower.endsWith('.ps1')) {
    processHandle = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'), [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      filePath,
      ...argumentList
    ], {
      cwd,
      stdio
    });
    attachProcessOutputTee(processHandle, {
      enabled: shouldPipeOutput,
      stdout,
      stderr,
      onStdoutChunk,
      onStderrChunk
    });
    return processHandle;
  }

  processHandle = spawn(filePath, argumentList, {
    cwd,
    stdio,
    shell: lower.endsWith('.cmd') || lower.endsWith('.bat')
  });
  attachProcessOutputTee(processHandle, {
    enabled: shouldPipeOutput,
    stdout,
    stderr,
    onStdoutChunk,
    onStderrChunk
  });
  return processHandle;
}

function attachProcessOutputTee({
  stdout: childStdout,
  stderr: childStderr
}, {
  enabled,
  stdout,
  stderr,
  onStdoutChunk,
  onStderrChunk
}) {
  if (!enabled) return;

  if (childStdout) {
    childStdout.on('data', (chunk) => {
      stdout.write(chunk);
      if (onStdoutChunk) onStdoutChunk(chunk);
    });
  }

  if (childStderr) {
    childStderr.on('data', (chunk) => {
      stderr.write(chunk);
      if (onStderrChunk) onStderrChunk(chunk);
    });
  }
}

function invokeCodexExecutable({
  argumentList,
  cwd,
  executablePath = getCodexExecutablePath(),
  spawn = childProcess.spawn,
  stdout = process.stdout,
  stderr = process.stderr,
  onStdoutChunk,
  onStderrChunk
}) {
  return new Promise((resolve, reject) => {
    const processHandle = startCodexProcess({
      filePath: executablePath,
      argumentList,
      cwd,
      spawn,
      stdout,
      stderr,
      onStdoutChunk,
      onStderrChunk
    });
    let exitCode = 1;
    let settled = false;
    const waitForClose = Boolean(processHandle.stdout || processHandle.stderr);

    function settle(code) {
      if (settled) return;
      settled = true;
      resolve(normalizeExitCode(code));
    }

    processHandle.once('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    processHandle.once('exit', (code) => {
      exitCode = normalizeExitCode(code);
      if (!waitForClose) settle(exitCode);
    });
    processHandle.once('close', (code) => {
      settle(Number.isInteger(code) ? code : exitCode);
    });
  });
}

function testCodexTurnStalled({
  turnStartTime,
  lastMessageFile,
  turnStallTimeoutSeconds,
  lastMessageStableSeconds,
  now = new Date()
}) {
  if (turnStallTimeoutSeconds <= 0) return false;

  let stat;
  try {
    stat = fs.statSync(lastMessageFile);
  } catch {
    return false;
  }

  if (stat.size <= 0) return false;
  const elapsedSeconds = (now.getTime() - turnStartTime.getTime()) / 1000;
  if (elapsedSeconds < turnStallTimeoutSeconds) return false;

  const stableSeconds = (now.getTime() - stat.mtime.getTime()) / 1000;
  return stableSeconds >= lastMessageStableSeconds;
}

function stopProcessTree(processId) {
  if (!processId) return;
  if (process.platform === 'win32') {
    childProcess.spawnSync('taskkill.exe', ['/PID', String(processId), '/T', '/F'], {
      stdio: 'ignore'
    });
    return;
  }
  try {
    process.kill(-processId, 'SIGKILL');
  } catch {
    try {
      process.kill(processId, 'SIGKILL');
    } catch {}
  }
}

function waitForCodexProcessExit({
  processHandle,
  turn,
  lastMessageFile,
  turnStallTimeoutSeconds,
  lastMessageStableSeconds,
  log = async () => {}
}) {
  const turnStartTime = new Date();
  return new Promise((resolve, reject) => {
    let settled = false;
    let exitCode = 1;
    const waitForClose = Boolean(processHandle.stdout || processHandle.stderr);
    const interval = setInterval(async () => {
      if (settled) return;
      if (testCodexTurnStalled({
        turnStartTime,
        lastMessageFile,
        turnStallTimeoutSeconds,
        lastMessageStableSeconds
      })) {
        settled = true;
        clearInterval(interval);
        await log(`event=turn_stall_detected turn=${turn} timeout_seconds=${turnStallTimeoutSeconds}`);
        stopProcessTree(processHandle.pid);
        await log(`event=turn_stall_recovered turn=${turn}`);
        resolve({ exitCode: 0, stallRecovered: true });
      }
    }, 1000);

    processHandle.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      reject(error);
    });
    processHandle.once('exit', (code) => {
      if (settled) return;
      exitCode = normalizeExitCode(code);
      if (!waitForClose) {
        settled = true;
        clearInterval(interval);
        resolve({ exitCode, stallRecovered: false });
      }
    });
    processHandle.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      resolve({ exitCode: Number.isInteger(code) ? code : exitCode, stallRecovered: false });
    });
  });
}

function normalizeExitCode(code) {
  return Number.isInteger(code) ? code : 1;
}

function invokeCodexCommand({
  argumentList,
  cwd,
  turn = 0,
  lastMessageFile,
  turnStallTimeoutSeconds = 0,
  lastMessageStableSeconds = 30,
  log = async () => {},
  executablePath = getCodexExecutablePath(),
  spawn = childProcess.spawn,
  stdout = process.stdout,
  stderr = process.stderr,
  onStdoutChunk,
  onStderrChunk
}) {
  if (turnStallTimeoutSeconds > 0 && lastMessageFile && turn > 0) {
    const processHandle = startCodexProcess({
      filePath: executablePath,
      argumentList,
      cwd,
      spawn,
      stdout,
      stderr,
      onStdoutChunk,
      onStderrChunk
    });
    return waitForCodexProcessExit({
      processHandle,
      turn,
      lastMessageFile,
      turnStallTimeoutSeconds,
      lastMessageStableSeconds,
      log
    });
  }

  return invokeCodexExecutable({
    argumentList,
    cwd,
    executablePath,
    spawn,
    stdout,
    stderr,
    onStdoutChunk,
    onStderrChunk
  });
}

function convertToProcessArgumentString(argumentList) {
  return argumentList.map((arg) => {
    const text = String(arg);
    if (!/[\s"]/.test(text)) return text;
    return `"${text.replace(/"/g, '\\"')}"`;
  }).join(' ');
}

module.exports = {
  getCodexExecArgumentList,
  getCodexExecutablePath,
  startCodexProcess,
  attachProcessOutputTee,
  invokeCodexExecutable,
  invokeCodexCommand,
  testCodexTurnStalled,
  waitForCodexProcessExit,
  stopProcessTree,
  convertToProcessArgumentString,
  EXECUTION_MODES,
  SANDBOX_MODES
};
