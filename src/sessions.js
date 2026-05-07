const fs = require('node:fs/promises');
const path = require('node:path');

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getSessionIdFromRolloutPath(filePath) {
  const parsedPath = path.parse(filePath);
  const fileName = parsedPath.name;
  if (!fileName || fileName.length < 37) return null;
  const candidate = fileName.slice(-36);
  const prefix = fileName.slice(0, -36);
  if (!prefix.endsWith('-')) return null;
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(candidate)) return null;
  return candidate;
}

function getSessionTimestampFromRolloutPath(filePath) {
  const fileName = path.parse(filePath).name;
  const sessionId = getSessionIdFromRolloutPath(filePath);
  if (!sessionId || !fileName.startsWith('rollout-')) return null;
  const timestampLength = fileName.length - 'rollout-'.length - 1 - sessionId.length;
  if (timestampLength <= 0) return null;
  return fileName.slice('rollout-'.length, 'rollout-'.length + timestampLength);
}

function formatSessionLastUsedTime(lastWriteTime) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    lastWriteTime.getFullYear(),
    '-',
    pad(lastWriteTime.getMonth() + 1),
    '-',
    pad(lastWriteTime.getDate()),
    ' ',
    pad(lastWriteTime.getHours()),
    ':',
    pad(lastWriteTime.getMinutes()),
    ':',
    pad(lastWriteTime.getSeconds())
  ].join('');
}

async function readFirstJsonLine(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const firstLine = content.split(/\r?\n/).find((line) => line.trim());
    if (!firstLine) return null;
    return JSON.parse(firstLine);
  } catch {
    return null;
  }
}

async function readRolloutSummary(filePath, maxPreviewLength = 80) {
  let sessionMetaPayload = null;
  let preview = '(no preview)';
  let fallbackMessage = null;
  let pending = '';
  let processedBytes = 0;
  const chunkSize = 16 * 1024;
  const maxBytes = 128 * 1024;
  let handle;

  try {
    handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(chunkSize);

    while (processedBytes < maxBytes) {
      const { bytesRead } = await handle.read(buffer, 0, chunkSize, processedBytes);
      if (bytesRead <= 0) break;
      processedBytes += bytesRead;
      pending += buffer.toString('utf8', 0, bytesRead);

      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || '';

      ({ sessionMetaPayload, preview, fallbackMessage } = processRolloutLines({
        lines,
        sessionMetaPayload,
        preview,
        fallbackMessage,
        maxPreviewLength
      }));

      if (preview !== '(no preview)' && sessionMetaPayload) {
        break;
      }
    }

    if ((preview === '(no preview)' || !sessionMetaPayload) && pending.trim()) {
      ({ sessionMetaPayload, preview, fallbackMessage } = processRolloutLines({
        lines: [pending],
        sessionMetaPayload,
        preview,
        fallbackMessage,
        maxPreviewLength
      }));
    }
  } catch {
    return {
      sessionMetaPayload: null,
      preview: '(no preview)'
    };
  } finally {
    await handle?.close().catch(() => {});
  }

  if (preview === '(no preview)' && fallbackMessage && String(fallbackMessage).trim()) {
    preview = normalizePreview(fallbackMessage, maxPreviewLength);
  }

  return {
    sessionMetaPayload,
    preview
  };
}

function processRolloutLines({
  lines,
  sessionMetaPayload,
  preview,
  fallbackMessage,
  maxPreviewLength
}) {
  for (const line of lines) {
    if (!line.trim()) continue;

    let item;
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }

    if (!sessionMetaPayload && item.type === 'session_meta') {
      sessionMetaPayload = item.payload || null;
    }

    let message = null;
    if (item.type === 'event_msg' && item.payload?.type === 'user_message') {
      message = item.payload.message;
    }

    if (!message && !fallbackMessage && item.payload?.type === 'message' && item.payload?.role === 'user') {
      for (const contentItem of item.payload.content || []) {
        if (contentItem.type === 'input_text' && contentItem.text) {
          fallbackMessage = contentItem.text;
          break;
        }
      }
    }

    if (preview === '(no preview)' && message && String(message).trim()) {
      preview = normalizePreview(message, maxPreviewLength);
    }
  }

  return {
    sessionMetaPayload,
    preview,
    fallbackMessage
  };
}

async function getSessionMetaPayloadFromRollout(filePath) {
  const summary = await readRolloutSummary(filePath);
  return summary.sessionMetaPayload;
}

function normalizePreview(message, maxLength) {
  const normalized = String(message).replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

async function getSessionPreviewFromRollout(filePath, maxLength = 80) {
  const summary = await readRolloutSummary(filePath, maxLength);
  return summary.preview;
}

async function testIsPrimarySessionRollout(filePath) {
  const { sessionMetaPayload: payload } = await readRolloutSummary(filePath);
  if (payload === null) return true;
  if (payload.source?.subagent !== undefined && payload.source?.subagent !== null) return false;
  const role = String(payload.agent_role || '');
  return !role.trim() || role === 'default';
}

async function listRolloutFiles(directory) {
  const result = [];
  async function walk(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) {
        const stat = await fs.stat(fullPath);
        result.push({ fullPath, name: entry.name, lastWriteTime: stat.mtime });
      }
    }
  }

  await walk(directory);
  return result;
}

async function getCodexSessionEntries({ sessionsDir, maxCount = 30 }) {
  if (!sessionsDir || !(await fileExists(sessionsDir))) return [];
  const files = await listRolloutFiles(sessionsDir);
  files.sort((left, right) => {
    const timeDelta = right.lastWriteTime.getTime() - left.lastWriteTime.getTime();
    if (timeDelta !== 0) return timeDelta;
    const leftTimestamp = getSessionTimestampFromRolloutPath(left.fullPath) || '';
    const rightTimestamp = getSessionTimestampFromRolloutPath(right.fullPath) || '';
    if (rightTimestamp !== leftTimestamp) return rightTimestamp.localeCompare(leftTimestamp);
    return right.name.localeCompare(left.name);
  });

  const entries = [];
  for (const file of files) {
    const sessionId = getSessionIdFromRolloutPath(file.fullPath);
    if (!sessionId) continue;
    const { sessionMetaPayload: payload, preview: rawPreview } = await readRolloutSummary(file.fullPath);
    if (payload?.source?.subagent !== undefined && payload?.source?.subagent !== null) continue;
    const role = String(payload?.agent_role || '');
    if (role.trim() && role !== 'default') continue;
    let preview = rawPreview;
    if (preview === '(no preview)' && payload?.cwd) {
      preview = `No user message | ${payload.cwd}`;
    } else if (preview === '(no preview)') {
      preview = `No preview | ${sessionId}`;
    }

    entries.push({
      sessionId,
      timestamp: formatSessionLastUsedTime(file.lastWriteTime),
      preview,
      path: file.fullPath,
      lastWriteTime: file.lastWriteTime,
      workingDirectory: payload?.cwd || null
    });
    if (entries.length >= maxCount) break;
  }

  return entries;
}

module.exports = {
  getSessionIdFromRolloutPath,
  getSessionTimestampFromRolloutPath,
  formatSessionLastUsedTime,
  getSessionMetaPayloadFromRollout,
  getSessionPreviewFromRollout,
  readRolloutSummary,
  testIsPrimarySessionRollout,
  getCodexSessionEntries
};
