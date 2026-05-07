const assert = require('node:assert/strict');
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

test('rejects unsupported execution mode', () => {
  assert.throws(() => parseArgs(['--codex-execution-mode', 'unsafe']), /Unsupported codex execution mode/);
});

test('prints help through injectable stdout', async () => {
  let output = '';
  const exitCode = await main(['--help'], {
    stdout: { write: (chunk) => { output += chunk; } }
  });

  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
  assert.match(output, /--max-turns <n>/);
});

test('prints version through injectable stdout', async () => {
  let output = '';
  const exitCode = await main(['--version'], {
    stdout: { write: (chunk) => { output += chunk; } }
  });

  assert.equal(exitCode, 0);
  assert.equal(output.trim(), version);
});
