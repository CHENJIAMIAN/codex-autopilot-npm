const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

async function readTextFileUtf8(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function writeTextFileUtf8Atomic(filePath, text) {
  const directory = path.dirname(filePath);
  if (directory && directory !== '.') {
    await fs.mkdir(directory, { recursive: true });
  }

  const leaf = path.basename(filePath);
  const tempPath = path.join(directory, `${leaf}.${crypto.randomUUID().replace(/-/g, '')}.tmp`);
  await fs.writeFile(tempPath, text, 'utf8');
  await fs.rename(tempPath, filePath);
}

async function readTextFileIfExists(filePath) {
  try {
    return await readTextFileUtf8(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function getTextSha256(text = '') {
  return crypto.createHash('sha256').update(text ?? '', 'utf8').digest('hex');
}

module.exports = {
  readTextFileUtf8,
  readTextFileIfExists,
  writeTextFileUtf8Atomic,
  getTextSha256
};
