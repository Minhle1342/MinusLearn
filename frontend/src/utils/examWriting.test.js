import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateOverallWritingBand,
  countWords,
  normalizeExamWritingEvaluation,
  validateExamWritingAnswers,
  validateExamWritingContent,
} from './examWriting.js';

function makeChartTask() {
  return {
    prompt: 'The chart below shows changes in library visits. Summarise the information.',
    visuals: [{
      id: 'bar-1',
      type: 'bar',
      title: 'Library visits',
      unit: 'visits',
      xKey: 'year',
      series: [{ key: 'students', name: 'Students' }],
      data: [{ year: '2010', students: 120 }, { year: '2020', students: 240 }],
    }],
  };
}

test('validates a complete two-task writing test', () => {
  const result = validateExamWritingContent({
    tasks: [
      makeChartTask(),
      { prompt: 'Some people believe cities should invest more in parks. Discuss both views.' },
    ],
  });

  assert.equal(result.valid, true);
});

test('rejects missing Task 1 visual', () => {
  const result = validateExamWritingContent({
    tasks: [
      { prompt: 'Describe the chart.' },
      { prompt: 'Discuss both views.' },
    ],
  });

  assert.equal(result.valid, false);
  assert.match(result.error, /visual/i);
});

test('rejects missing Task 2', () => {
  const result = validateExamWritingContent({ tasks: [makeChartTask()] });

  assert.equal(result.valid, false);
  assert.match(result.error, /2 task/i);
});

test('checks minimum word counts', () => {
  const short = validateExamWritingAnswers(['too short', 'also too short']);
  assert.equal(short.valid, false);
  assert.match(short.error, /Task 1/);

  const ok = validateExamWritingAnswers([
    Array.from({ length: 150 }, (_, index) => `one${index}`).join(' '),
    Array.from({ length: 250 }, (_, index) => `two${index}`).join(' '),
  ]);
  assert.equal(ok.valid, true);
});

test('calculates weighted Writing band with Task 2 double weight', () => {
  assert.equal(calculateOverallWritingBand(6, 7), 6.5);
  assert.equal(calculateOverallWritingBand(5.5, 7), 6.5);
});

test('normalizes AI evaluation bands and preserves feedback arrays', () => {
  const result = normalizeExamWritingEvaluation({
    task1Band: 5.74,
    task2Band: 6.76,
    strengths: ['clear overview'],
  });

  assert.equal(result.task1Band, 5.5);
  assert.equal(result.task2Band, 7);
  assert.equal(result.overallWritingBand, 6.5);
  assert.deepEqual(result.strengths, ['clear overview']);
  assert.equal(countWords('  one   two three  '), 3);
});
