export const SPEAKING_PASS_SCORE = 75;
export const FALLBACK_SIMILARITY_THRESHOLD = 85;

export function normalizeEnglishText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + substitutionCost
      );
    }
  }

  return matrix[a.length][b.length];
}

export function calculateTextSimilarity(referenceText, transcript) {
  const reference = normalizeEnglishText(referenceText);
  const spoken = normalizeEnglishText(transcript);

  if (!reference && !spoken) return 100;
  if (!reference || !spoken) return 0;

  const maxLength = Math.max(reference.length, spoken.length);
  const distance = levenshteinDistance(reference, spoken);
  return Math.max(0, Math.round((1 - distance / maxLength) * 100));
}

export function hasSpeechRecognitionSupport() {
  if (typeof window === 'undefined') {
    return false;
  }

  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function buildAssessmentResult({ referenceText, transcript, error }) {
  const similarityScore = calculateTextSimilarity(referenceText, transcript);

  return {
    transcript: transcript || '',
    pronScore: null,
    accuracyScore: similarityScore,
    fluencyScore: null,
    completenessScore: null,
    similarityScore,
    words: [],
    rawJson: null,
    error: error || null,
    isPass: similarityScore >= FALLBACK_SIMILARITY_THRESHOLD,
  };
}

export async function createPronunciationAssessmentSession({
  referenceText,
  onTranscript,
  onError,
}) {
  const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!RecognitionCtor) {
    throw new Error('Trinh duyet hien tai khong ho tro Speech Recognition.');
  }

  const recognition = new RecognitionCtor();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = '';
  let interimTranscript = '';
  let latestError = null;

  recognition.onresult = event => {
    interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) {
        finalTranscript = `${finalTranscript} ${transcript}`.trim();
      } else {
        interimTranscript = `${interimTranscript} ${transcript}`.trim();
      }
    }

    onTranscript?.(`${finalTranscript} ${interimTranscript}`.trim());
  };

  recognition.onerror = event => {
    latestError = event.error || 'speech-recognition-error';
    onError?.(latestError);
  };

  return {
    start() {
      return new Promise((resolve, reject) => {
        recognition.onstart = () => resolve();
        try {
          recognition.start();
        } catch (error) {
          reject(error);
        }
      });
    },
    stop() {
      return new Promise(resolve => {
        recognition.onend = () => {
          resolve(buildAssessmentResult({
            referenceText,
            transcript: `${finalTranscript} ${interimTranscript}`.trim(),
            error: latestError,
          }));
        };

        try {
          recognition.stop();
        } catch (error) {
          resolve(buildAssessmentResult({
            referenceText,
            transcript: `${finalTranscript} ${interimTranscript}`.trim(),
            error: error.message,
          }));
        }
      });
    },
    close() {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // Ignore browser abort errors during cleanup.
      }
    },
  };
}
