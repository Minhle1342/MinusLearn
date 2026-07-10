/**
 * Spaced Repetition — SM-2 Algorithm
 * 
 * Based on the SuperMemo SM-2 algorithm by Piotr Woźniak (1987).
 * This is the same foundational algorithm used by Anki.
 * 
 * Each word card tracks:
 *   - repetition (n): consecutive correct recalls
 *   - efactor (EF): easiness factor, controls interval growth rate
 *   - interval (I): days until next review
 *   - nextReviewDate: timestamp of when the word is due
 *   - lastReviewDate: timestamp of last review
 */

/**
 * Creates the initial SR state for a brand-new word.
 */
export function initSRState() {
  return {
    repetition: 0,
    efactor: 2.5,
    interval: 0,
    nextReviewDate: null,
    lastReviewDate: null,
  };
}

/**
 * Core SM-2 calculation.
 * 
 * @param {number} quality - Self-assessment score (0–5)
 *   0 = complete blackout
 *   1 = incorrect, but upon seeing the answer, remembered
 *   2 = incorrect, but the answer seemed easy to recall
 *   3 = correct, but with serious difficulty
 *   4 = correct, after some hesitation
 *   5 = perfect, instant recall
 * @param {number} repetition - Current consecutive correct count
 * @param {number} efactor - Current easiness factor (≥ 1.3)
 * @param {number} interval - Current interval in days
 * @returns {{ repetition: number, efactor: number, interval: number, nextReviewDate: number }}
 */
export function calculateSM2(quality, repetition, efactor, interval) {
  // 1. Calculate new Easiness Factor
  let newEF = efactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEF < 1.3) newEF = 1.3;

  let newRepetition;
  let newInterval;

  if (quality < 3) {
    // Failed recall → reset
    newRepetition = 0;
    newInterval = 1;
  } else {
    // Successful recall
    newRepetition = repetition + 1;

    if (newRepetition === 1) {
      newInterval = 1;
    } else if (newRepetition === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * efactor);
    }
  }

  const now = Date.now();
  const nextReviewDate = now + newInterval * 24 * 60 * 60 * 1000;

  return {
    repetition: newRepetition,
    efactor: parseFloat(newEF.toFixed(2)),
    interval: newInterval,
    nextReviewDate,
    lastReviewDate: now,
  };
}

/**
 * Given a quality score, preview what the next interval would be
 * WITHOUT mutating any state. Used to show interval hints on buttons.
 * 
 * @param {number} quality
 * @param {number} repetition
 * @param {number} efactor
 * @param {number} interval
 * @returns {number} interval in days
 */
export function previewInterval(quality, repetition, efactor, interval) {
  const result = calculateSM2(quality, repetition, efactor, interval);
  return result.interval;
}

/**
 * Format an interval in days into a human-readable Vietnamese string.
 * @param {number} days
 * @returns {string}
 */
export function formatInterval(days) {
  if (days < 1) return '< 1 ngày';
  if (days === 1) return '1 ngày';
  if (days < 30) return `${days} ngày`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} tháng`;
  }
  const years = (days / 365).toFixed(1);
  return `${years} năm`;
}

/**
 * Determines which words are due for review right now.
 * 
 * @param {Object} srData - The full SR data object keyed by word ID
 * @param {string[]} wordIds - Array of word IDs to check (e.g., filtered by topic)
 * @returns {{ dueWords: string[], newWords: string[], learnedWords: string[] }}
 */
export function getDueWords(srData, wordIds) {
  const now = Date.now();
  const dueWords = [];
  const newWords = [];
  const learnedWords = [];

  for (const id of wordIds) {
    const sr = srData[id];

    if (!sr || sr.nextReviewDate == null) {
      // Never reviewed → treat as "new" and due immediately
      newWords.push(id);
    } else if (sr.nextReviewDate <= now) {
      // Past due date → needs review
      dueWords.push(id);
    } else {
      // Not yet due → learned / scheduled for future
      learnedWords.push(id);
    }
  }

  return { dueWords, newWords, learnedWords };
}

/**
 * Find the earliest next review date among all non-due words.
 * Returns null if there are no scheduled words.
 * 
 * @param {Object} srData
 * @param {string[]} wordIds
 * @returns {number|null} timestamp
 */
export function getNextDueDate(srData, wordIds) {
  const now = Date.now();
  let earliest = null;

  for (const id of wordIds) {
    const sr = srData[id];
    if (sr && sr.nextReviewDate && sr.nextReviewDate > now) {
      if (earliest === null || sr.nextReviewDate < earliest) {
        earliest = sr.nextReviewDate;
      }
    }
  }

  return earliest;
}
