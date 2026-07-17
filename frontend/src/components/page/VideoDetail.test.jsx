import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoDetail } from './VideoDetail';

const playerMocks = vi.hoisted(() => ({ seekTo: vi.fn(), currentTime: 0 }));

vi.mock('react-player', async () => {
  const ReactModule = await import('react');
  const MockPlayer = ReactModule.forwardRef((props, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({
      seekTo: playerMocks.seekTo,
      getCurrentTime: () => playerMocks.currentTime,
    }));
    ReactModule.useEffect(() => { props.onReady?.(); props.onDuration?.(100); }, []);
    return <button type="button" data-testid="mock-player" onClick={() => props.onEnded?.()}>Mock video</button>;
  });
  return { default: MockPlayer };
});

vi.mock('../../hooks/useVideoLearningState', () => ({
  useVideoLearningState: () => ({
    state: {
      preferences: { playbackRate: 1, subtitleMode: 'bilingual', subtitleOffset: 0, autoPause: false, autoPauseDelay: 1.5, repeatCount: 1, progressiveReplay: false, audioFocus: false, difficulty: 'auto' },
      bookmarks: [], notes: {}, knownTokens: [], dictionaryCache: {}, learningPackCache: {}, aggregateStats: {}, lineStats: {},
    },
    attempts: [], loading: false, error: null,
    updateState: vi.fn(async updater => updater), updatePreferences: vi.fn(async () => ({})), addAttempt: vi.fn(), reset: vi.fn(),
  }),
}));

vi.mock('../video-learning/VideoLearningSidebar', () => ({
  VideoLearningSidebar: () => <aside data-testid="learning-sidebar">Studio sidebar</aside>,
}));
vi.mock('../video-learning/LearningPlaybackToolbar', () => ({
  LearningPlaybackToolbar: () => <div data-testid="learning-toolbar">Learning toolbar</div>,
}));

const videos = [
  { id: 'video-1', youtubeId: 'abcdefghijk', topicId: 'topic-1', title: 'Current lesson', resumePositionSeconds: 12, playbackDurationSeconds: 100, transcript: [{ start: 0, duration: 2, text: 'Hello' }] },
  { id: 'video-2', youtubeId: '12345678901', topicId: 'topic-1', title: 'Next lesson', transcript: [{ start: 0, duration: 2, text: 'Next' }] },
];

describe('VideoDetail regression coverage', () => {
  beforeEach(() => playerMocks.seekTo.mockClear());

  it('restores saved progress and keeps the learning studio mounted', async () => {
    render(<VideoDetail videoId="video-1" videos={videos} setVideos={vi.fn()} settings={{}} onBack={vi.fn()} onVideoSelect={vi.fn()} onPlaybackUpdate={vi.fn(async () => {})} />);
    await waitFor(() => expect(playerMocks.seekTo).toHaveBeenCalledWith(12, 'seconds'));
    expect(screen.getByTestId('learning-sidebar')).toBeInTheDocument();
    expect(screen.getAllByTestId('learning-toolbar').length).toBeGreaterThan(0);
  });

  it('preserves next-video recommendation after the current video ends', async () => {
    const user = userEvent.setup();
    const onVideoSelect = vi.fn();
    const onPlaybackUpdate = vi.fn(async () => {});
    render(<VideoDetail videoId="video-1" videos={videos} setVideos={vi.fn()} settings={{}} onBack={vi.fn()} onVideoSelect={onVideoSelect} onPlaybackUpdate={onPlaybackUpdate} />);

    await act(async () => user.click(screen.getByTestId('mock-player')));
    const nextButton = await screen.findByTitle('Next lesson');
    await user.click(nextButton);
    expect(onVideoSelect).toHaveBeenCalledWith('video-2');
    expect(onPlaybackUpdate).toHaveBeenCalledWith('video-1', expect.objectContaining({ resumePositionSeconds: 0, watchedAt: expect.any(Number) }), expect.any(Object));
  });
});
