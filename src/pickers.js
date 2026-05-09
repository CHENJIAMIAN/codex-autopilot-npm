const childProcess = require('node:child_process');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');

const { ui, getDefaultMaxTurnOptions, getDefaultResumePromptOptions } = require('./ui');
const { readTextFileIfExists } = require('./text');
const { getCodexSessionEntries } = require('./sessions');

async function getResumePromptOptions(promptsFile) {
  const promptFiles = Array.isArray(promptsFile) ? promptsFile : [promptsFile];
  for (const promptFile of promptFiles) {
    if (!promptFile) continue;
    const content = await readTextFileIfExists(promptFile);
    const options = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (options.length > 0) return options;
  }
  return getDefaultResumePromptOptions();
}

const CUSTOM_PROMPT = Symbol('customResumePrompt');

async function selectResumePrompt({ promptsFile, getOptions = getResumePromptOptions, rl = createReadline(), output: out = output } = {}) {
  const options = await getOptions(promptsFile);
  const entries = options.map((value, index) => ({
    index: index + 1,
    label: getPromptLabel(value),
    value
  }));
  entries.push({
    index: entries.length + 1,
    label: ui.promptLabelCustom,
    value: CUSTOM_PROMPT
  });

  const selected = await selectNumbered({
    entries,
    prompt: ui.selectPromptPrompt,
    emptyMessage: ui.noPromptSelected,
    rl,
    output: out
  });
  if (selected !== CUSTOM_PROMPT) return selected;

  const customPrompt = (await rl.question(ui.customPromptInput)).trim();
  if (!customPrompt) throw new Error(ui.noPromptSelected);
  return customPrompt;
}

function getPromptLabel(value) {
  if (value === ui.resumePrompt) return ui.promptLabelDefault;
  if (value === ui.resumePromptShort) return ui.promptLabelShort;
  if (value === ui.resumePromptOkay) return ui.promptLabelOkay;
  return value;
}

async function selectMaxTurns({ rl = createReadline(), output: out = output } = {}) {
  const entries = getDefaultMaxTurnOptions().map((value, index) => ({
    index: index + 1,
    label: value === 50 ? ui.maxTurnsLabelDefault : String(value),
    value
  }));
  return selectNumbered({
    entries,
    prompt: ui.selectMaxTurnsPrompt,
    emptyMessage: ui.noMaxTurnsSelected,
    rl,
    output: out
  });
}

async function selectNumbered({ entries, prompt, emptyMessage, rl, output: out = output }) {
  if (!entries.length) throw new Error(emptyMessage);
  out.write(`${prompt}\n`);
  for (const entry of entries) {
    out.write(`[${entry.index}] ${entry.label}\n`);
  }
  while (true) {
    const answer = (await rl.question('> ')).trim();
    if (!answer) throw new Error(emptyMessage);
    const index = Number.parseInt(answer, 10);
    if (Number.isInteger(index) && index >= 1 && index <= entries.length) {
      return entries[index - 1].value;
    }
    out.write(`${ui.invalidSelection}\n`);
  }
}

function findCommand(command) {
  const result = childProcess.spawnSync(process.platform === 'win32' ? 'where.exe' : 'command', process.platform === 'win32' ? [command] : ['-v', command], {
    encoding: 'utf8',
    shell: process.platform !== 'win32'
  });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return result.stdout.split(/\r?\n/).find(Boolean).trim();
}

async function selectCodexSession({ entries }) {
  if (!entries || entries.length === 0) throw new Error(ui.noSessionsFound);
  const fzf = findCommand('fzf');
  if (fzf) {
    const options = entries.map((entry) => {
      const workingDirectory = entry.workingDirectory || '-';
      return `${entry.sessionId}\t[${entry.timestamp}]\t${workingDirectory}\t${entry.preview}`;
    });
    const selected = childProcess.spawnSync(fzf, ['--prompt', ui.selectSessionPrompt, '--height', '20', '--reverse'], {
      input: options.join('\n'),
      encoding: 'utf8'
    });
    const line = selected.stdout.trim();
    if (!line) throw new Error(ui.noSessionSelected);
    const selectedId = line.split('\t', 1)[0];
    return entries.find((entry) => entry.sessionId === selectedId);
  }

  const rl = createReadline();
  output.write(`${ui.recentSessions}\n`);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const workingDirectory = entry.workingDirectory || '-';
    output.write(`[${index + 1}] ${entry.sessionId} [${entry.timestamp}] ${workingDirectory} | ${entry.preview}\n`);
  }
  while (true) {
    const answer = (await rl.question(`${ui.selectSessionNumber}: `)).trim();
    const index = Number.parseInt(answer, 10);
    if (Number.isInteger(index) && index >= 1 && index <= entries.length) {
      rl.close();
      return entries[index - 1];
    }
    output.write(`${ui.invalidSelection}\n`);
  }
}

async function resolveSessionContext({ sessionId, sessionsDir, sessionLimit = 30 }) {
  if (sessionId) {
    const entries = await getCodexSessionEntries({ sessionsDir, maxCount: Number.MAX_SAFE_INTEGER });
    const entry = entries.find((candidate) => candidate.sessionId === sessionId);
    if (!entry || !entry.workingDirectory) throw new Error(ui.noSessionWorkingDirectory);
    return { sessionId, workingDirectory: entry.workingDirectory };
  }

  const entries = await getCodexSessionEntries({ sessionsDir, maxCount: sessionLimit });
  const selected = await selectCodexSession({ entries });
  if (!selected.workingDirectory) throw new Error(ui.noSessionWorkingDirectory);
  output.write(`${ui.resumingSession.replace('{0}', selected.sessionId)}\n`);
  return { sessionId: selected.sessionId, workingDirectory: selected.workingDirectory };
}

async function resolveInteractiveRunOptions({
  resumePrompt,
  maxTurns,
  hasResumePrompt,
  hasMaxTurns,
  resumePromptsFile
}) {
  let resolvedPrompt = resumePrompt;
  let resolvedMaxTurns = maxTurns;
  if (!hasResumePrompt) {
    const rl = createReadline();
    try {
      resolvedPrompt = await selectResumePrompt({ promptsFile: resumePromptsFile, rl });
      if (!hasMaxTurns) {
        resolvedMaxTurns = await selectMaxTurns({ rl });
      }
    } finally {
      rl.close();
    }
  }

  return {
    resumePrompt: resolvedPrompt,
    maxTurns: resolvedMaxTurns
  };
}

function createReadline() {
  return readline.createInterface({ input, output });
}

module.exports = {
  getResumePromptOptions,
  selectResumePrompt,
  selectMaxTurns,
  selectCodexSession,
  resolveSessionContext,
  resolveInteractiveRunOptions,
  findCommand
};
