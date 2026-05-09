const fs = require('node:fs/promises');
const path = require('node:path');

async function writeAutopilotLog(logPath, message) {
  if (!logPath) return;
  const directory = path.dirname(logPath);
  if (directory && directory !== '.') {
    await fs.mkdir(directory, { recursive: true });
  }
  await fs.appendFile(logPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    message
  })}\n`, 'utf8');
}

async function writeVisibleOutputLog(logPath, chunk) {
  if (!logPath) return;
  const directory = path.dirname(logPath);
  if (directory && directory !== '.') {
    await fs.mkdir(directory, { recursive: true });
  }
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  await fs.appendFile(logPath, text, 'utf8');
}

function createVisibleOutputLogger({ write = async () => {} } = {}) {
  let pending = Promise.resolve();
  let firstError = null;

  function writeChunk(_source, chunk) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (!text) return pending;

    pending = pending.then(() => write(text)).catch((error) => {
      if (!firstError) firstError = error;
    });
    return pending;
  }

  async function flush() {
    await pending;
    if (firstError) throw firstError;
  }

  return {
    write: writeChunk,
    flush
  };
}

module.exports = {
  createVisibleOutputLogger,
  writeAutopilotLog,
  writeVisibleOutputLog
};
