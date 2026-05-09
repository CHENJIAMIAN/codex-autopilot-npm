const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function createRunLogPlan({
  logRoot,
  sessionId,
  now = new Date(),
  pid = process.pid,
  randomSuffix = crypto.randomBytes(3).toString('hex'),
  eventLogFile,
  transcriptFile
}) {
  if (!logRoot) throw new Error('logRoot is required');
  if (!sessionId) throw new Error('sessionId is required');

  const safeSessionId = sanitizePathSegment(sessionId);
  const runId = `${formatRunTimestamp(now)}-p${pid}-${sanitizePathSegment(randomSuffix)}`;
  const sessionDirectory = path.join(logRoot, 'sessions', safeSessionId);
  const runDirectory = path.join(sessionDirectory, 'runs', runId);

  return {
    sessionId,
    runId,
    sessionDirectory,
    runDirectory,
    eventLogFile: eventLogFile || path.join(runDirectory, 'events.jsonl'),
    transcriptFile: transcriptFile || path.join(runDirectory, 'transcript.log'),
    metaFile: path.join(runDirectory, 'meta.json'),
    latestRunFile: path.join(sessionDirectory, 'latest-run.json')
  };
}

async function writeRunMetadata({ plan, metadata }) {
  await writeJsonFile(plan.metaFile, metadata);
}

async function writeLatestRunPointer({ plan }) {
  await writeJsonFile(plan.latestRunFile, {
    sessionId: plan.sessionId,
    runId: plan.runId,
    runDirectory: plan.runDirectory,
    eventLogFile: plan.eventLogFile,
    transcriptFile: plan.transcriptFile,
    metaFile: plan.metaFile
  });
}

async function writeJsonFile(file, value) {
  const directory = path.dirname(file);
  if (directory && directory !== '.') {
    await fs.mkdir(directory, { recursive: true });
  }
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function formatRunTimestamp(date) {
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    '-',
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
    '-',
    String(date.getUTCMilliseconds()).padStart(3, '0')
  ].join('');
}

function sanitizePathSegment(value) {
  return String(value).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
}

module.exports = {
  createRunLogPlan,
  formatRunTimestamp,
  sanitizePathSegment,
  writeLatestRunPointer,
  writeRunMetadata
};
