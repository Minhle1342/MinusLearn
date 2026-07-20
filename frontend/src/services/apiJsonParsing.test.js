import { describe, expect, it } from 'vitest';
import { normalizeTranscriptTranslations, parseGeminiJsonText } from './api';

describe('parseGeminiJsonText', () => {
  it('parses normal object and array responses', () => {
    expect(parseGeminiJsonText('{"ok":true}')).toEqual({ ok: true });
    expect(parseGeminiJsonText('["one","two"]')).toEqual(['one', 'two']);
  });

  it('extracts JSON from markdown fences and trailing prose', () => {
    expect(parseGeminiJsonText('```json\n{"summary":"done"}\n```\nGenerated successfully.')).toEqual({ summary: 'done' });
  });

  it('uses the first complete JSON value when Gemini repeats output', () => {
    const response = '{"version":1,"text":"brace } inside string"}\n{"version":2}';
    expect(parseGeminiJsonText(response)).toEqual({ version: 1, text: 'brace } inside string' });
  });

  it('handles escaped quotes without ending the JSON string early', () => {
    expect(parseGeminiJsonText('Result: {"example":"He said \\\"hello\\\".","lineIndex":3} trailing')).toEqual({
      example: 'He said "hello".',
      lineIndex: 3,
    });
  });

  it('returns a useful error for truncated JSON', () => {
    expect(() => parseGeminiJsonText('{"summary":"unfinished"')).toThrow(/JSON không hợp lệ/);
  });
});

describe('normalizeTranscriptTranslations', () => {
  const lines = [
    { id: 12, text: 'First line' },
    { id: 13, text: 'Second line' },
    { id: 14, text: 'Third line' },
  ];

  it('matches translations by stable id even when Gemini reorders them', () => {
    const result = normalizeTranscriptTranslations(lines, {
      translations: [
        { id: 14, text_vi: 'Dòng thứ ba' },
        { id: 12, text_vi: 'Dòng thứ nhất' },
        { id: 13, text_vi: 'Dòng thứ hai' },
      ],
    });

    expect(result).toEqual([
      { id: 12, text_vi: 'Dòng thứ nhất' },
      { id: 13, text_vi: 'Dòng thứ hai' },
      { id: 14, text_vi: 'Dòng thứ ba' },
    ]);
  });

  it('rejects missing or duplicate ids instead of shifting later translations', () => {
    expect(() => normalizeTranscriptTranslations(lines, {
      translations: [
        { id: 12, text_vi: 'Dòng thứ nhất' },
        { id: 14, text_vi: 'Dòng thứ ba' },
      ],
    })).toThrow(/bỏ sót/);

    expect(() => normalizeTranscriptTranslations(lines, {
      translations: [
        { id: 12, text_vi: 'Dòng thứ nhất' },
        { id: 12, text_vi: 'Bản dịch trùng' },
        { id: 14, text_vi: 'Dòng thứ ba' },
      ],
    })).toThrow(/trùng ID/);
  });
});
