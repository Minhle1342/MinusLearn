import { describe, expect, it } from 'vitest';
import { calculateStudyStreak, recordReview } from './spacedRepetition';

function timestampDaysAgo(now, days) {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0);
  return date.getTime();
}

describe('study streak history', () => {
  const now = new Date(2026, 6, 18, 12, 0, 0);

  it('preserves the streak when all previous last-review dates are overwritten today', () => {
    const beforeReview = {
      wordA: { lastReviewDate: timestampDaysAgo(now, 2) },
      wordB: { lastReviewDate: timestampDaysAgo(now, 1) },
    };

    const afterReview = Object.fromEntries(
      Object.entries(beforeReview).map(([wordId, state]) => [
        wordId,
        recordReview(state, { lastReviewDate: now.getTime() }),
      ])
    );

    expect(calculateStudyStreak(afterReview, now)).toEqual({
      streak: 3,
      studiedToday: true,
    });
  });

  it('keeps one history entry per local calendar day', () => {
    const firstReview = recordReview(null, { lastReviewDate: now.getTime() });
    const secondReview = recordReview(firstReview, {
      lastReviewDate: new Date(2026, 6, 18, 18, 30, 0).getTime(),
    });

    expect(secondReview.reviewHistory).toHaveLength(1);
  });

  it('keeps an active streak before the user studies today', () => {
    const srData = {
      wordA: {
        reviewHistory: [
          timestampDaysAgo(now, 2),
          timestampDaysAgo(now, 1),
        ],
        lastReviewDate: timestampDaysAgo(now, 1),
      },
    };

    expect(calculateStudyStreak(srData, now)).toEqual({
      streak: 2,
      studiedToday: false,
    });
  });
});
