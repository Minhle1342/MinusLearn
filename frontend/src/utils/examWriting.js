import { inferTask1VisualKind, validateWritingVisuals } from './writingVisuals.js';

export const EXAM_WRITING_DRAFT_KEY = 'minuslearn_exam_writing_draft';
export const EXAM_WRITING_TASK1_SECONDS = 20 * 60;
export const EXAM_WRITING_TASK2_SECONDS = 40 * 60;
export const EXAM_WRITING_TOTAL_SECONDS = EXAM_WRITING_TASK1_SECONDS + EXAM_WRITING_TASK2_SECONDS;

export const EXAM_WRITING_TASKS = [
  { taskType: '1', label: 'Task 1', minutes: 20, minWords: 150, weight: 1 },
  { taskType: '2', label: 'Task 2', minutes: 40, minWords: 250, weight: 2 },
];

function invalid(error) {
  return { valid: false, error };
}

function valid() {
  return { valid: true, error: '' };
}

function validPrompt(task) {
  return task && typeof task.prompt === 'string' && task.prompt.trim().length > 0;
}

export function countWords(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function validateExamWritingContent(content) {
  if (!content || typeof content !== 'object') {
    return invalid('Bài Writing không có dữ liệu hợp lệ.');
  }
  if (!Array.isArray(content.tasks) || content.tasks.length !== 2) {
    return invalid('Bài Writing cần đúng 2 task.');
  }

  const [task1, task2] = content.tasks;
  if (!validPrompt(task1)) return invalid('Task 1 cần có đề bài.');
  if (!validPrompt(task2)) return invalid('Task 2 cần có đề bài.');
  if (!Array.isArray(task1.visuals) || task1.visuals.length === 0) {
    return invalid('Task 1 cần có visual hợp lệ.');
  }

  const visualKind = inferTask1VisualKind(task1.visuals);
  const visualValidation = validateWritingVisuals(task1.visuals, visualKind);
  if (!visualValidation.valid) return visualValidation;

  return valid();
}

export function validateExamWritingAnswers(answers) {
  if (!Array.isArray(answers) || answers.length !== 2) {
    return invalid('Cần có bài làm cho cả Task 1 và Task 2.');
  }
  const task1Words = countWords(answers[0]);
  const task2Words = countWords(answers[1]);
  if (task1Words < EXAM_WRITING_TASKS[0].minWords) {
    return invalid(`Task 1 hiện có ${task1Words}/${EXAM_WRITING_TASKS[0].minWords} từ.`);
  }
  if (task2Words < EXAM_WRITING_TASKS[1].minWords) {
    return invalid(`Task 2 hiện có ${task2Words}/${EXAM_WRITING_TASKS[1].minWords} từ.`);
  }
  return valid();
}

export function roundToHalfBand(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(9, Math.round(value * 2) / 2));
}

export function calculateOverallWritingBand(task1Band, task2Band) {
  const task1 = Number(task1Band);
  const task2 = Number(task2Band);
  if (!Number.isFinite(task1) || !Number.isFinite(task2)) return 0;
  return roundToHalfBand((task1 + task2 * 2) / 3);
}

export function normalizeExamWritingEvaluation(result) {
  const task1Band = roundToHalfBand(Number(result?.task1Band));
  const task2Band = roundToHalfBand(Number(result?.task2Band));
  return {
    task1Band,
    task2Band,
    overallWritingBand: calculateOverallWritingBand(task1Band, task2Band),
    taskReports: Array.isArray(result?.taskReports) ? result.taskReports : [],
    summary: typeof result?.summary === 'string' ? result.summary : '',
    strengths: Array.isArray(result?.strengths) ? result.strengths : [],
    weaknesses: Array.isArray(result?.weaknesses) ? result.weaknesses : [],
    highlights: Array.isArray(result?.highlights) ? result.highlights : [],
    upgradedRewrites: Array.isArray(result?.upgradedRewrites) ? result.upgradedRewrites : [],
  };
}

export function formatWritingTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
