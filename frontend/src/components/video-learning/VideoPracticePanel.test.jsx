import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPracticePanel } from './VideoPracticePanel';

const video = { transcript: [{ start: 0, duration: 2, text: 'Hello world', text_vi: 'Xin chào thế giới' }] };
const state = { preferences: { difficulty: 'medium' }, bookmarks: [], lineStats: {} };
const baseProps = {
  video, activeLineIndex: 0, state, attempts: [], settings: {}, learningPack: null,
  onGenerateLearningPack: vi.fn(), generatingPack: false, onSeekLine: vi.fn(), onPlayLine: vi.fn(), onAttempt: vi.fn(async () => ({})),
};

describe('VideoPracticePanel', () => {
  beforeEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    baseProps.onAttempt.mockClear();
  });

  it('scores normalized dictation and records a detailed attempt', async () => {
    const user = userEvent.setup();
    render(<VideoPracticePanel {...baseProps} requestedActivity="dictation" requestedLineIndex={0} />);
    await user.type(screen.getByPlaceholderText('Nhập câu bạn nghe được…'), 'hello WORLD!');
    await user.click(screen.getByRole('button', { name: 'Chấm điểm' }));
    expect(screen.getByText(/100\/100/)).toBeInTheDocument();
    expect(baseProps.onAttempt).toHaveBeenCalledWith(expect.objectContaining({ activity: 'dictation', score: 100, lineIndex: 0 }));
  });

  it('falls back without locking other tools when speech recognition is unsupported', async () => {
    const user = userEvent.setup();
    render(<VideoPracticePanel {...baseProps} requestedActivity="shadowing" requestedLineIndex={0} />);
    expect(screen.getByText(/Fallback thủ công/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Ghi âm/ }));
    expect(screen.getByText(/không hỗ trợ SpeechRecognition/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Dictation/ })).toBeEnabled();
  });
});
