const assert = require('node:assert/strict');
const test = require('node:test');

const { selectResumePrompt, resolveSessionContext } = require('../src/pickers');

test('allows custom resume prompt from interactive picker', async () => {
  const questions = [];
  const answers = ['1', '自定义继续提示'];
  const rl = {
    question: async (prompt) => {
      questions.push(prompt);
      return answers.shift();
    }
  };

  const selected = await selectResumePrompt({
    getOptions: async () => [],
    rl,
    output: { write: () => {} }
  });

  assert.equal(selected, '自定义继续提示');
  assert.deepEqual(questions, ['> ', '请输入自定义提示语: ']);
});

test('rejects blank custom resume prompt', async () => {
  const rl = {
    question: async (prompt) => prompt === '> ' ? '1' : '   '
  };

  await assert.rejects(
    () => selectResumePrompt({
      getOptions: async () => [],
      rl,
      output: { write: () => {} }
    }),
    /未选择任何提示语/
  );
});

test('limits session scan count even when fzf is available', async () => {
  const originalLoad = require('node:module')._load;
  const calls = [];
  const fakeSessions = {
    getCodexSessionEntries: async ({ maxCount }) => {
      calls.push(maxCount);
      return [{
        sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        workingDirectory: 'D:\\Work',
        timestamp: '2026-05-07 10:00:00',
        preview: '继续'
      }];
    }
  };
  const fakeChildProcess = {
    spawnSync: (command, args) => {
      if (String(command).includes('where')) {
        return { status: 0, stdout: 'C:\\Tools\\fzf.exe\r\n' };
      }
      return { stdout: 'ffffffff-ffff-ffff-ffff-ffffffffffff\t[2026-05-07 10:00:00]\tD:\\Work\t继续\r\n' };
    }
  };

  require('node:module')._load = function patched(request, parent, isMain) {
    if (request === './sessions' && parent && parent.filename.endsWith('src\\pickers.js')) {
      return fakeSessions;
    }
    if (request === 'node:child_process' && parent && parent.filename.endsWith('src\\pickers.js')) {
      return fakeChildProcess;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve('../src/pickers')];
  const reloadedPickers = require('../src/pickers');

  try {
    const context = await reloadedPickers.resolveSessionContext({
      sessionsDir: 'C:\\Users\\Administrator\\.codex\\sessions',
      sessionLimit: 30
    });

    assert.deepEqual(calls, [30]);
    assert.deepEqual(context, {
      sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      workingDirectory: 'D:\\Work'
    });
  } finally {
    require('node:module')._load = originalLoad;
    delete require.cache[require.resolve('../src/pickers')];
  }
});
