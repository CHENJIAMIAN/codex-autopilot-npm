const assert = require('node:assert/strict');
const test = require('node:test');

const { selectResumePrompt } = require('../src/pickers');

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
