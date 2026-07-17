export const LEARNING_PACK_SCHEMA_VERSION = 1;

export function normalizeLearningText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeLearningText(text) {
  return normalizeLearningText(text).match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
}

export function buildTokenDiff(referenceText, answerText) {
  const expected = tokenizeLearningText(referenceText);
  const actual = tokenizeLearningText(answerText);
  const rows = Array.from({ length: expected.length + 1 }, () => Array(actual.length + 1).fill(0));
  for (let i = expected.length - 1; i >= 0; i -= 1) {
    for (let j = actual.length - 1; j >= 0; j -= 1) {
      rows[i][j] = expected[i] === actual[j]
        ? rows[i + 1][j + 1] + 1
        : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }

  const diff = [];
  let i = 0;
  let j = 0;
  while (i < expected.length || j < actual.length) {
    if (expected[i] === actual[j]) {
      diff.push({ token: expected[i], type: 'correct' }); i += 1; j += 1;
    } else if (j < actual.length && (i === expected.length || rows[i][j + 1] >= rows[i + 1][j])) {
      diff.push({ token: actual[j], type: 'extra' }); j += 1;
    } else {
      diff.push({ token: expected[i], type: 'missing' }); i += 1;
    }
  }
  return diff;
}

export function scoreLearningAnswer(referenceText, answerText, { hints = 0, replays = 0 } = {}) {
  const expected = tokenizeLearningText(referenceText);
  if (!expected.length) return { score: 0, diff: [] };
  const diff = buildTokenDiff(referenceText, answerText);
  const correct = diff.filter(item => item.type === 'correct').length;
  const extra = diff.filter(item => item.type === 'extra').length;
  const raw = Math.max(0, ((correct - extra * 0.25) / expected.length) * 100);
  return { score: Math.max(0, Math.round(raw - hints * 3 - Math.max(0, replays - 1) * 2)), diff };
}

function seededIndex(index, length) {
  return ((index * 7 + 3) % Math.max(1, length));
}

export function buildDictationChallenge(text, difficulty = 'medium') {
  const originalTokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  const hiddenRatio = difficulty === 'easy' ? 0.3 : difficulty === 'medium' ? 0.6 : 1;
  const hiddenCount = Math.max(1, Math.round(originalTokens.length * hiddenRatio));
  const hiddenSet = new Set(
    originalTokens.map((_, index) => index)
      .sort((a, b) => seededIndex(a, originalTokens.length) - seededIndex(b, originalTokens.length))
      .slice(0, hiddenCount)
  );
  const promptTokens = originalTokens.map((token, index) => {
    if (!hiddenSet.has(index)) return token;
    if (difficulty === 'medium') return `${token[0] || ''}${'_'.repeat(Math.max(2, token.length - 1))}`;
    return '_____';
  });
  return {
    prompt: difficulty === 'hard' ? 'Nhập lại toàn bộ câu bạn nghe được.' : promptTokens.join(' '),
    wordBank: difficulty === 'easy' ? [...hiddenSet].map(index => originalTokens[index]).sort() : [],
    hiddenIndexes: [...hiddenSet],
  };
}

export function getAdaptiveDifficulty(attempts) {
  const recent = (attempts || []).slice(0, 10);
  if (recent.length < 10) return 'medium';
  const average = recent.reduce((sum, item) => sum + Number(item.score || 0), 0) / recent.length;
  const hintRate = recent.filter(item => Number(item.hints || 0) > 0).length / recent.length;
  if (average >= 85 && hintRate < 0.2) return 'hard';
  if (average < 60 || hintRate > 0.5) return 'easy';
  return 'medium';
}

export function transcriptHash(transcript) {
  const input = (transcript || []).map((line, index) => `${index}:${line.start}:${line.text}:${line.text_vi || ''}`).join('|');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function learningPackCacheKey(transcript, model, difficulty) {
  return `${transcriptHash(transcript)}:${model}:${difficulty}:v${LEARNING_PACK_SCHEMA_VERSION}`;
}

export function validateLearningPack(pack) {
  if (!pack || typeof pack !== 'object') return false;
  if (typeof pack.summaryEnglish !== 'string' || typeof pack.summaryVietnamese !== 'string') return false;
  if (!Array.isArray(pack.keyPhrases) || !Array.isArray(pack.grammarNotes) || !Array.isArray(pack.questions)) return false;
  const hasValidSources = [...pack.keyPhrases, ...pack.grammarNotes, ...pack.questions]
    .every(item => Number.isInteger(item.lineIndex) && item.lineIndex >= 0);
  return hasValidSources && pack.questions.every(item => (
    typeof item.question === 'string'
    && typeof item.explanation === 'string'
    && Array.isArray(item.options)
    && Number.isInteger(item.answerIndex)
    && item.answerIndex >= 0
    && item.answerIndex < item.options.length
  ));
}

export function toSrtTimestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const secs = Math.floor((milliseconds % 60000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function buildTranscriptTxt(transcript) {
  return (transcript || []).map(line => `${line.text || ''}\n${line.text_vi || ''}`.trim()).join('\n\n');
}

export function buildTranscriptSrt(transcript) {
  return (transcript || []).map((line, index, lines) => {
    const start = Number(line.start || 0);
    const nextStart = Number(lines[index + 1]?.start);
    const end = Number.isFinite(nextStart) && nextStart > start ? nextStart : start + Math.max(0.5, Number(line.duration || 0));
    return `${index + 1}\n${toSrtTimestamp(start)} --> ${toSrtTimestamp(end)}\n${line.text || ''}${line.text_vi ? `\n${line.text_vi}` : ''}`;
  }).join('\n\n');
}

export function buildVocabularyCsv(words) {
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = [['word', 'meaning', 'ipa', 'sourceTitle', 'timestamp', 'sentence']];
  (words || []).forEach(word => rows.push([
    word.word, word.meaning, word.phonetic, word.sourceTitle, word.sourceStart, word.sourceSentence,
  ]));
  return rows.map(row => row.map(escape).join(',')).join('\n');
}

export function downloadLearningFile(filename, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
