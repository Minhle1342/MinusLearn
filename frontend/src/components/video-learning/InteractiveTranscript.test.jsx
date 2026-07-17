import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InteractiveTranscript } from './InteractiveTranscript';

vi.mock('../../services/api', () => ({
  explainVideoPhrase: vi.fn(async () => ({ meaning: 'xin chào', ipa: '/həˈləʊ/', partOfSpeech: 'interjection', collocations: ['say hello'], example: 'Hello there.' })),
}));

const video = { transcript: [{ start: 0, text: 'Hello there', text_vi: 'Xin chào' }] };
const state = { bookmarks: [], notes: {}, knownTokens: [], dictionaryCache: {}, lineStats: {} };

describe('InteractiveTranscript', () => {
  it('opens a contextual popup from a clicked word and supports bookmark/practice actions', async () => {
    const user = userEvent.setup();
    const onToggleBookmark = vi.fn();
    const onOpenPractice = vi.fn();
    render(<InteractiveTranscript video={video} activeLineIndex={0} state={state} settings={{ apiKey: 'device-only', model: 'gemini' }} lineRefs={{ current: [] }} panelRef={createRef()} onSeekLine={vi.fn()} onLoopLine={vi.fn()} onToggleBookmark={onToggleBookmark} onSaveNote={vi.fn()} onSavePhrase={vi.fn()} onToggleKnown={vi.fn()} onCacheDictionary={vi.fn()} onOpenPractice={onOpenPractice} />);

    await user.click(screen.getByRole('button', { name: 'Hello' }));
    expect(screen.getByRole('dialog', { name: 'Tra từ Hello' })).toBeInTheDocument();
    await user.click(screen.getByTitle('Đánh dấu'));
    await user.click(screen.getByTitle('Dictation'));
    expect(onToggleBookmark).toHaveBeenCalledWith(0);
    expect(onOpenPractice).toHaveBeenCalledWith('dictation', 0);
  });
});
