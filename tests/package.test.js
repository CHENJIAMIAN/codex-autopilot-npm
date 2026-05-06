const assert = require('node:assert/strict');
const test = require('node:test');

const packageJson = require('../package.json');

test('exposes both full command and short alias', () => {
  assert.equal(packageJson.bin['codex-autopilot'], 'src/cli.js');
  assert.equal(packageJson.bin.cauto, 'src/cli.js');
});
