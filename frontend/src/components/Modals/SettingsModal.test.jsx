import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from './SettingsModal';
import { apiRequest } from '../../services/backendApi';
import { getMascotSpeech } from '../../services/mascotApi';


vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('../../services/backendApi', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('../../services/mascotApi', () => ({
  getMascotSpeech: vi.fn(),
}));

describe('SettingsModal Mino voice previews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockResolvedValue({
      online: true,
      modelAvailable: true,
      model: 'qwen2.5:1.5b',
      speechProvider: 'edge-tts',
      speechVoice: 'vi-VN-NamMinhNeural',
    });
    getMascotSpeech.mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }));
  });

  it('requests and plays the Nam Minh voice from its preview button', async () => {
    const user = userEvent.setup();
    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={{ mascotEnabled: true }}
        onSaveSettings={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Mino/i }));
    await user.click(await screen.findByTitle('Nghe thử giọng Nam Minh'));

    await waitFor(() => expect(getMascotSpeech).toHaveBeenCalledWith(
      'Xin chào, mình là Mino. Đây là giọng Nam Minh của mình.',
    ));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });
});
