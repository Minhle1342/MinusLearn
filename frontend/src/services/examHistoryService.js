import { apiRequest } from './backendApi';


export async function saveExamResult(result) {
  return apiRequest('/api/exam-results', {
    method: 'POST',
    body: {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      reviewCount: 0,
      ...result,
    },
  });
}

export async function getExamLeaderboard(difficulty, topicId, limit = 5) {
  const params = new URLSearchParams({ difficulty, topic_id: topicId, limit: String(limit) });
  return apiRequest(`/api/exam-results?${params}`);
}

export async function clearExamHistory() {
  return apiRequest('/api/exam-results', { method: 'DELETE' });
}

export async function incrementReviewCount(id) {
  return apiRequest(`/api/exam-results/${encodeURIComponent(id)}/review`, { method: 'PATCH' });
}

