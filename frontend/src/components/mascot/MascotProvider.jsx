import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bot,
  History,
  Mic,
  Send,
  Square,
  Trash2,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useAudioFocus } from '../../contexts/AudioFocusContext';
import {
  chatWithMascot,
  clearMascotHistory,
  getMascotSpeech,
  getMascotHealth,
  getMascotHistory,
} from '../../services/mascotApi';
import { getSelectedVoiceForLanguage } from '../../utils/speech';
import { AUDIO_FOCUS_EVENT, setLearningAudioFocus } from '../../utils/audioFocus';
import {
  MASCOT_DRAG_THRESHOLD,
  MASCOT_EMOTION_COLUMNS,
  MASCOT_POSITION_KEY,
  clampMascotPosition,
  isTextEntryActive,
  randomMascotDelay,
  readMascotPosition,
  snapMascotPosition,
} from '../../utils/mascot';


const MascotContext = createContext({
  emitMascotEvent: () => {},
  askMino: () => {},
  openMino: () => {},
});

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const EVENT_COOLDOWN = 60 * 1000;
const OFFLINE_COOLDOWN = 5 * 60 * 1000;
const HEALTH_REFRESH_INTERVAL = 30 * 1000;
const QUICK_STARTS = ['Giải thích lỗi vừa rồi', 'Cho mình bài luyện 5 phút', 'Luyện hội thoại'];


function MascotSprite({ emotion, talking }) {
  const column = MASCOT_EMOTION_COLUMNS[emotion] ?? 0;
  return (
    <span
      className={`mino-sprite mino-emotion-${emotion}`}
      style={{ backgroundPosition: `${column * (100 / 6)}% ${talking ? 100 : 0}%` }}
      aria-hidden="true"
    />
  );
}


export function MascotProvider({
  children,
  activePage,
  activeTopicId,
  settings,
  isModalOpen,
  onNavigate,
}) {
  const { isLearningAudioActive } = useAudioFocus();
  const enabled = settings?.mascotEnabled !== false;
  const proactivity = settings?.mascotProactivity || 'timed';
  const autoSpeak = settings?.mascotAutoSpeak !== false;
  const [emotion, setEmotion] = useState('neutral');
  const [talking, setTalking] = useState(false);
  const [bubble, setBubble] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [lastResponse, setLastResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [health, setHealth] = useState(null);
  const [listening, setListening] = useState(false);
  const [position, setPosition] = useState(() => readMascotPosition(window.innerWidth, window.innerHeight));
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const mascotUtteranceRef = useRef(null);
  const speechAudioRef = useRef(null);
  const speechAudioUrlRef = useRef(null);
  const speechRequestIdRef = useRef(0);
  const recognitionRef = useRef(null);
  const pendingSpeechRef = useRef(null);
  const bubbleTimerRef = useRef(null);
  const proactiveTimerRef = useRef(null);
  const proactiveRequestRef = useRef(false);
  const proactiveCallbackRef = useRef(null);
  const proactiveTimesRef = useRef([]);
  const proactiveTextsRef = useRef(new Set());
  const offlineUntilRef = useRef(0);
  const lastEventAtRef = useRef(0);
  const latestLearningEventRef = useRef(null);
  const previousPageRef = useRef(activePage);
  const messagesEndRef = useRef(null);

  const clientContext = useCallback(event => ({
    activePage,
    topicId: activeTopicId,
    ...(event ? { event } : {}),
  }), [activePage, activeTopicId]);

  const stopMascotSpeech = useCallback((clearPending = true) => {
    if (clearPending) pendingSpeechRef.current = null;
    speechRequestIdRef.current += 1;
    if (mascotUtteranceRef.current && window.speechSynthesis) {
      mascotUtteranceRef.current = null;
      window.speechSynthesis.cancel();
    }
    if (speechAudioRef.current) {
      speechAudioRef.current.pause();
      speechAudioRef.current = null;
    }
    if (speechAudioUrlRef.current) {
      URL.revokeObjectURL(speechAudioUrlRef.current);
      speechAudioUrlRef.current = null;
    }
    setLearningAudioFocus('mascot-edge-tts', false);
    setTalking(false);
  }, []);

  const playSystemSpeech = useCallback(response => {
    if (!autoSpeak || !response?.text || !window.speechSynthesis || isLearningAudioActive) {
      if (response?.text && autoSpeak) pendingSpeechRef.current = response;
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(response.text);
    const voiceURI = response.language === 'vi'
      ? settings?.mascotVietnameseVoiceURI
      : settings?.speechVoiceURI;
    const voice = getSelectedVoiceForLanguage(response.language, voiceURI);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || (response.language === 'en' ? 'en-US' : 'vi-VN');
    utterance.rate = response.language === 'en' ? 0.9 : 1;
    utterance.pitch = 1.04;
    utterance.onstart = () => setTalking(true);
    utterance.onend = () => {
      if (mascotUtteranceRef.current === utterance) mascotUtteranceRef.current = null;
      setTalking(false);
    };
    utterance.onerror = utterance.onend;
    mascotUtteranceRef.current = utterance;
    pendingSpeechRef.current = null;
    window.speechSynthesis.speak(utterance);
  }, [autoSpeak, isLearningAudioActive, settings?.mascotVietnameseVoiceURI, settings?.speechVoiceURI]);

  const playMinoSpeech = useCallback(async response => {
    if (!autoSpeak || !response?.text || isLearningAudioActive) {
      if (response?.text && autoSpeak) pendingSpeechRef.current = response;
      return;
    }
    if (response.language !== 'vi') {
      playSystemSpeech(response);
      return;
    }

    const requestId = ++speechRequestIdRef.current;
    if (mascotUtteranceRef.current && window.speechSynthesis) {
      mascotUtteranceRef.current = null;
      window.speechSynthesis.cancel();
    }
    if (speechAudioRef.current) speechAudioRef.current.pause();
    setLearningAudioFocus('mascot-edge-tts', false);
    if (speechAudioUrlRef.current) URL.revokeObjectURL(speechAudioUrlRef.current);
    speechAudioRef.current = null;
    speechAudioUrlRef.current = null;

    try {
      const audioBlob = await getMascotSpeech(response.text);
      if (requestId !== speechRequestIdRef.current) return;
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      speechAudioRef.current = audio;
      speechAudioUrlRef.current = audioUrl;
      const release = () => {
        if (speechAudioRef.current !== audio) return;
        speechAudioRef.current = null;
        speechAudioUrlRef.current = null;
        URL.revokeObjectURL(audioUrl);
        setLearningAudioFocus('mascot-edge-tts', false);
        setTalking(false);
      };
      audio.onplay = () => {
        setLearningAudioFocus('mascot-edge-tts', true);
        setTalking(true);
      };
      audio.onended = release;
      audio.onerror = release;
      pendingSpeechRef.current = null;
      await audio.play();
    } catch {
      if (requestId === speechRequestIdRef.current) {
        speechAudioRef.current?.pause();
        speechAudioRef.current = null;
        if (speechAudioUrlRef.current) URL.revokeObjectURL(speechAudioUrlRef.current);
        speechAudioUrlRef.current = null;
        setLearningAudioFocus('mascot-edge-tts', false);
        setTalking(false);
        playSystemSpeech(response);
      }
    }
  }, [autoSpeak, isLearningAudioActive, playSystemSpeech]);

  const playSpeech = playMinoSpeech;

  const presentResponse = useCallback(response => {
    setLastResponse(response);
    setEmotion(response.emotion || 'neutral');
    setBubble(response.text);
    window.clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = window.setTimeout(() => setBubble(null), 9000);
    playSpeech(response);
    window.setTimeout(() => setEmotion(current => current === response.emotion ? 'neutral' : current), 9000);
  }, [playSpeech]);

  const refreshHealth = useCallback(() => getMascotHealth()
    .then(result => {
      setHealth(result);
      return result;
    })
    .catch(() => {
      const offline = { online: false, modelAvailable: false };
      setHealth(offline);
      return offline;
    }), []);

  useEffect(() => {
    if (!isLearningAudioActive && pendingSpeechRef.current) {
      const pending = pendingSpeechRef.current;
      window.setTimeout(() => playSpeech(pending), 250);
    }
  }, [isLearningAudioActive, playSpeech]);

  useEffect(() => {
    const interruptForLearningAudio = event => {
      if (!event.detail?.active || event.detail?.source === 'mascot-microphone') return;
      if (!mascotUtteranceRef.current && !speechAudioRef.current) return;
      pendingSpeechRef.current = lastResponse;
      stopMascotSpeech(false);
    };
    window.addEventListener(AUDIO_FOCUS_EVENT, interruptForLearningAudio);
    return () => window.removeEventListener(AUDIO_FOCUS_EVENT, interruptForLearningAudio);
  }, [lastResponse, stopMascotSpeech]);

  const sendMessage = useCallback(async (rawMessage, trigger = 'user', event = null) => {
    const message = String(rawMessage || '').trim();
    if (trigger === 'user' && !message) return null;
    if (loading || proactiveRequestRef.current) return null;
    if (trigger !== 'user') proactiveRequestRef.current = true;
    setLoading(true);
    setEmotion('thinking');
    if (trigger === 'user') {
      setMessages(current => [...current, { role: 'user', text: message }]);
      setInput('');
    }
    try {
      const response = await chatWithMascot(message, trigger, clientContext(event));
      if (response.source === 'qwen') {
        setHealth(current => ({ ...current, online: true, modelAvailable: true, model: 'qwen2.5:1.5b' }));
      }
      if (trigger === 'user') {
        setMessages(current => [...current, { role: 'assistant', text: response.text }]);
      } else if (response.source === 'fallback') {
        offlineUntilRef.current = Date.now() + OFFLINE_COOLDOWN;
      }
      presentResponse(response);
      return response;
    } catch (error) {
      const response = {
        text: error.message || 'Mino chưa thể kết nối. Bạn thử lại sau một chút nhé.',
        language: 'vi',
        emotion: 'concerned',
        quickReplies: ['Thử lại'],
        source: 'fallback',
      };
      if (trigger === 'user') setMessages(current => [...current, { role: 'assistant', text: response.text }]);
      offlineUntilRef.current = Date.now() + OFFLINE_COOLDOWN;
      presentResponse(response);
      return response;
    } finally {
      setLoading(false);
      proactiveRequestRef.current = false;
    }
  }, [clientContext, loading, presentResponse]);

  const requestProactive = useCallback(async (trigger, event) => {
    const now = Date.now();
    proactiveTimesRef.current = proactiveTimesRef.current.filter(timestamp => now - timestamp < FIFTEEN_MINUTES);
    if (
      proactiveTimesRef.current.length >= 3
      || now < offlineUntilRef.current
      || document.visibilityState === 'hidden'
      || isModalOpen
      || isLearningAudioActive
      || isTextEntryActive()
      || isOpen
      || loading
    ) return;

    const response = await sendMessage('', trigger, event);
    if (!response || proactiveTextsRef.current.has(response.text)) return;
    proactiveTimesRef.current.push(now);
    proactiveTextsRef.current.add(response.text);
  }, [isLearningAudioActive, isModalOpen, isOpen, loading, sendMessage]);

  useEffect(() => {
    proactiveCallbackRef.current = requestProactive;
  }, [requestProactive]);

  useEffect(() => {
    if (!enabled || proactivity !== 'timed') return undefined;
    let cancelled = false;
    const schedule = delay => {
      window.clearTimeout(proactiveTimerRef.current);
      proactiveTimerRef.current = window.setTimeout(async () => {
        if (cancelled) return;
        await proactiveCallbackRef.current?.('timed', {
          type: proactiveTimesRef.current.length === 0 ? 'daily_mission' : 'timed_check_in',
        });
        if (!cancelled) schedule(randomMascotDelay());
      }, delay);
    };
    schedule(8000);
    return () => {
      cancelled = true;
      window.clearTimeout(proactiveTimerRef.current);
    };
  }, [enabled, proactivity]);

  useEffect(() => {
    if (!enabled || proactivity !== 'event') {
      previousPageRef.current = activePage;
      return;
    }
    if (previousPageRef.current !== activePage) {
      const from = previousPageRef.current;
      previousPageRef.current = activePage;
      if (Date.now() - lastEventAtRef.current >= EVENT_COOLDOWN) {
        lastEventAtRef.current = Date.now();
        window.setTimeout(() => requestProactive('event', {
          type: 'page_change', detail: `${from} -> ${activePage}`,
        }), 1000);
      }
    }
  }, [activePage, enabled, proactivity, requestProactive]);

  const emitMascotEvent = useCallback(event => {
    latestLearningEventRef.current = event;
    if (!enabled || proactivity !== 'event' || Date.now() - lastEventAtRef.current < EVENT_COOLDOWN) return;
    lastEventAtRef.current = Date.now();
    requestProactive('event', event);
  }, [enabled, proactivity, requestProactive]);

  const askMino = useCallback((message, event = null) => {
    setIsOpen(true);
    return sendMessage(message, 'user', event);
  }, [sendMessage]);

  useEffect(() => {
    if (!enabled) return undefined;
    refreshHealth();
    const intervalId = window.setInterval(refreshHealth, HEALTH_REFRESH_INTERVAL);
    const handleFocus = () => refreshHealth();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshHealth();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, refreshHealth]);

  useEffect(() => {
    if (!isOpen || historyLoaded) return;
    getMascotHistory()
      .then(history => {
        setMessages(history);
      })
      .finally(() => setHistoryLoaded(true));
  }, [historyLoaded, isOpen]);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [isOpen, loading, messages]);

  useEffect(() => {
    const handleResize = () => setPosition(current => clampMascotPosition(
      current,
      window.innerWidth,
      window.innerHeight,
    ));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(bubbleTimerRef.current);
    window.clearTimeout(proactiveTimerRef.current);
    stopMascotSpeech();
  }, [stopMascotSpeech]);

  const handlePointerDown = event => {
    if (event.button !== 0) return;
    const pointerId = event.pointerId ?? 'mouse';
    if (event.pointerId != null) event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
      dragged: false,
    };
  };

  const handlePointerMove = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== (event.pointerId ?? 'mouse')) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) >= MASCOT_DRAG_THRESHOLD) drag.dragged = true;
    if (!drag.dragged) return;
    setPosition(clampMascotPosition(
      { x: drag.origin.x + dx, y: drag.origin.y + dy },
      window.innerWidth,
      window.innerHeight,
    ));
  };

  const handlePointerUp = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== (event.pointerId ?? 'mouse')) return;
    suppressClickRef.current = drag.dragged;
    dragRef.current = null;
    if (drag.dragged) {
      const snapped = snapMascotPosition(position, window.innerWidth, window.innerHeight, { width: 92, height: 150 });
      setPosition(snapped);
      window.localStorage.setItem(MASCOT_POSITION_KEY, JSON.stringify(snapped));
    }
  };

  const handleMascotClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setIsOpen(current => !current);
    setBubble(null);
  };

  const speechRecognitionSupported = typeof window !== 'undefined'
    && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopVoiceInput = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setLearningAudioFocus('mascot-microphone', false);
    setListening(false);
    setEmotion('neutral');
  }, []);

  const toggleVoiceInput = useCallback(() => {
    if (recognitionRef.current) {
      stopVoiceInput();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;

    stopMascotSpeech();
    const recognition = new Recognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => {
      if (recognitionRef.current !== recognition) return;
      setLearningAudioFocus('mascot-microphone', true);
      setListening(true);
      setEmotion('thinking');
    };
    recognition.onresult = event => {
      const transcript = Array.from(event.results || [])
        .map(result => result?.[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) setInput(transcript);
    };
    recognition.onerror = () => {
      if (recognitionRef.current === recognition) setEmotion('concerned');
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setLearningAudioFocus('mascot-microphone', false);
      setListening(false);
      setEmotion('neutral');
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [stopMascotSpeech, stopVoiceInput]);

  useEffect(() => () => stopVoiceInput(), [stopVoiceInput]);

  const modelStatus = listening
    ? 'Đang nghe để nhập tin nhắn...'
    : health?.online && health?.modelAvailable
      ? 'Qwen local sẵn sàng'
      : 'Chế độ offline';

  const handleClearHistory = async () => {
    await clearMascotHistory();
    setMessages([]);
    setLastResponse(null);
  };

  const contextValue = useMemo(() => ({
    emitMascotEvent,
    askMino,
    openMino: () => setIsOpen(true),
  }), [askMino, emitMascotEvent]);

  return (
    <MascotContext.Provider value={contextValue}>
      {children}
      {enabled && (
        <div className="mino-layer" aria-live="polite">
          {bubble && !isOpen && (
            <button
              type="button"
              className={`mino-bubble ${position.x < window.innerWidth / 2 ? 'mino-bubble-left' : 'mino-bubble-right'}`}
              style={{ left: position.x < window.innerWidth / 2 ? 16 : 'auto', right: position.x >= window.innerWidth / 2 ? 16 : 'auto' }}
              onClick={() => { setIsOpen(true); setBubble(null); }}
            >
              {bubble}
            </button>
          )}

          {isOpen && (
            <section className={`mino-chat ${position.x < window.innerWidth / 2 ? 'mino-chat-left' : 'mino-chat-right'}`} aria-label="Trò chuyện với Mino">
              <header className="mino-chat-header">
                <div className="flex items-center gap-sm min-w-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot size={19} /></span>
                  <div className="min-w-0">
                    <h2 className="text-body-md font-semibold text-on-surface">Mino</h2>
                    <p className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                      {health?.online && health?.modelAvailable ? <Wifi size={12} /> : <WifiOff size={12} />}
                      {modelStatus}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {talking && <button type="button" className="mino-icon-button" onClick={() => stopMascotSpeech()} title="Dừng đọc"><Square size={16} /></button>}
                  <button type="button" className="mino-icon-button" onClick={handleClearHistory} title="Xóa lịch sử"><Trash2 size={17} /></button>
                  <button type="button" className="mino-icon-button" onClick={() => setIsOpen(false)} title="Đóng"><X size={18} /></button>
                </div>
              </header>

              <div className="mino-chat-messages">
                {!historyLoaded && <p className="mino-chat-status"><History size={15} /> Đang tải cuộc trò chuyện...</p>}
                {historyLoaded && messages.length === 0 && (
                  <div className="mino-welcome">
                    <MascotSprite emotion="happy" talking={false} />
                    <p>Chào bạn, mình là Mino. Hôm nay chúng ta luyện một chút tiếng Anh nhé?</p>
                  </div>
                )}
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`mino-message mino-message-${message.role}`}>
                    {message.text}
                  </div>
                ))}
                {loading && <div className="mino-message mino-message-assistant mino-thinking">Mino đang suy nghĩ...</div>}
                <div ref={messagesEndRef} />
              </div>

              <div className="mino-quick-replies">
                {(lastResponse?.quickReplies?.length ? lastResponse.quickReplies : QUICK_STARTS).map(reply => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => sendMessage(reply, 'user', reply.toLowerCase().includes('lỗi') ? latestLearningEventRef.current : null)}
                    disabled={loading}
                  >
                    {reply}
                  </button>
                ))}
                {lastResponse?.action?.type === 'navigate' && (
                  <button type="button" onClick={() => onNavigate(lastResponse.action.page)}>Mở phần được gợi ý</button>
                )}
              </div>

              <form className="mino-chat-input" onSubmit={event => { event.preventDefault(); sendMessage(input); }}>
                <textarea
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  rows={1}
                  maxLength={1500}
                  placeholder="Nhắn cho Mino..."
                  aria-label="Tin nhắn cho Mino"
                />
                <button
                  type="button"
                  className={listening ? 'text-error' : ''}
                  onClick={toggleVoiceInput}
                  disabled={!speechRecognitionSupported}
                  title={listening ? 'Dừng nhập bằng giọng nói' : 'Nhập bằng giọng nói'}
                >
                  {listening ? <Square size={18} /> : <Mic size={19} />}
                </button>
                {lastResponse && <button type="button" onClick={() => playSpeech(lastResponse)} title="Đọc lại"><Volume2 size={19} /></button>}
                <button type="submit" disabled={!input.trim() || loading} title="Gửi"><Send size={19} /></button>
              </form>
            </section>
          )}

          <button
            type="button"
            className={`mino-character mino-character-${emotion}`}
            style={{ left: position.x, top: position.y }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={handleMascotClick}
            aria-label={isOpen ? 'Đóng trò chuyện với Mino' : 'Mở trò chuyện với Mino'}
            title="Mino - bạn học của bạn"
          >
            <MascotSprite emotion={emotion} talking={talking} />
          </button>
        </div>
      )}
    </MascotContext.Provider>
  );
}


export function useMascot() {
  return useContext(MascotContext);
}
