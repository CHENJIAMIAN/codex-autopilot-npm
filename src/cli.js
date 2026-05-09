#!/usr/bin/env node
const os = require('node:os');
const path = require('node:path');

const { invokeCodexAutopilot } = require('./autopilot');
const { resolveInteractiveRunOptions, resolveSessionContext } = require('./pickers');
const { getResumePromptOptions } = require('./pickers');
const { EXECUTION_MODES, SANDBOX_MODES } = require('./codex');
const { createRunLogPlan, writeLatestRunPointer, writeRunMetadata } = require('./run-logs');

const packageRoot = path.resolve(__dirname, '..');

const optionMap = new Map([
  ['maxturns', { property: 'maxTurns', type: 'int' }],
  ['sleepseconds', { property: 'sleepSeconds', type: 'int' }],
  ['retrycount', { property: 'retryCount', type: 'int' }],
  ['retrydelayseconds', { property: 'retryDelaySeconds', type: 'int' }],
  ['lastmessagefile', { property: 'lastMessageFile', type: 'string' }],
  ['logfile', { property: 'logFile', type: 'string' }],
  ['eventlogfile', { property: 'logFile', type: 'string' }],
  ['transcriptfile', { property: 'transcriptFile', type: 'string' }],
  ['logroot', { property: 'logRoot', type: 'string' }],
  ['turnstalltimeoutseconds', { property: 'turnStallTimeoutSeconds', type: 'int' }],
  ['lastmessagestableseconds', { property: 'lastMessageStableSeconds', type: 'int' }],
  ['resumeprompt', { property: 'resumePrompt', type: 'string' }],
  ['resumepromptsfile', { property: 'resumePromptsFile', type: 'string' }],
  ['sessionsdir', { property: 'sessionsDir', type: 'string' }],
  ['sessionid', { property: 'sessionId', type: 'string' }],
  ['sessionlimit', { property: 'sessionLimit', type: 'int' }],
  ['runstatefile', { property: 'runStateFile', type: 'string' }],
  ['codexexecutionmode', { property: 'codexExecutionMode', type: 'string' }],
  ['codexsandboxmode', { property: 'codexSandboxMode', type: 'string' }],
  ['codexprofile', { property: 'codexProfile', type: 'string' }],
  ['headless', { property: 'headless', type: 'boolean' }]
]);

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const options = getDefaultOptions(env);
  const providedOptions = new Set();
  options.providedOptions = providedOptions;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h' || token === '/?') {
      options.help = true;
      continue;
    }
    if (token === '--version' || token === '-v') {
      options.version = true;
      continue;
    }
    if (!token.startsWith('-')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const normalized = normalizeOptionName(token);
    const descriptor = optionMap.get(normalized);
    if (!descriptor) {
      throw new Error(`Unknown option: ${token}`);
    }
    if (descriptor.type === 'boolean') {
      options[descriptor.property] = true;
      providedOptions.add(descriptor.property);
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`Missing value for option: ${token}`);
    }
    index += 1;

    options[descriptor.property] = coerceOptionValue(token, value, descriptor.type);
    providedOptions.add(descriptor.property);
  }

  validateOptions(options);
  return options;
}

function getDefaultOptions(env = process.env) {
  return {
    maxTurns: 50,
    sleepSeconds: 3,
    retryCount: 0,
    retryDelaySeconds: 5,
    lastMessageFile: path.join(os.tmpdir(), `codex_last_msg_${process.pid}.txt`),
    logFile: undefined,
    transcriptFile: undefined,
    logRoot: path.join(packageRoot, 'logs'),
    turnStallTimeoutSeconds: 1800,
    lastMessageStableSeconds: 30,
    resumePrompt: undefined,
    resumePromptsFile: [
      path.join(getUserConfigDirectory(env), 'resume-prompts.txt'),
      path.join(packageRoot, 'resume-prompts.txt')
    ],
    sessionsDir: path.join(env.HOME || os.homedir(), '.codex', 'sessions'),
    sessionId: undefined,
    sessionLimit: 30,
    runStateFile: path.join(packageRoot, 'run-state.json'),
    codexExecutionMode: 'yolo',
    codexSandboxMode: 'workspace-write',
    codexProfile: undefined,
    headless: false,
    help: false,
    version: false
  };
}

function getUserConfigDirectory(env = process.env) {
  return path.join(env.USERPROFILE || env.HOME || os.homedir(), '.codex-autopilot');
}

function normalizeOptionName(token) {
  return token.replace(/^-+/, '').replace(/-/g, '').toLowerCase();
}

function coerceOptionValue(token, value, type) {
  if (type === 'int') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || String(parsed) !== String(value)) {
      throw new Error(`Invalid integer for option ${token}: ${value}`);
    }
    return parsed;
  }
  return value;
}

function validateOptions(options) {
  if (!EXECUTION_MODES.has(options.codexExecutionMode)) {
    throw new Error(`Unsupported codex execution mode: ${options.codexExecutionMode}`);
  }
  if (!SANDBOX_MODES.has(options.codexSandboxMode)) {
    throw new Error(`Unsupported codex sandbox mode: ${options.codexSandboxMode}`);
  }
}

async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const options = parseArgs(argv);
  if (options.help) {
    stdout.write(getHelpText());
    return 0;
  }
  if (options.version) {
    stdout.write(`${require('../package.json').version}\n`);
    return 0;
  }
  if (options.headless && !options.sessionId) {
    throw new Error('--headless requires --session-id');
  }

  if (!options.providedOptions.has('resumePrompt')) {
    const prompts = await getResumePromptOptions(options.resumePromptsFile);
    options.resumePrompt = prompts[0];
  }

  const sessionContext = await resolveSessionContext({
    sessionId: options.sessionId,
    sessionsDir: options.sessionsDir,
    sessionLimit: options.sessionLimit
  });

  const runOptions = options.headless ? {
    resumePrompt: options.resumePrompt,
    maxTurns: options.maxTurns
  } : await resolveInteractiveRunOptions({
    resumePrompt: options.resumePrompt,
    maxTurns: options.maxTurns,
    hasResumePrompt: options.providedOptions.has('resumePrompt'),
    hasMaxTurns: options.providedOptions.has('maxTurns'),
    resumePromptsFile: options.resumePromptsFile
  });

  const runLog = await initializeRunLogs({
    options,
    sessionContext,
    runOptions
  });

  try {
    const exitCode = await invokeCodexAutopilot({
      ...options,
      maxTurns: runOptions.maxTurns,
      resumePrompt: runOptions.resumePrompt,
      sessionId: sessionContext.sessionId,
      workingDirectory: sessionContext.workingDirectory,
      logFile: runLog.plan.eventLogFile,
      transcriptFile: runLog.plan.transcriptFile,
      runId: runLog.plan.runId,
      runLogMetaFile: runLog.plan.metaFile
    });
    await writeRunMetadata({
      plan: runLog.plan,
      metadata: {
        ...runLog.metadata,
        status: exitCode === 0 ? 'completed' : 'failed',
        exitCode,
        finishedAt: new Date().toISOString()
      }
    });
    return exitCode;
  } catch (error) {
    await writeRunMetadata({
      plan: runLog.plan,
      metadata: {
        ...runLog.metadata,
        status: 'error',
        errorMessage: error.message,
        finishedAt: new Date().toISOString()
      }
    });
    throw error;
  }
}

async function initializeRunLogs({
  options,
  sessionContext,
  runOptions,
  now = new Date()
}) {
  const plan = createRunLogPlan({
    logRoot: options.logRoot,
    sessionId: sessionContext.sessionId,
    eventLogFile: options.logFile,
    transcriptFile: options.transcriptFile,
    now
  });
  const metadata = {
    sessionId: sessionContext.sessionId,
    runId: plan.runId,
    status: 'running',
    startedAt: now.toISOString(),
    workingDirectory: sessionContext.workingDirectory,
    maxTurns: runOptions.maxTurns,
    codexExecutionMode: options.codexExecutionMode,
    codexSandboxMode: options.codexSandboxMode,
    codexProfile: options.codexProfile || '',
    logRoot: options.logRoot,
    runDirectory: plan.runDirectory,
    transcriptFile: plan.transcriptFile,
    eventLogFile: plan.eventLogFile,
    metaFile: plan.metaFile
  };

  await writeRunMetadata({ plan, metadata });
  await writeLatestRunPointer({ plan });

  return {
    plan,
    metadata
  };
}

function getHelpText() {
  return `codex-autopilot

Usage:
  codex-autopilot [options]

Options:
  --max-turns <n>                  Maximum turn count
  --session-id <uuid>              Resume an explicit Codex session
  --resume-prompt <text>           Prompt used for every resume turn
  --resume-prompts-file <path>     Use this prompts file instead of the user/bundled defaults
  --headless                       Disable interactive pickers; requires --session-id
  --log-root <path>                Directory for default per-run logs
  --transcript-file <path>         Write visible output transcript to this file
  --event-log-file <path>          Write structured event JSONL to this file
  --codex-execution-mode <mode>    yolo, full-auto, or sandbox
  --codex-sandbox-mode <mode>      read-only, workspace-write, or danger-full-access
  --retry-count <n>                Retry non-zero Codex exits on the same turn
  --help                           Show help

PowerShell-style names such as -MaxTurns and -SessionId are accepted.
`;
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  main,
  getHelpText,
  getUserConfigDirectory,
  normalizeOptionName
};
