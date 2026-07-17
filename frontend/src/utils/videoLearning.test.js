import { describe, expect, it } from 'vitest';
import {
  buildDictationChallenge,
  buildTokenDiff,
  buildTranscriptSrt,
  getAdaptiveDifficulty,
  learningPackCacheKey,
  normalizeLearningText,
  scoreLearningAnswer,
  validateLearningPack,
} from './videoLearning';

describe('video learning utilities', () => {
  it('normalizes case, punctuation and whitespace for dictation', () => {
    expect(normalizeLearningText('  Hello,   WORLD! ')).toBe('hello world');
    expect(scoreLearningAnswer('Hello, world!', 'hello world').score).toBe(100);
  });

  it('shows missing and extra tokens and applies hint/replay penalties', () => {
    const diff = buildTokenDiff('we learn English today', 'we English quickly');
    expect(diff.filter(item => item.type === 'missing').map(item => item.token)).toEqual(['learn', 'today']);
    expect(diff.some(item => item.type === 'extra' && item.token === 'quickly')).toBe(true);
    expect(scoreLearningAnswer('one two three', 'one two three', { hints: 2, replays: 3 }).score).toBe(90);
  });

  it('creates easy, medium and hard dictation prompts', () => {
    const sentence = 'we are learning English through short videos today';
    expect(buildDictationChallenge(sentence, 'easy').wordBank.length).toBeGreaterThan(0);
    expect(buildDictationChallenge(sentence, 'medium').prompt).toContain('_');
    expect(buildDictationChallenge(sentence, 'hard').hiddenIndexes).toHaveLength(8);
  });

  it('adapts only after ten attempts using score and hint rate', () => {
    expect(getAdaptiveDifficulty(Array(9).fill({ score: 100, hints: 0 }))).toBe('medium');
    expect(getAdaptiveDifficulty(Array(10).fill({ score: 90, hints: 0 }))).toBe('hard');
    expect(getAdaptiveDifficulty(Array(10).fill({ score: 80, hints: 1 }))).toBe('easy');
  });

  it('invalidates learning-pack cache when transcript, model or difficulty changes', () => {
    const transcript = [{ start: 0, text: 'Hello' }];
    const base = learningPackCacheKey(transcript, 'gemini-a', 'medium');
    expect(learningPackCacheKey([{ start: 0, text: 'Changed' }], 'gemini-a', 'medium')).not.toBe(base);
    expect(learningPackCacheKey(transcript, 'gemini-b', 'medium')).not.toBe(base);
    expect(learningPackCacheKey(transcript, 'gemini-a', 'hard')).not.toBe(base);
  });

  it('validates AI JSON and exports bilingual SRT', () => {
    const pack = {
      summaryEnglish: 'Summary', summaryVietnamese: 'Tóm tắt',
      keyPhrases: [{ phrase: 'take off', lineIndex: 0 }],
      grammarNotes: [{ title: 'Phrasal verb', lineIndex: 0 }],
      questions: [{ question: 'What?', options: ['A', 'B'], answerIndex: 0, explanation: 'Because', lineIndex: 0 }],
    };
    expect(validateLearningPack(pack)).toBe(true);
    expect(validateLearningPack({ ...pack, questions: [{ ...pack.questions[0], answerIndex: 4 }] })).toBe(false);
    expect(buildTranscriptSrt([{ start: 1, duration: 2, text: 'Hello', text_vi: 'Xin chào' }])).toContain('00:00:01,000 --> 00:00:03,000\nHello\nXin chào');
  });
});
