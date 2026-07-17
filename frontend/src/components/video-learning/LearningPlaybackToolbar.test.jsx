import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LearningPlaybackToolbar } from './LearningPlaybackToolbar';

const preferences = {
  playbackRate: 1, subtitleMode: 'bilingual', subtitleOffset: 0,
  autoPause: false, autoPauseDelay: 1.5, repeatCount: 2,
  progressiveReplay: false, audioFocus: false,
};

describe('LearningPlaybackToolbar', () => {
  it('navigates lines and exposes playback learning controls by keyboard focus', async () => {
    const user = userEvent.setup();
    const onPreviousLine = vi.fn();
    const onNextLine = vi.fn();
    const onReplay = vi.fn();
    const onPreferencesChange = vi.fn();
    render(<LearningPlaybackToolbar preferences={preferences} onPreferencesChange={onPreferencesChange} activeLineIndex={2} lineCount={5} onPreviousLine={onPreviousLine} onNextLine={onNextLine} onReplay={onReplay} loopRange={null} onSetLoopPoint={vi.fn()} onClearLoop={vi.fn()} />);

    await user.click(screen.getByLabelText('Câu trước'));
    await user.click(screen.getByLabelText('Câu sau'));
    await user.click(screen.getByTitle('Phát lại câu (R)'));
    expect(onPreviousLine).toHaveBeenCalledOnce();
    expect(onNextLine).toHaveBeenCalledOnce();
    expect(onReplay).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByLabelText('Tốc độ phát'), { target: { value: '0.75' } });
    fireEvent.change(screen.getByLabelText('Chế độ phụ đề'), { target: { value: 'reveal' } });
    expect(onPreferencesChange).toHaveBeenCalledWith({ playbackRate: 0.75 });
    expect(onPreferencesChange).toHaveBeenCalledWith({ subtitleMode: 'reveal' });
  });
});
