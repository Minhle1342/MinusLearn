import { describe, expect, it } from 'vitest';
import { GEMINI_DEFAULT_MODEL } from '../../services/api';
import { resolveListeningGeminiModel } from './ListeningPractice';


describe('ListeningPractice Gemini model selection', () => {
  it('always uses the Gemini model configured in .env', () => {
    expect(resolveListeningGeminiModel()).toBe(GEMINI_DEFAULT_MODEL);
  });

  it('ignores a persisted Qwen model', () => {
    expect(resolveListeningGeminiModel('qwen2.5:1.5b')).toBe(GEMINI_DEFAULT_MODEL);
  });
});
