import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createVideoLearningAttempt,
  getVideoLearningAttempts,
  getVideoLearningState,
  patchVideoLearningState,
  resetVideoLearningData,
} from '../services/videoLearningService';

export const DEFAULT_VIDEO_LEARNING_STATE = {
  preferences: {
    playbackRate: 1,
    subtitleMode: 'bilingual',
    subtitleOffset: 0,
    autoPause: false,
    autoPauseDelay: 1.5,
    repeatCount: 1,
    progressiveReplay: false,
    audioFocus: false,
    difficulty: 'auto',
  },
  bookmarks: [],
  notes: {},
  knownTokens: [],
  dictionaryCache: {},
  learningPackCache: {},
  aggregateStats: { totalAttempts: 0, practiceSeconds: 0, watchSeconds: 0, savedWords: 0 },
  lineStats: {},
};

function mergeState(state) {
  return {
    ...DEFAULT_VIDEO_LEARNING_STATE,
    ...(state || {}),
    preferences: { ...DEFAULT_VIDEO_LEARNING_STATE.preferences, ...(state?.preferences || {}) },
    aggregateStats: { ...DEFAULT_VIDEO_LEARNING_STATE.aggregateStats, ...(state?.aggregateStats || {}) },
  };
}

export function useVideoLearningState(videoId) {
  const [state, setState] = useState(() => mergeState());
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const stateRef = useRef(state);
  const writeQueueRef = useRef(Promise.resolve());
  const activeVideoIdRef = useRef(videoId);
  activeVideoIdRef.current = videoId;

  useEffect(() => {
    let cancelled = false;
    const emptyState = mergeState({ videoId });
    stateRef.current = emptyState;
    setState(emptyState);
    setAttempts([]);
    setLoading(true);
    setError(null);
    Promise.all([getVideoLearningState(videoId), getVideoLearningAttempts(videoId, 100)])
      .then(([nextState, nextAttempts]) => {
        if (cancelled) return;
        const merged = mergeState(nextState);
        stateRef.current = merged;
        setState(merged);
        setAttempts(Array.isArray(nextAttempts) ? nextAttempts : []);
      })
      .catch(requestError => {
        if (!cancelled) setError(requestError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [videoId]);

  const updateState = useCallback(updater => {
    const targetVideoId = videoId;
    const previous = stateRef.current;
    const next = mergeState(typeof updater === 'function' ? updater(previous) : { ...previous, ...updater });
    stateRef.current = next;
    setState(next);
    setError(null);
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(() => patchVideoLearningState(targetVideoId, next))
      .then(remote => {
        const merged = mergeState(remote);
        if (activeVideoIdRef.current === targetVideoId) {
          stateRef.current = merged;
          setState(merged);
        }
        return merged;
      })
      .catch(requestError => {
        if (activeVideoIdRef.current === targetVideoId) {
          stateRef.current = previous;
          setState(previous);
          setError(requestError);
        }
        throw requestError;
      });
    return writeQueueRef.current;
  }, [videoId]);

  const updatePreferences = useCallback(changes => updateState(current => ({
    ...current,
    preferences: { ...current.preferences, ...changes },
  })), [updateState]);

  const addAttempt = useCallback(attempt => {
    const targetVideoId = videoId;
    const previous = stateRef.current;
    const activity = attempt.activity;
    const previousActivity = previous.aggregateStats?.activities?.[activity] || {};
    const lineKey = Number.isInteger(attempt.lineIndex) ? String(attempt.lineIndex) : null;
    const previousLine = lineKey ? previous.lineStats?.[lineKey] || {} : null;
    const optimistic = {
      ...previous,
      aggregateStats: {
        ...previous.aggregateStats,
        totalAttempts: Number(previous.aggregateStats?.totalAttempts || 0) + 1,
        practiceSeconds: Number(previous.aggregateStats?.practiceSeconds || 0) + Number(attempt.durationSeconds || 0),
        activities: {
          ...(previous.aggregateStats?.activities || {}),
          [activity]: {
            ...previousActivity,
            attempts: Number(previousActivity.attempts || 0) + 1,
            totalScore: Number(previousActivity.totalScore || 0) + Number(attempt.score || 0),
            hints: Number(previousActivity.hints || 0) + Number(attempt.hints || 0),
            replays: Number(previousActivity.replays || 0) + Number(attempt.replays || 0),
          },
        },
      },
      lineStats: lineKey ? {
        ...previous.lineStats,
        [lineKey]: {
          ...previousLine,
          attempts: Number(previousLine.attempts || 0) + 1,
          totalScore: Number(previousLine.totalScore || 0) + Number(attempt.score || 0),
        },
      } : previous.lineStats,
    };
    stateRef.current = optimistic;
    setState(optimistic);

    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(() => createVideoLearningAttempt(targetVideoId, attempt))
      .then(created => {
        if (activeVideoIdRef.current === targetVideoId) {
          setAttempts(current => [created, ...current].slice(0, 100));
        }
        return created;
      })
      .catch(requestError => {
        if (activeVideoIdRef.current === targetVideoId) {
          stateRef.current = previous;
          setState(previous);
          setError(requestError);
        }
        throw requestError;
      });
    return writeQueueRef.current;
  }, [videoId]);

  const reset = useCallback(async () => {
    const targetVideoId = videoId;
    await resetVideoLearningData(targetVideoId);
    if (activeVideoIdRef.current !== targetVideoId) return;
    const next = mergeState();
    stateRef.current = next;
    setState(next);
    setAttempts([]);
  }, [videoId]);

  return { state, attempts, loading, error, updateState, updatePreferences, addAttempt, reset };
}
