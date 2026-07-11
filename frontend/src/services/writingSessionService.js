/**
 * Writing Session Service
 * Manages IELTS writing sessions in localStorage.
 * Designed to be swapped for a real backend later.
 */

const SESSIONS_KEY = 'minuslearn_writing_sessions';
const SENTENCE_MISTAKES_KEY = 'minuslearn_writing_sentence_mistakes';

// ─── Session CRUD ────────────────────────────────────────────

function _readSessions() {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
  } catch {
    return [];
  }
}

function _writeSessions(sessions) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function createSession({ taskType, bandTarget, prompt, visuals, outline, duration }) {
  const session = {
    id: crypto.randomUUID(),
    taskType,
    bandTarget,
    prompt,
    visuals: visuals || [],
    outline: outline || '',
    essay: '',
    startedAt: Date.now(),
    duration,           // in seconds
    status: 'draft',    // 'draft' | 'submitted' | 'evaluated'
    evaluation: null,
    autoSaveAt: null,
  };
  const sessions = _readSessions();
  sessions.push(session);
  _writeSessions(sessions);
  return session;
}

export function updateSession(id, data) {
  const sessions = _readSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return null;
  sessions[idx] = { ...sessions[idx], ...data, autoSaveAt: Date.now() };
  _writeSessions(sessions);
  return sessions[idx];
}


export function getSession(id) {
  return _readSessions().find(s => s.id === id) || null;
}

export function listSessions() {
  return _readSessions().sort((a, b) => b.startedAt - a.startedAt);
}

export function deleteSession(id) {
  const sessions = _readSessions().filter(s => s.id !== id);
  _writeSessions(sessions);
}

export function getLatestDraft() {
  return _readSessions().find(s => s.status === 'draft') || null;
}

// ─── Sentence Mistakes CRUD ──────────────────────────────────

function _readMistakes() {
  try {
    return JSON.parse(localStorage.getItem(SENTENCE_MISTAKES_KEY) || '[]');
  } catch {
    return [];
  }
}

function _writeMistakes(mistakes) {
  localStorage.setItem(SENTENCE_MISTAKES_KEY, JSON.stringify(mistakes));
}

export function addSentenceMistake({ wordId, expected, userInput, topicId }) {
  const mistakes = _readMistakes();
  mistakes.push({
    id: crypto.randomUUID(),
    wordId,
    expected,
    userInput,
    topicId,
    timestamp: Date.now(),
  });
  _writeMistakes(mistakes);
}

export function getSentenceMistakes(topicId) {
  const mistakes = _readMistakes();
  if (topicId) return mistakes.filter(m => m.topicId === topicId);
  return mistakes;
}

export function clearSentenceMistakes(topicId) {
  if (topicId) {
    _writeMistakes(_readMistakes().filter(m => m.topicId !== topicId));
  } else {
    _writeMistakes([]);
  }
}
