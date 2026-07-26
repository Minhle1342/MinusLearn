import { createMascotLiveToken } from './mascotApi';


const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const SETUP_TIMEOUT_MS = 12000;

const MINO_LIVE_INSTRUCTION = `You are Mino, MinusLearn's friendly learner-robot astronaut and a light English coach.
Speak naturally with a warm, lively Vietnamese voice. Use Vietnamese for coaching and explanations, and English for role-play or pronunciation practice. Keep each spoken turn concise.
Help with vocabulary, grammar, sentence correction, mistake explanation, role-play, four-skill coaching, five-minute study plans, and spaced review. Ask only one useful question at a time. Never invent study progress, source text, answer data, or pronunciation evidence.
When an input starts with [[MINO_NARRATE]], say only the text after that marker. Preserve its language and wording, with no introduction, commentary, or extra words.`;

export function buildGeminiLiveSetup({ model, voiceName = 'Aoede', context = {} }) {
  return {
    setup: {
      model: `models/${model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          prefixPaddingMs: 100,
          silenceDurationMs: 700,
        },
      },
      systemInstruction: {
        parts: [{ text: `${MINO_LIVE_INSTRUCTION}\nCurrent learning context: ${JSON.stringify(context)}` }],
      },
    },
  };
}

export function getGeminiLiveErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Micro đang bị chặn. Hãy cho phép quyền micro cho trang này rồi thử lại.';
  }
  if (error?.name === 'NotFoundError') return 'Không tìm thấy micro trên thiết bị.';
  if (error?.name === 'NotReadableError' || error?.name === 'AbortError') {
    return 'Không mở được micro. Hãy đóng ứng dụng khác đang dùng micro rồi thử lại.';
  }
  const message = String(error?.message || 'Không thể kết nối Gemini Live').trim();
  if (/permission|not allowed|denied/i.test(message)) {
    return 'Micro đang bị chặn. Hãy cho phép quyền micro cho trang này rồi thử lại.';
  }
  return message.slice(0, 240);
}

function appendTranscript(current, fragment) {
  const next = String(fragment || '');
  if (!next) return current;
  if (!current || next.startsWith(current)) return next;
  if (current.endsWith(next)) return current;
  return `${current}${/^[\s.,!?;:]/.test(next) ? '' : ' '}${next}`;
}

function bytesToBase64(bytes) {
  let binary = '';
  const blockSize = 0x8000;
  for (let index = 0; index < bytes.length; index += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + blockSize));
  }
  return window.btoa(binary);
}

export function float32ToPcm16Base64(samples, inputSampleRate, outputSampleRate = INPUT_SAMPLE_RATE) {
  if (!samples?.length || !inputSampleRate || !outputSampleRate) return '';
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const bytes = new Uint8Array(outputLength * 2);
  const view = new DataView(bytes.buffer);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = sourceIndex - left;
    const sample = Math.max(-1, Math.min(1, samples[left] * (1 - weight) + samples[right] * weight));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return bytesToBase64(bytes);
}

export function decodePcm16Base64(base64) {
  const binary = window.atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const view = new DataView(buffer);
  const samples = new Float32Array(Math.floor(binary.length / 2));
  for (let index = 0; index < samples.length; index += 1) {
    const value = view.getInt16(index * 2, true);
    samples[index] = value / (value < 0 ? 0x8000 : 0x7fff);
  }
  return samples;
}

export function isGeminiLiveSupported() {
  return typeof window !== 'undefined'
    && Boolean(window.WebSocket)
    && Boolean(window.AudioContext || window.webkitAudioContext);
}

export class GeminiLiveSession {
  constructor({
    voiceName = 'Aoede',
    context = {},
    onState = () => {},
    onTurn = () => {},
    onError = () => {},
    onPlaybackEnd = () => {},
  } = {}) {
    this.voiceName = voiceName;
    this.context = context;
    this.onState = onState;
    this.onTurn = onTurn;
    this.onError = onError;
    this.onPlaybackEnd = onPlaybackEnd;
    this.socket = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.mediaSource = null;
    this.processor = null;
    this.silentGain = null;
    this.playbackSources = new Set();
    this.nextPlaybackTime = 0;
    this.inputTranscript = '';
    this.outputTranscript = '';
    this.microphoneActive = false;
    this.turnComplete = false;
    this.closed = false;
    this.state = 'idle';
    this.errorReported = false;
  }

  setState(state) {
    this.state = state;
    this.onState(state);
  }

  ensureAudioContext() {
    if (!this.audioContext) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextCtor();
    }
    this.audioContext.resume?.().catch(() => {});
    return this.audioContext;
  }

  async connect({ microphone = false } = {}) {
    if (this.socket?.readyState === window.WebSocket.OPEN) return;
    if (!isGeminiLiveSupported()) throw new Error('Trình duyệt chưa hỗ trợ Gemini Live');

    this.closed = false;
    this.errorReported = false;
    this.setState('connecting');
    this.ensureAudioContext();
    const microphonePromise = microphone ? this.requestMicrophone() : Promise.resolve(null);

    try {
      const [credentials] = await Promise.all([createMascotLiveToken(), microphonePromise]);
      await this.openSocket(credentials);
      if (microphone) this.attachMicrophone();
      this.setState(microphone ? 'listening' : 'ready');
    } catch (error) {
      this.close(false);
      const safeError = new Error(getGeminiLiveErrorMessage(error));
      this.setState('error');
      this.onError(safeError);
      throw safeError;
    }
  }

  async requestMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Trình duyệt chưa cho phép truy cập micro');
    }
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (error) {
      const wrapped = new Error(getGeminiLiveErrorMessage(error));
      wrapped.name = error?.name || 'MicrophoneError';
      throw wrapped;
    }
    return this.mediaStream;
  }

  openSocket(credentials) {
    return new Promise((resolve, reject) => {
      const url = `${credentials.websocketUrl}?access_token=${encodeURIComponent(credentials.token)}`;
      const socket = new window.WebSocket(url);
      this.socket = socket;
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error('Gemini Live phản hồi quá chậm'));
      }, SETUP_TIMEOUT_MS);

      socket.onopen = () => {
        socket.send(JSON.stringify(buildGeminiLiveSetup({
          model: credentials.model,
          voiceName: this.voiceName,
          context: this.context,
        })));
      };

      socket.onmessage = event => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.setupComplete && !settled) {
          settled = true;
          window.clearTimeout(timeoutId);
          resolve();
        }
        this.handleMessage(message);
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeoutId);
          reject(new Error('Không mở được kết nối Gemini Live'));
        }
      };

      socket.onclose = event => {
        window.clearTimeout(timeoutId);
        const closeDetail = event.reason
          ? `Gemini Live đóng kết nối (${event.code}): ${event.reason}`
          : `Gemini Live đóng kết nối (mã ${event.code})`;
        if (!settled) {
          settled = true;
          reject(new Error(closeDetail));
        } else if (!this.closed) {
          this.stopMicrophone(false);
          this.setState('error');
          if (!this.errorReported) {
            this.errorReported = true;
            this.onError(new Error(closeDetail));
          }
        }
      };
    });
  }

  attachMicrophone() {
    if (!this.mediaStream || this.processor) return;
    const context = this.ensureAudioContext();
    this.mediaSource = context.createMediaStreamSource(this.mediaStream);
    this.processor = context.createScriptProcessor(4096, 1, 1);
    this.silentGain = context.createGain();
    this.silentGain.gain.value = 0;
    this.processor.onaudioprocess = event => {
      if (!this.microphoneActive || this.socket?.readyState !== window.WebSocket.OPEN) return;
      const data = float32ToPcm16Base64(event.inputBuffer.getChannelData(0), context.sampleRate);
      if (!data) return;
      this.socket.send(JSON.stringify({
        realtimeInput: {
          audio: { data, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` },
        },
      }));
    };
    this.mediaSource.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(context.destination);
    this.microphoneActive = true;
  }

  sendText(text) {
    if (this.socket?.readyState !== window.WebSocket.OPEN) {
      throw new Error('Gemini Live chưa sẵn sàng');
    }
    this.turnComplete = false;
    this.socket.send(JSON.stringify({ realtimeInput: { text } }));
  }

  async speakText(text) {
    await this.connect();
    this.sendText(`[[MINO_NARRATE]] ${text}`);
  }

  handleMessage(message) {
    const content = message.serverContent;
    if (!content) return;

    if (content.interrupted) {
      this.stopPlayback();
      this.setState(this.microphoneActive ? 'listening' : 'ready');
    }

    if (content.inputTranscription?.text) {
      this.inputTranscript = appendTranscript(this.inputTranscript, content.inputTranscription.text);
    }
    if (content.outputTranscription?.text) {
      this.outputTranscript = appendTranscript(this.outputTranscript, content.outputTranscription.text);
    }

    const parts = content.modelTurn?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) this.queueAudio(part.inlineData.data);
    }

    if (content.turnComplete) {
      this.turnComplete = true;
      const inputText = this.inputTranscript.trim();
      const outputText = this.outputTranscript.trim();
      this.inputTranscript = '';
      this.outputTranscript = '';
      if (inputText || outputText) this.onTurn({ inputText, outputText });
      if (this.playbackSources.size === 0) this.finishPlayback();
    }
  }

  queueAudio(base64) {
    const samples = decodePcm16Base64(base64);
    if (!samples.length) return;
    const context = this.ensureAudioContext();
    const buffer = context.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.02, this.nextPlaybackTime);
    this.nextPlaybackTime = startAt + buffer.duration;
    this.playbackSources.add(source);
    this.setState('speaking');
    source.onended = () => {
      this.playbackSources.delete(source);
      if (this.turnComplete && this.playbackSources.size === 0) this.finishPlayback();
    };
    source.start(startAt);
  }

  finishPlayback() {
    this.turnComplete = false;
    this.nextPlaybackTime = this.audioContext?.currentTime || 0;
    this.setState(this.microphoneActive ? 'listening' : 'ready');
    this.onPlaybackEnd();
  }

  stopPlayback() {
    for (const source of this.playbackSources) {
      try { source.stop(); } catch { /* source may already have ended */ }
    }
    this.playbackSources.clear();
    this.nextPlaybackTime = this.audioContext?.currentTime || 0;
    this.turnComplete = false;
  }

  stopMicrophone(sendEnd = true) {
    if (sendEnd && this.microphoneActive && this.socket?.readyState === window.WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
    this.microphoneActive = false;
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.mediaSource?.disconnect();
    this.silentGain?.disconnect();
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.processor = null;
    this.mediaSource = null;
    this.silentGain = null;
    this.mediaStream = null;
  }

  close(notify = true) {
    this.closed = true;
    this.stopMicrophone();
    this.stopPlayback();
    if (this.socket && this.socket.readyState < window.WebSocket.CLOSING) this.socket.close(1000, 'Client closed');
    this.socket = null;
    this.audioContext?.close?.().catch(() => {});
    this.audioContext = null;
    if (notify) this.setState('idle');
  }
}
