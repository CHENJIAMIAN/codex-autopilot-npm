const assert = require('node:assert/strict');
const test = require('node:test');

const { parseArgs } = require('../src/cli');

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
