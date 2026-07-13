import { apiRequest } from './backendApi';


export async function createSession({ taskType, task1VisualKind, bandTarget, prompt, visuals, outline, duration }) {
  return apiRequest('/api/writing-sessions', {
    method: 'POST',
    body: {
      id: crypto.randomUUID(),
      taskType,
      task1VisualKind: task1VisualKind || 'chart',
      bandTarget,
      prompt,
      visuals: visuals || [],
      outline: outline || '',
      essay: '',
      startedAt: Date.now(),
      duration,
      status: 'draft',
      evaluation: null,
      autoSaveAt: null,
    },
  });
}

export async function updateSession(id, data) {
  return apiRequest(`/api/writing-sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: data });
}

export async function getSession(id) {
  const sessions = await apiRequest('/api/writing-sessions');
  return sessions.find(session => session.id === id) || null;
}

export async function listSessions() {
  return apiRequest('/api/writing-sessions');
}

export async function deleteSession(id) {
  return apiRequest(`/api/writing-sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getLatestDraft() {
  const sessions = await apiRequest('/api/writing-sessions?status=draft');
  return sessions[0] || null;
}

export async function addSentenceMistake({ wordId, expected, userInput, topicId }) {
  return apiRequest('/api/writing-mistakes', {
    method: 'POST',
    body: {
      id: crypto.randomUUID(),
      wordId,
      expected,
      userInput,
      topicId,
      timestamp: Date.now(),
    },
  });
}

export async function getSentenceMistakes(topicId) {
  const query = topicId ? `?topic_id=${encodeURIComponent(topicId)}` : '';
  return apiRequest(`/api/writing-mistakes${query}`);
}

export async function clearSentenceMistakes(topicId) {
  const query = topicId ? `?topic_id=${encodeURIComponent(topicId)}` : '';
  return apiRequest(`/api/writing-mistakes${query}`, { method: 'DELETE' });
}
