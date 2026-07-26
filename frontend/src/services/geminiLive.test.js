import { describe, expect, it, vi } from 'vitest';
import {
  GeminiLiveSession,
  buildGeminiLiveSetup,
  decodePcm16Base64,
  float32ToPcm16Base64,
  getGeminiLiveErrorMessage,
} from './geminiLive';


describe('Gemini Live audio helpers', () => {
  it('encodes little-endian PCM16 and decodes it back', () => {
    const encoded = float32ToPcm16Base64(new Float32Array([-1, 0, 1]), 16000);
    const decoded = decodePcm16Base64(encoded);

    expect(decoded).toHaveLength(3);
    expect(decoded[0]).toBeCloseTo(-1, 4);
    expect(decoded[1]).toBe(0);
    expect(decoded[2]).toBeCloseTo(1, 4);
  });

  it('resamples browser audio to 16 kHz', () => {
    const encoded = float32ToPcm16Base64(new Float32Array(480), 48000);
    expect(decodePcm16Base64(encoded)).toHaveLength(160);
  });

  it('builds the raw WebSocket setup using the v1beta GenerationConfig schema', () => {
    const request = buildGeminiLiveSetup({ model: 'gemini-live', voiceName: 'Aoede' });

    expect(request.setup.model).toBe('models/gemini-live');
    expect(request.setup.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(request.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
    expect(request.setup.responseModalities).toBeUndefined();
    expect(request.setup.realtimeInputConfig.automaticActivityDetection.silenceDurationMs).toBe(700);
  });

  it('turns browser microphone failures into actionable messages', () => {
    expect(getGeminiLiveErrorMessage({ name: 'NotAllowedError' })).toContain('cho phép quyền micro');
    expect(getGeminiLiveErrorMessage({ name: 'NotReadableError' })).toContain('ứng dụng khác');
  });

  it('stops queued playback immediately when Gemini reports an interruption', () => {
    const onState = vi.fn();
    const stop = vi.fn();
    const session = new GeminiLiveSession({ onState });
    session.microphoneActive = true;
    session.playbackSources.add({ stop });

    session.handleMessage({ serverContent: { interrupted: true } });

    expect(stop).toHaveBeenCalledOnce();
    expect(session.playbackSources.size).toBe(0);
    expect(onState).toHaveBeenLastCalledWith('listening');
  });

  it('emits input and output transcripts when a turn completes', () => {
    const onTurn = vi.fn();
    const session = new GeminiLiveSession({ onTurn });

    session.handleMessage({ serverContent: { inputTranscription: { text: 'Xin chào' } } });
    session.handleMessage({ serverContent: { outputTranscription: { text: 'Chào bạn' }, turnComplete: true } });

    expect(onTurn).toHaveBeenCalledWith({ inputText: 'Xin chào', outputText: 'Chào bạn' });
  });
});
