import { describe, expect, it } from 'vitest';
import { parseGeminiJsonText } from './api';

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
