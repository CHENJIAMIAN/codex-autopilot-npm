function createStatusLine({ writeHost = console.log } = {}) {
  let activeLine = '';
  let renderedLine = '';

  function clear() {
    if (!renderedLine) return;
    writeHost(`\r${' '.repeat(renderedLine.length)}\r`);
    renderedLine = '';
  }

  function render(text) {
    const nextLine = String(text || '');
    const clearPadding = renderedLine.length > nextLine.length ? ' '.repeat(renderedLine.length - nextLine.length) : '';
    writeHost(`\r${nextLine}${clearPadding}`);
    activeLine = nextLine;
    renderedLine = nextLine;
  }

  function println(message = '') {
    clear();
    writeHost(message);
    if (activeLine) {
      render(activeLine);
    }
  }

  function finish(text = '') {
    if (text) {
      render(text);
    } else {
      clear();
    }
    writeHost('');
    activeLine = '';
    renderedLine = '';
  }

  return {
    clear,
    finish,
    println,
    render
  };
}

function formatStatusLine({
  phase = '',
  turn = 0,
  maxTurns = 0,
  retryAttempt = 0,
  retryCount = 0,
  sessionId = '',
  workingDirectoryName = '',
  sleepSeconds = 0
} = {}) {
  const parts = [`[${phase}] Turn ${turn}/${maxTurns}`, `retry ${retryAttempt}/${retryCount}`];
  if (sessionId) parts.push(`session ${sessionId.slice(0, 8)}`);
  if (workingDirectoryName) parts.push(`cwd ${workingDirectoryName}`);
  if (phase === '休眠中' && sleepSeconds > 0) {
    parts.push(`sleep ${sleepSeconds}s`);
  }
  return parts.join(' | ');
}

module.exports = {
  createStatusLine,
  formatStatusLine
};
