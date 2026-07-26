import { apiRequest } from './backendApi';


export function getMascotHealth() {
  return apiRequest('/api/mascot/health');
}

export async function getMascotHistory() {
  const result = await apiRequest('/api/mascot/history');
  return Array.isArray(result?.messages) ? result.messages : [];
}

export function clearMascotHistory() {
  return apiRequest('/api/mascot/history', { method: 'DELETE' });
}

export function chatWithMascot(message, trigger, context) {
  return apiRequest('/api/mascot/chat', {
    method: 'POST',
    body: { message, trigger, context },
  });
}

export function createMascotLiveToken() {
  return apiRequest('/api/mascot/live-token', { method: 'POST' });
}

export function saveMascotLiveTurn(userText, assistantText) {
  return apiRequest('/api/mascot/live-history', {
    method: 'POST',
    body: { userText, assistantText },
  });
}
