const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { main, parseArgs } = require('../src/cli');
const { version } = require('../package.json');

test('parses kebab-case options', () => {
  const options = parseArgs([
    '--max-turns', '5',
    '--session-id', 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '--codex-execution-mode', 'sandbox',
    '--codex-sandbox-mode', 'workspace-write'
  ]);

  assert.equal(options.maxTurns, 5);
  assert.equal(options.sessionId, 'ffffffff-ffff-ffff-ffff-ffffffffffff');
  assert.equal(options.codexExecutionMode, 'sandbox');
  assert.equal(options.codexSandboxMode, 'workspace-write');
});

test('parses PowerShell-style options', () => {
  const options = parseArgs([
    '-MaxTurns', '10',
    '-SessionId', 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '-RetryCount', '2'
  ]);

  assert.equal(options.maxTurns, 10);
  assert.equal(options.sessionId, 'ffffffff-ffff-ffff-ffff-ffffffffffff');
  assert.equal(options.retryCount, 2);
});

test('parses headless as a boolean flag', () => {
  const options = parseArgs([
    '--headless',
    '--max-turns', '3',
    '--session-id', 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  ]);

  assert.equal(options.headless, true);
  assert.equal(options.maxTurns, 3);
  assert.equal(options.sessionId, 'ffffffff-ffff-ffff-ffff-ffffffffffff');
});

test('defaults resume prompt files to user config before bundled prompts', () => {
  const options = parseArgs([], { USERPROFILE: 'C:\\Users\\tester' });

  assert.deepEqual(options.resumePromptsFile, [
    path.join('C:\\Users\\tester', '.codex-autopilot', 'resume-prompts.txt'),
    path.resolve(__dirname, '..', 'resume-prompts.txt')
  ]);
});

test('keeps explicit resume prompts file as the only prompts source', () => {
  const options = parseArgs(['--resume-prompts-file', 'D:\\Prompts\\custom.txt'], { USERPROFILE: 'C:\\Users\\tester' });

  assert.equal(options.resumePromptsFile, 'D:\\Prompts\\custom.txt');
});

test('rejects unsupported execution mode', () => {
  assert.throws(() => parseArgs(['--codex-execution-mode', 'unsafe']), /Unsupported codex execution mode/);
});

test('headless mode requires an explicit session id', async () => {
  await assert.rejects(
    () => main(['--headless', '--resume-prompt', '继续']),
    /--headless requires --session-id/
  );
});

test('headless mode uses defaults without interactive prompts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-cli-headless-'));
  const originalLoad = require('node:module')._load;
  const sessionId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const autopilotCalls = [];
  const fakePickers = {
    getResumePromptOptions: async () => ['默认继续'],
    resolveSessionContext: async (options) => {
      assert.equal(options.sessionId, sessionId);
      return { sessionId, workingDirectory: 'D:\\Work' };
    },
    resolveInteractiveRunOptions: async () => {
      throw new Error('should not prompt in headless mode');
    }
  };
  const fakeAutopilot = {
    invokeCodexAutopilot: async (options) => {
      autopilotCalls.push(options);
      return 0;
    }
  };

  require('node:module')._load = function patched(request, parent, isMain) {
    if (request === './pickers' && parent && parent.filename.endsWith('src\\cli.js')) {
      return fakePickers;
    }
    if (request === './autopilot' && parent && parent.filename.endsWith('src\\cli.js')) {
      return fakeAutopilot;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve('../src/cli')];
  const reloadedCli = require('../src/cli');

  try {
    const exitCode = await reloadedCli.main(['--headless', '--session-id', sessionId, '--log-root', dir]);

    assert.equal(exitCode, 0);
    assert.equal(autopilotCalls.length, 1);
    assert.equal(autopilotCalls[0].headless, true);
    assert.equal(autopilotCalls[0].maxTurns, 50);
    assert.equal(autopilotCalls[0].resumePrompt, '默认继续');
    assert.equal(autopilotCalls[0].sessionId, sessionId);
    assert.equal(autopilotCalls[0].workingDirectory, 'D:\\Work');
    assert.match(autopilotCalls[0].logFile, /events\.jsonl$/);
    assert.match(autopilotCalls[0].transcriptFile, /transcript\.log$/);
    assert.notEqual(autopilotCalls[0].logFile, autopilotCalls[0].transcriptFile);

    const meta = JSON.parse(await fs.readFile(autopilotCalls[0].runLogMetaFile, 'utf8'));
    const latest = JSON.parse(await fs.readFile(path.join(dir, 'sessions', sessionId, 'latest-run.json'), 'utf8'));
    assert.equal(meta.sessionId, sessionId);
    assert.equal(meta.status, 'completed');
    assert.equal(meta.exitCode, 0);
    assert.equal(meta.transcriptFile, autopilotCalls[0].transcriptFile);
    assert.equal(meta.eventLogFile, autopilotCalls[0].logFile);
    assert.equal(latest.runId, meta.runId);
    assert.equal(latest.transcriptFile, autopilotCalls[0].transcriptFile);
    assert.equal(latest.eventLogFile, autopilotCalls[0].logFile);
  } finally {
    require('node:module')._load = originalLoad;
    delete require.cache[require.resolve('../src/cli')];
  }
});

test('headless mode preserves explicit transcript and event log files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-autopilot-cli-logs-'));
  const eventLogFile = path.join(dir, 'custom-events.jsonl');
  const transcriptFile = path.join(dir, 'custom-transcript.log');
  const originalLoad = require('node:module')._load;
  const sessionId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const autopilotCalls = [];
  const fakePickers = {
    getResumePromptOptions: async () => ['默认继续'],
    resolveSessionContext: async () => ({ sessionId, workingDirectory: 'D:\\Work' }),
    resolveInteractiveRunOptions: async () => {
      throw new Error('should not prompt in headless mode');
    }
  };
  const fakeAutopilot = {
    invokeCodexAutopilot: async (options) => {
      autopilotCalls.push(options);
      return 0;
    }
  };

  require('node:module')._load = function patched(request, parent, isMain) {
    if (request === './pickers' && parent && parent.filename.endsWith('src\\cli.js')) {
      return fakePickers;
    }
    if (request === './autopilot' && parent && parent.filename.endsWith('src\\cli.js')) {
      return fakeAutopilot;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve('../src/cli')];
  const reloadedCli = require('../src/cli');

  try {
    const exitCode = await reloadedCli.main([
      '--headless',
      '--session-id', sessionId,
      '--log-root', dir,
      '--event-log-file', eventLogFile,
      '--transcript-file', transcriptFile
    ]);

    assert.equal(exitCode, 0);
    assert.equal(autopilotCalls[0].logFile, eventLogFile);
    assert.equal(autopilotCalls[0].transcriptFile, transcriptFile);
  } finally {
    require('node:module')._load = originalLoad;
    delete require.cache[require.resolve('../src/cli')];
  }
});

test('prints help through injectable stdout', async () => {
  let output = '';
  const exitCode = await main(['--help'], {
    stdout: { write: (chunk) => { output += chunk; } }
  });

  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
  assert.match(output, /--max-turns <n>/);
  assert.match(output, /--headless/);
});

test('prints version through injectable stdout', async () => {
  let output = '';
  const exitCode = await main(['--version'], {
    stdout: { write: (chunk) => { output += chunk; } }
  });

  assert.equal(exitCode, 0);
  assert.equal(output.trim(), version);
});
