import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoLearningState } from './useVideoLearningState';
import {
  getVideoLearningAttempts,
  getVideoLearningState,
  patchVideoLearningState,
} from '../services/videoLearningService';

vi.mock('../services/videoLearningService', () => ({
  getVideoLearningState: vi.fn(),
  getVideoLearningAttempts: vi.fn(),
  patchVideoLearningState: vi.fn(),
  createVideoLearningAttempt: vi.fn(),
  resetVideoLearningData: vi.fn(),
}));

describe('useVideoLearningState', () => {
  beforeEach(() => {
    getVideoLearningAttempts.mockResolvedValue([]);
    getVideoLearningState.mockImplementation(async videoId => ({ videoId, bookmarks: videoId === 'video-2' ? [2] : [] }));
  });

  it('does not let a late PATCH response from the previous video overwrite the next video', async () => {
    let resolveOldPatch;
    patchVideoLearningState.mockImplementation((videoId, state) => videoId === 'video-1'
      ? new Promise(resolve => { resolveOldPatch = resolve; })
      : Promise.resolve(state));

    const { result, rerender } = renderHook(({ videoId }) => useVideoLearningState(videoId), { initialProps: { videoId: 'video-1' } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let oldWrite;
    act(() => { oldWrite = result.current.updateState(current => ({ ...current, bookmarks: [1] })); });

    rerender({ videoId: 'video-2' });
    await waitFor(() => expect(result.current.state.videoId).toBe('video-2'));
    expect(result.current.state.bookmarks).toEqual([2]);

    await act(async () => {
      resolveOldPatch({ videoId: 'video-1', bookmarks: [1] });
      await oldWrite;
    });
    expect(result.current.state.videoId).toBe('video-2');
    expect(result.current.state.bookmarks).toEqual([2]);
  });
});
