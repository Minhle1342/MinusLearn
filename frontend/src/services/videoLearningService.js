import { apiRequest } from './backendApi';

const videoPath = videoId => `/api/videos/${encodeURIComponent(videoId)}`;

export function getVideoLearningState(videoId) {
  return apiRequest(`${videoPath(videoId)}/learning-state`);
}

export function patchVideoLearningState(videoId, changes) {
  return apiRequest(`${videoPath(videoId)}/learning-state`, { method: 'PATCH', body: changes });
}

export function getVideoLearningAttempts(videoId, limit = 100) {
  return apiRequest(`${videoPath(videoId)}/learning-attempts?limit=${Math.max(1, Math.min(500, limit))}`);
}

export function createVideoLearningAttempt(videoId, attempt) {
  return apiRequest(`${videoPath(videoId)}/learning-attempts`, { method: 'POST', body: attempt });
}

export function resetVideoLearningData(videoId) {
  return apiRequest(`${videoPath(videoId)}/learning-state`, { method: 'DELETE' });
}
