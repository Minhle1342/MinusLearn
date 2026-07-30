import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioFocusProvider } from '../../contexts/AudioFocusContext';
import { MascotProvider } from './MascotProvider';
import * as mascotApi from '../../services/mascotApi';


vi.mock('../../services/mascotApi', () => ({
  getMascotHealth: vi.fn(),
  getMascotHistory: vi.fn(),
  clearMascotHistory: vi.fn(),
  getMascotSpeech: vi.fn(),
  chatWithMascot: vi.fn(),
}));

const settings = {
  mascotEnabled: true,
  mascotProactivity: 'event',
  mascotAutoSpeak: true,
  mascotVietnameseVoiceURI: '',
  speechVoiceURI: '',
};

function renderMascot() {
  return render(
    <AudioFocusProvider>
      <MascotProvider
        activePage="reading"
        activeTopicId="topic-1"
        settings={settings}
        isModalOpen={false}
        onNavigate={vi.fn()}
      >
        <main>Learning content</main>
      </MascotProvider>
    </AudioFocusProvider>,
  );
}

describe('MascotProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mascotApi.getMascotHistory.mockResolvedValue([]);
    HTMLMediaElement.prototype.play.mockResolvedValue();
    mascotApi.getMascotHealth.mockResolvedValue({
      online: true,
      modelAvailable: true,
      model: 'qwen2.5:1.5b',
      speechProvider: 'edge-tts',
      speechVoice: 'vi-VN-NamMinhNeural',
    });
    mascotApi.clearMascotHistory.mockResolvedValue(null);
    mascotApi.getMascotSpeech.mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }));
    mascotApi.chatWithMascot.mockResolvedValue({
      text: 'Bạn đang tiến bộ tốt.', language: 'vi', emotion: 'happy', quickReplies: [], source: 'qwen',
    });
  });

  it('opens chat and sends a context-aware user message', async () => {
    const user = userEvent.setup();
    renderMascot();
    await user.click(screen.getByRole('button', { name: 'Mở trò chuyện với Mino' }));
    const input = await screen.findByRole('textbox', { name: 'Tin nhắn cho Mino' });
    await user.type(input, 'Giải thích câu này');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(mascotApi.chatWithMascot).toHaveBeenCalledWith(
      'Giải thích câu này',
      'user',
      { activePage: 'reading', topicId: 'topic-1' },
    ));
    expect(await screen.findByText('Bạn đang tiến bộ tốt.')).toBeInTheDocument();
    await waitFor(() => expect(mascotApi.getMascotSpeech).toHaveBeenCalledWith('Bạn đang tiến bộ tốt.'));
  });

  it('treats a pointer drag as movement instead of a click', () => {
    renderMascot();
    const button = screen.getByRole('button', { name: 'Mở trò chuyện với Mino' });
    fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 300, clientY: 500 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 100, clientY: 300 });
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 100, clientY: 300 });
    fireEvent.click(button);

    expect(screen.queryByRole('region', { name: 'Trò chuyện với Mino' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('minuslearn_mino_position')).not.toBeNull();
  });

  it('uses Web Speech when the Nam Minh MP3 cannot start', async () => {
    HTMLMediaElement.prototype.play.mockRejectedValueOnce(new Error('playback blocked'));
    const user = userEvent.setup();
    renderMascot();
    await user.click(screen.getByRole('button', { name: 'Mở trò chuyện với Mino' }));
    await user.type(await screen.findByRole('textbox', { name: 'Tin nhắn cho Mino' }), 'Chào Mino');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(window.speechSynthesis.speak).toHaveBeenCalled());
  });

  it('refreshes Qwen health when the window regains focus', async () => {
    mascotApi.getMascotHealth
      .mockResolvedValueOnce({ online: false, modelAvailable: false, model: 'qwen2.5:1.5b' })
      .mockResolvedValue({ online: true, modelAvailable: true, model: 'qwen2.5:1.5b' });

    const user = userEvent.setup();
    renderMascot();
    await waitFor(() => expect(mascotApi.getMascotHealth).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Mở trò chuyện với Mino' }));
    expect(await screen.findByText('Chế độ offline')).toBeInTheDocument();

    window.dispatchEvent(new Event('focus'));

    expect(await screen.findByText('Qwen local sẵn sàng')).toBeInTheDocument();
  });
});
