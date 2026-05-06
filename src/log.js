const fs = require('node:fs/promises');
const path = require('node:path');

async function writeAutopilotLog(logPath, message) {
  if (!logPath) return;
  const directory = path.dirname(logPath);
  if (directory && directory !== '.') {
    await fs.mkdir(directory, { recursive: true });
  }
  await fs.appendFile(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8');
}

module.exports = {
  writeAutopilotLog
};
