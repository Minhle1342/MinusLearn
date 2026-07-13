import { apiRequest } from './backendApi';


export async function getExamWritingDraft() {
  const result = await apiRequest('/api/exam-writing-draft');
  return result.draft;
}

export async function saveExamWritingDraft(draft) {
  const result = await apiRequest('/api/exam-writing-draft', { method: 'PUT', body: draft });
  return result.draft;
}

export async function deleteExamWritingDraft() {
  return apiRequest('/api/exam-writing-draft', { method: 'DELETE' });
}

