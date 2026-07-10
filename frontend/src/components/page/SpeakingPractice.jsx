import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Mic,
  RotateCcw,
  Settings,
  Square,
  Volume2,
  XCircle,
  MessageSquare,
  ChevronRight,
  Loader2,
  BookOpen,
  ExternalLink
} from 'lucide-react';
import {
  createPronunciationAssessmentSession,
  FALLBACK_SIMILARITY_THRESHOLD,
  hasSpeechRecognitionSupport,
} from '../../services/speechAssessment';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { speakEnglishText, getEnglishVoices, getSelectedEnglishVoice } from '../../utils/speech';
import { generateSpeakingScenario, chatWithNPC, evaluateSpeakingPractice } from '../../services/api';

const EMOTION_EMOJIS = {
  happy: '😊',
  sad: '😢',
  surprised: '😲',
  thinking: '🤔',
  neutral: '😐',
  excited: '🤩',
  confused: '😕'
};

function shuffleWords(words) {
  return [...words].sort(() => 0.5 - Math.random());
}

function formatScore(score) {
  return typeof score === 'number' ? Math.round(score) : '-';
}

const SPEAKER_COLORS = [
  { bg: 'bg-accent-sky/10', text: 'text-accent-sky', border: 'border-accent-sky/20' },
  { bg: 'bg-accent-pink/10', text: 'text-accent-pink', border: 'border-accent-pink/20' },
  { bg: 'bg-accent-green/10', text: 'text-accent-green', border: 'border-accent-green/20' },
  { bg: 'bg-accent-orange/10', text: 'text-accent-orange', border: 'border-accent-orange/20' },
  { bg: 'bg-accent-purple/10', text: 'text-accent-purple', border: 'border-accent-purple/20' },
  { bg: 'bg-accent-teal/10', text: 'text-accent-teal', border: 'border-accent-teal/20' },
];

function getSpeakerStyles(speakerName) {
  if (!speakerName) return SPEAKER_COLORS[0];
  let hash = 0;
  for (let i = 0; i < speakerName.length; i++) {
    hash = speakerName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[index];
}

export function SpeakingPractice({ words, activeTopicId, topics, settings, onOpenSettings, setSrData }) {
  const [phase, setPhase] = useState('setup');
  const [practiceMode, setPracticeMode] = useState('read'); // 'read' or 'ai'
  
  // Read mode states
  const [wordCount, setWordCount] = useState(10);
  const [practiceQueue, setPracticeQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [currentResult, setCurrentResult] = useState(null);
  const [sessionResults, setSessionResults] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const sessionRef = useRef(null);
  const [speakingMistakes, setSpeakingMistakes] = useLocalStorage('minuslearn_speaking_mistakes', {});

  // AI mode states
  const [aiChatHistory, setAiChatHistory] = useState([]);
  const [aiSituation, setAiSituation] = useState('');
  const [aiFeedback, setAiFeedback] = useState(null);
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);
  const chatEndRef = useRef(null);
  const [speakerVoiceMap, setSpeakerVoiceMap] = useState({});

  const currentTopic = topics.find(topic => topic.id === activeTopicId);
  const topicWords = useMemo(
    () => words.filter(word => word.topicId === activeTopicId),
    [words, activeTopicId]
  );
  const speakableWords = useMemo(
    () => topicWords.filter(word => word.example?.trim()),
    [topicWords]
  );
  const hasSpeechRecognition = hasSpeechRecognitionSupport();
  const currentWord = practiceQueue[currentIndex];

  const topicMistakes = useMemo(
    () => speakableWords.filter(word => speakingMistakes[word.id]),
    [speakableWords, speakingMistakes]
  );

  useEffect(() => {
    setWordCount(Math.max(1, speakableWords.length || 1));
    setPhase('setup');
    setPracticeQueue([]);
    setCurrentIndex(0);
    setLiveTranscript('');
    setCurrentResult(null);
    setSessionResults([]);
    setErrorMessage('');
    setAiChatHistory([]);
    setAiSituation('');
    setAiFeedback(null);
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
  }, [activeTopicId, speakableWords.length]);

  useEffect(() => () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
  }, []);
  
  useEffect(() => {
    if (phase === 'ai_playing' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [aiChatHistory, phase, liveTranscript]);

  const handleStartPractice = async () => {
    if (!hasSpeechRecognition || speakableWords.length === 0) return;

    if (practiceMode === 'read') {
      const count = Math.min(Math.max(1, wordCount), speakableWords.length);
      setPracticeQueue(shuffleWords(speakableWords).slice(0, count));
      setCurrentIndex(0);
      setLiveTranscript('');
      setCurrentResult(null);
      setSessionResults([]);
      setErrorMessage('');
      setPhase('playing');
    } else {
      setPhase('ai_loading');
      setAiChatHistory([]);
      setAiSituation('');
      setAiFeedback(null);
      setErrorMessage('');
      
      try {
        const scenario = await generateSpeakingScenario(
          topicWords, 
          currentTopic?.name || 'General', 
          settings.apiKey, 
          settings.model
        );
        
        const voices = getEnglishVoices();
        const shuffledVoices = [...voices].sort(() => 0.5 - Math.random());
        if (shuffledVoices.length > 0) {
          setSpeakerVoiceMap({
            [scenario.npc_name || 'AI']: shuffledVoices[0].voiceURI
          });
        }

        setAiSituation(scenario.situation);
        setAiChatHistory([{
          speaker: scenario.npc_name || 'AI',
          text: scenario.npc_first_line,
          emotion: scenario.npc_first_emotion || 'neutral',
          isUserTurn: false
        }]);
        
        setPhase('ai_playing');
        
        // Auto play first line
        setTimeout(() => {
          speakDialogueLine({ text: scenario.npc_first_line, speaker: scenario.npc_name || 'AI' });
        }, 500);
      } catch (err) {
        setErrorMessage(err.message || 'Lỗi tạo tình huống. Hãy thử lại.');
        setPhase('setup');
      }
    }
  };

  // --- READ MODE HANDLERS ---
  const handleStartRecording = async () => {
    if (!currentWord || isRecording) return;
    setLiveTranscript('');
    setCurrentResult(null);
    setErrorMessage('');
    try {
      const session = await createPronunciationAssessmentSession({
        referenceText: currentWord.example,
        onTranscript: setLiveTranscript,
        onError: setErrorMessage,
      });
      sessionRef.current = session;
      await session.start();
      setIsRecording(true);
    } catch (error) {
      setErrorMessage(error.message || 'Không thể bắt đầu ghi âm.');
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    if (!sessionRef.current || !isRecording) return;
    try {
      const result = await sessionRef.current.stop();
      setCurrentResult(result);
      setLiveTranscript(result.transcript);
      setSessionResults(prev => [...prev, { word: currentWord, ...result }]);
    } catch (error) {
      setErrorMessage(error.message || 'Không thể dừng ghi âm.');
    } finally {
      sessionRef.current = null;
      setIsRecording(false);
    }
  };

  const handleRetry = () => {
    setSessionResults(prev => {
      if (!prev.length) return prev;
      const lastEntry = prev[prev.length - 1];
      return lastEntry.word.id === currentWord.id ? prev.slice(0, -1) : prev;
    });
    setLiveTranscript('');
    setCurrentResult(null);
    setErrorMessage('');
  };

  const handleNext = () => {
    const currentEntry = sessionResults[sessionResults.length - 1];
    if (currentEntry) {
      setSpeakingMistakes(prev => {
        const next = { ...prev };
        if (currentEntry.isPass) {
          delete next[currentEntry.word.id];
        } else {
          next[currentEntry.word.id] = true;
        }
        return next;
      });
    }

    if (currentIndex + 1 < practiceQueue.length) {
      setCurrentIndex(currentIndex + 1);
      setLiveTranscript('');
      setCurrentResult(null);
      setErrorMessage('');
      return;
    }

    if (setSrData) {
      const now = Date.now();
      setSrData(prev => {
        const next = { ...prev };
        sessionResults.forEach(r => {
          next[r.word.id] = {
            ...(next[r.word.id] || { interval: 0, ease: 2.5, step: 0 }),
            lastReviewDate: now
          };
        });
        return next;
      });
    }
    setPhase('results');
  };

  // --- AI MODE HANDLERS ---
  const handleStartAiRecording = async () => {
    if (isRecording || isWaitingForAI) return;
    setLiveTranscript('');
    setErrorMessage('');
    try {
      const session = await createPronunciationAssessmentSession({
        referenceText: '', // Free conversation
        onTranscript: setLiveTranscript,
        onError: setErrorMessage,
      });
      sessionRef.current = session;
      await session.start();
      setIsRecording(true);
    } catch (error) {
      setErrorMessage(error.message || 'Không thể bắt đầu ghi âm.');
      setIsRecording(false);
    }
  };

  const handleStopAiRecording = async () => {
    if (!sessionRef.current || !isRecording) return;
    try {
      const result = await sessionRef.current.stop();
      if (!result.transcript) {
        setErrorMessage('Không nghe rõ bạn nói gì. Hãy thử lại.');
        return;
      }
      
      const newHistory = [...aiChatHistory, {
        speaker: 'You',
        text: result.transcript,
        isUserTurn: true
      }];
      setAiChatHistory(newHistory);
      setLiveTranscript('');
      setIsWaitingForAI(true);
      
      // Call AI to get next line, mapping properties to standard roles
      const recentHistory = newHistory.slice(-4).map(msg => ({
        role: msg.isUserTurn ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));
      
      const reply = await chatWithNPC(recentHistory, settings.apiKey, settings.model);
      
      const nextNpcMessage = {
        speaker: aiChatHistory[0]?.speaker || 'AI',
        text: reply.text,
        emotion: reply.emotion || 'neutral',
        isUserTurn: false
      };
      
      setAiChatHistory(prev => [...prev, nextNpcMessage]);
      
      // Auto play next line
      setTimeout(() => {
        speakDialogueLine(nextNpcMessage);
      }, 500);
      
    } catch (error) {
      setErrorMessage(error.message || 'Lỗi khi nhận diện giọng nói hoặc gọi AI.');
    } finally {
      sessionRef.current = null;
      setIsRecording(false);
      setIsWaitingForAI(false);
    }
  };

  const handleEndAiChat = async () => {
    setPhase('ai_evaluating');
    try {
      const fullHistoryText = aiChatHistory.map(msg => `${msg.speaker}: ${msg.text}`).join('\n');
      const feedback = await evaluateSpeakingPractice(fullHistoryText, settings.apiKey, settings.model);
      setAiFeedback(feedback);
      
      // We can also trigger SRS logic here if needed, but since it's unscripted, 
      // we don't know exactly which words they used correctly unless we parse it. 
      // For now, we skip updating setSrData for AI mode.
      
      setPhase('ai_results');
    } catch (err) {
      setErrorMessage(err.message || 'Lỗi khi nhận xét. Vui lòng thử lại sau.');
      setPhase('setup'); // Fallback to setup or maybe a partial result
    }
  };

  const speakDialogueLine = (line, rate = 0.9) => {
    return new Promise(resolve => {
      if (!window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(line.text);
      const voice = getSelectedEnglishVoice(speakerVoiceMap[line.speaker] || settings?.speechVoiceURI);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = 'en-US';
      }
      utterance.rate = rate;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  };

  // --- RENDERING ---

  if (!activeTopicId || topicWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full p-xl text-center">
        <div className="w-24 h-24 mb-md rounded-full bg-surface-container-low flex items-center justify-center">
          <Mic size={48} className="text-primary" />
        </div>
        <h2 className="font-heading-2 text-heading-2 text-ink mb-sm">Chưa có từ vựng</h2>
        <p className="font-body-md text-body-md text-ink-muted max-w-md">
          Chủ đề này chưa có từ vựng nào. Hãy thêm từ vựng trước khi bắt đầu luyện nói.
        </p>
      </div>
    );
  }

  if (speakableWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full p-xl text-center">
        <div className="w-24 h-24 mb-md rounded-full bg-surface-container-low flex items-center justify-center">
          <Volume2 size={48} className="text-primary" />
        </div>
        <h2 className="font-heading-2 text-heading-2 text-ink mb-sm">Chưa có câu ví dụ</h2>
        <p className="font-body-md text-body-md text-ink-muted max-w-md">
          Trang Luyện nói dùng câu ví dụ của từng từ vựng. Hãy thêm câu ví dụ trong form từ vựng trước nhé.
        </p>
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div className="min-h-full flex items-center justify-center p-xl">
        <div className="bg-surface border border-hairline rounded-[16px] p-[40px] shadow-sm max-w-lg w-full flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-accent-pink/10 rounded-full flex items-center justify-center mb-xl shadow-inner border border-accent-pink/20">
            <Mic size={48} className="text-accent-pink" />
          </div>

          <h2 className="font-display-2 text-display-2 text-ink mb-sm tracking-tight">Luyện nói</h2>
          <p className="font-body-md text-body-md text-ink-muted mb-xxl">
            Chủ đề <span className="font-bold text-ink px-1">{currentTopic?.name}</span> hiện có {speakableWords.length} câu ví dụ có thể luyện nói.
          </p>
          
          {errorMessage && (
            <div className="w-full bg-error-container text-on-error-container border border-error/20 rounded-[12px] p-md mb-lg font-body-sm text-body-sm text-left">
              {errorMessage}
            </div>
          )}

          <div className="w-full text-left mb-lg bg-canvas-soft p-lg rounded-[12px] border border-hairline">
            <label className="block font-eyebrow text-eyebrow text-primary uppercase mb-sm tracking-wide">
              Chế độ luyện tập
            </label>
            <div className="flex bg-surface border border-hairline rounded-[8px] overflow-hidden mb-md">
              <button
                onClick={() => setPracticeMode('read')}
                className={`flex-1 py-md text-center font-button text-button transition-colors ${
                  practiceMode === 'read'
                    ? 'bg-primary text-on-primary'
                    : 'text-ink hover:bg-surface-container-low'
                }`}
              >
                Đọc câu mẫu
              </button>
              <button
                onClick={() => setPracticeMode('ai')}
                className={`flex-1 py-md text-center font-button text-button transition-colors ${
                  practiceMode === 'ai'
                    ? 'bg-primary text-on-primary'
                    : 'text-ink hover:bg-surface-container-low'
                }`}
              >
                Trò chuyện với AI
              </button>
            </div>

            {practiceMode === 'read' && (
              <>
                <label className="block font-eyebrow text-eyebrow text-primary uppercase mb-sm tracking-wide mt-md">
                  Số câu muốn luyện
                </label>
                <input
                  type="number"
                  min="1"
                  max={speakableWords.length}
                  value={wordCount}
                  onChange={event => setWordCount(parseInt(event.target.value, 10) || 1)}
                  className="w-full bg-surface border border-hairline rounded-[8px] p-sm font-title text-title text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
                />
              </>
            )}
            
            {practiceMode === 'ai' && (
              <p className="font-body-sm text-body-sm text-ink-muted">
                AI sẽ tạo tình huống ngẫu nhiên để bạn trò chuyện tự do. Ở cuối buổi, AI sẽ đóng vai gia sư và nhận xét phát âm, ngữ pháp của bạn.
              </p>
            )}
          </div>

          {!hasSpeechRecognition && (
            <div className="w-full bg-error-container text-on-error-container border border-error/20 rounded-[12px] p-md mb-lg text-left">
              <p className="font-body-sm text-body-sm">
                Trình duyệt hiện tại chưa hỗ trợ Speech Recognition. Hãy mở app bằng Chrome hoặc Edge và cấp quyền micro để luyện nói.
              </p>
              <button
                type="button"
                onClick={onOpenSettings}
                className="mt-sm inline-flex items-center gap-xs px-md py-xs bg-surface rounded-full text-primary font-button text-button border border-hairline hover:bg-surface-container-low transition-colors"
              >
                <Settings size={16} />
                Mở Settings
              </button>
            </div>
          )}

          <div className="flex gap-sm w-full">
            <button
              onClick={handleStartPractice}
              disabled={!hasSpeechRecognition}
              className="flex-1 bg-primary text-on-primary font-button text-button py-md rounded-full shadow-md hover:bg-primary-active hover:shadow-lg hover:-translate-y-0.5 transition-all active:translate-y-0 active:shadow-sm disabled:opacity-50 disabled:pointer-events-none"
            >
              Bắt đầu
            </button>
            {practiceMode === 'read' && topicMistakes.length > 0 && (
              <button
                onClick={() => {
                  if (!hasSpeechRecognition || topicMistakes.length === 0) return;
                  setPracticeQueue(shuffleWords(topicMistakes));
                  setCurrentIndex(0);
                  setLiveTranscript('');
                  setCurrentResult(null);
                  setSessionResults([]);
                  setErrorMessage('');
                  setPhase('playing');
                }}
                disabled={!hasSpeechRecognition}
                className="flex-1 bg-error-container text-on-error-container border border-error/20 font-button text-button py-md rounded-full shadow-sm hover:bg-error/20 hover:-translate-y-0.5 transition-all active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none"
              >
                Ôn lại {topicMistakes.length} câu sai
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // AI MODE PHASES
  if (phase === 'ai_loading') {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-xl">
        <Loader2 size={64} className="text-primary animate-spin mb-xl" />
        <h2 className="font-heading-2 text-heading-2 text-ink mb-sm">Đang tạo tình huống...</h2>
        <p className="font-body-md text-body-md text-ink-muted">AI đang chuẩn bị một kịch bản giao tiếp cho chủ đề {currentTopic?.name}.</p>
      </div>
    );
  }
  
  if (phase === 'ai_evaluating') {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-xl">
        <Loader2 size={64} className="text-primary animate-spin mb-xl" />
        <h2 className="font-heading-2 text-heading-2 text-ink mb-sm">Đang nhận xét...</h2>
        <p className="font-body-md text-body-md text-ink-muted">Gia sư AI đang phân tích đoạn hội thoại để tìm ra điểm yếu của bạn.</p>
      </div>
    );
  }
  
  if (phase === 'ai_playing') {
    const isUserTurn = aiChatHistory.length > 0 && !aiChatHistory[aiChatHistory.length - 1].isUserTurn;
    const lastNpcLine = aiChatHistory.length > 0 && !aiChatHistory[aiChatHistory.length - 1].isUserTurn ? aiChatHistory[aiChatHistory.length - 1] : null;

    return (
      <div className="min-h-full flex flex-col items-center p-lg md:p-xl">
        <div className="w-full max-w-3xl mb-lg">
          <div className="flex items-center gap-sm mb-md">
            <div className="px-md py-xs rounded-full bg-accent-pink/10 text-accent-pink font-button text-button flex items-center gap-xs">
              <MessageSquare size={16} /> Luyện nói với AI
            </div>
            <div className="flex-1 h-px bg-hairline" />
            <span className="font-eyebrow text-eyebrow text-ink-muted">Chat</span>
          </div>
        </div>

        {aiSituation && (
          <div className="w-full max-w-3xl bg-accent-purple/5 border border-accent-purple/20 rounded-[12px] p-md mb-lg text-center">
            <span className="font-body-md text-body-md text-ink">{aiSituation}</span>
          </div>
        )}

        <div className="w-full max-w-3xl bg-surface border border-hairline rounded-[16px] p-lg md:p-xl shadow-sm flex flex-col">
          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto w-full p-md space-y-md min-h-[320px] max-h-[450px] bg-canvas-soft border border-hairline rounded-[16px] mb-lg relative">
            {aiChatHistory.map((item, idx) => {
              const isUser = item.isUserTurn;
              const styles = getSpeakerStyles(item.speaker);

              if (isUser) {
                return (
                  <div key={idx} className="flex justify-end items-end gap-sm animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex flex-col items-end max-w-[70%]">
                      <span className="font-eyebrow text-[10px] text-ink-muted mb-1">You</span>
                      <div className="p-md rounded-[18px] rounded-tr-[4px] shadow-sm font-body-md text-body-md transition-colors bg-primary text-on-primary ring-2 ring-primary/30 border border-primary/20">
                        {item.text}
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div key={idx} className="flex justify-start items-start gap-sm animate-in slide-in-from-bottom-2 duration-300">
                    <div className={`relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border shadow-sm ${styles.bg} ${styles.border} overflow-hidden`}>
                      <span className={`font-bold text-sm ${styles.text}`}>{item.speaker?.[0]}</span>
                      <img 
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(item.speaker)}`} 
                        alt={item.speaker} 
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                    <div className="flex flex-col items-start max-w-[70%]">
                      <span className="font-eyebrow text-[10px] text-ink-muted mb-1">
                        {item.speaker} {item.emotion && EMOTION_EMOJIS[item.emotion.toLowerCase()] ? EMOTION_EMOJIS[item.emotion.toLowerCase()] : ''}
                      </span>
                      <div className="p-md rounded-[18px] rounded-tl-[4px] border shadow-sm font-body-md text-body-md transition-colors bg-surface border-primary/50 text-ink ring-2 ring-primary/10">
                        {item.text}
                        <button
                          onClick={() => speakDialogueLine(item)}
                          className="ml-xs inline-flex items-center justify-center align-middle p-1 rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Nghe lại"
                        >
                          <Volume2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
            })}
            
            {(isRecording || isWaitingForAI) && (
              <div className="flex justify-end items-end gap-sm animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col items-end max-w-[70%]">
                  <span className="font-eyebrow text-[10px] text-ink-muted mb-1">You</span>
                  <div className="p-md rounded-[18px] rounded-tr-[4px] shadow-sm font-body-md text-body-md transition-colors bg-primary/20 text-ink ring-1 ring-primary/30 border border-primary/20">
                    {isRecording ? (liveTranscript || 'Đang ghi âm...') : 'Đang suy nghĩ...'}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {errorMessage && (
            <div className="w-full bg-error-container text-on-error-container border border-error/20 rounded-[12px] p-md mb-md font-body-sm text-body-sm text-left">
              {errorMessage}
            </div>
          )}

          {/* Bottom Messenger-like Input/Mic Bar */}
          <div className="w-full bg-surface-container-low border border-hairline rounded-[24px] p-xs flex items-center gap-md shadow-sm">
            
            {/* NPC Voice reading buttons */}
            {lastNpcLine && (
              <div className="flex items-center gap-xs">
                <button
                  onClick={() => speakDialogueLine(lastNpcLine)}
                  className="p-sm bg-primary/10 hover:bg-primary/20 text-primary rounded-full transition-colors"
                  title="Nghe NPC đọc"
                >
                  <Volume2 size={20} />
                </button>
              </div>
            )}

            {/* Status / Transcript placeholder */}
            <div className="flex-1 min-w-0 bg-canvas-soft border border-hairline rounded-full px-md py-sm flex items-center justify-between text-body-sm text-ink-muted">
              {isRecording ? (
                <span className="text-error animate-pulse flex items-center gap-xs font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-error inline-block"></span>
                  Đang ghi âm...
                </span>
              ) : isWaitingForAI ? (
                <span className="truncate text-ink-faint">Chờ phản hồi từ AI...</span>
              ) : (
                <span className="truncate">Hãy bấm micro để trò chuyện</span>
              )}
            </div>

            {/* User Mic & Navigation buttons */}
            <div className="flex items-center gap-xs">
              <button
                type="button"
                onClick={isRecording ? handleStopAiRecording : handleStartAiRecording}
                disabled={isWaitingForAI}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 border shadow-sm ${
                  isRecording
                    ? 'bg-error text-on-error border-error animate-pulse'
                    : 'bg-primary text-on-primary border-primary hover:bg-primary-active'
                } disabled:opacity-50 disabled:pointer-events-none`}
              >
                {isRecording ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
              </button>
            </div>
          </div>
          
          <div className="mt-md flex justify-center">
            <button
              onClick={handleEndAiChat}
              disabled={isRecording || isWaitingForAI || aiChatHistory.length < 2}
              className="bg-surface-container-high text-on-surface rounded-full py-sm px-xl font-button text-button hover:bg-surface-container-highest transition-all shadow-sm border border-hairline disabled:opacity-50 disabled:pointer-events-none"
            >
              Kết thúc trò chuyện & Xem nhận xét
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  if (phase === 'ai_results') {
    return (
      <div className="min-h-full flex items-center justify-center p-lg md:p-xl">
        <div className="w-full max-w-4xl bg-surface border border-hairline rounded-[16px] p-lg md:p-xxl shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-lg mb-xl">
            <div>
              <h2 className="font-display-2 text-display-2 text-ink mb-xs">Nhận xét từ Gia sư AI</h2>
              <p className="font-body-md text-body-md text-ink-muted">
                Dựa trên cuộc trò chuyện tự do của bạn.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPhase('setup')}
              className="inline-flex items-center justify-center gap-xs bg-primary text-on-primary rounded-full py-sm px-xl font-button text-button hover:bg-primary-active transition-colors shadow-sm"
            >
              <RotateCcw size={18} />
              Luyện lại
            </button>
          </div>

          {aiFeedback && (
            <div className="flex flex-col gap-md">
              <div className="bg-canvas-soft border border-hairline rounded-[12px] p-lg">
                <h3 className="font-heading-3 text-heading-3 text-ink mb-sm">Đánh giá chung</h3>
                <p className="font-body-md text-body-md text-ink">{aiFeedback.feedback}</p>
              </div>
              
              {aiFeedback.weaknesses && aiFeedback.weaknesses.length > 0 && (
                <div className="bg-accent-orange/5 border border-accent-orange/20 rounded-[12px] p-lg">
                  <h3 className="font-heading-3 text-heading-3 text-accent-orange mb-sm flex items-center gap-xs">
                    <BookOpen size={20} /> Lỗi cần cải thiện
                  </h3>
                    <ul className="list-disc pl-lg space-y-xs">
                    {aiFeedback.weaknesses.map((weakness, i) => (
                      <li key={i} className="font-body-md text-body-md text-ink">{weakness}</li>
                    ))}
                  </ul>
                  <p className="font-body-sm text-body-sm text-ink-muted mt-md italic">
                    Lưu ý: Do không có câu mẫu để đối chiếu chính xác, hệ thống phân tích lỗi dựa trên ngữ pháp và các từ bạn phát âm sai (khiến máy nhận diện nhầm thành từ khác).
                  </p>
                </div>
              )}
              {aiFeedback.phonemesToPractice && aiFeedback.phonemesToPractice.length > 0 && (
                <div className="bg-accent-sky/5 border border-accent-sky/20 rounded-[12px] p-lg">
                  <h3 className="font-heading-3 text-heading-3 text-accent-sky mb-sm flex items-center gap-xs">
                    <Volume2 size={20} /> Luyện tập Phiên âm (IPA)
                  </h3>
                  <div className="flex flex-col gap-sm">
                    {aiFeedback.phonemesToPractice.map((p, i) => (
                      <div key={i} className="bg-surface border border-hairline rounded-[8px] p-md flex flex-col sm:flex-row sm:items-center gap-md justify-between">
                        <div>
                          <div className="font-heading-3 text-heading-3 text-ink mb-1">{p.phoneme}</div>
                          <p className="font-body-sm text-body-sm text-ink-muted">{p.reason}</p>
                        </div>
                        <a
                          href={`https://www.youtube.com/results?search_query=how+to+pronounce+english+phoneme+${encodeURIComponent(p.phoneme)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center gap-xs px-md py-xs bg-accent-sky/10 text-accent-sky hover:bg-accent-sky/20 rounded-full font-button text-button transition-colors"
                        >
                          <ExternalLink size={16} /> Xem hướng dẫn
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // READ MODE PHASES
  if (phase === 'playing' && currentWord) {
    const progress = ((currentIndex + 1) / practiceQueue.length) * 100;

    return (
      <div className="min-h-full flex flex-col items-center p-lg md:p-xl">
        <div className="w-full max-w-3xl mb-lg">
          <div className="flex justify-between font-eyebrow text-eyebrow text-ink-muted uppercase mb-xs tracking-wide">
            <span>Tiến độ</span>
            <span>{currentIndex + 1} / {practiceQueue.length}</span>
          </div>
          <div className="h-3 w-full bg-hairline rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="w-full max-w-3xl bg-surface border border-hairline rounded-[16px] p-lg md:p-xxl shadow-sm flex flex-col items-center">
          <div className="w-full text-center mb-xl">
            <div className="inline-flex items-center gap-xs px-md py-xs rounded-full bg-primary/10 text-primary font-button text-button mb-md">
              Câu ví dụ
            </div>
            <h2 className="font-heading-2 text-heading-2 text-ink mb-xs">{currentWord.word}</h2>
            {currentWord.phonetic && (
              <p className="font-mono text-body-md text-on-surface-variant mb-md">{currentWord.phonetic}</p>
            )}
            <p className="font-heading-2 text-heading-2 text-ink leading-relaxed bg-canvas-soft border border-hairline rounded-[12px] p-lg">
              {currentWord.example}
              <button
                onClick={() => speakEnglishText(currentWord.example, settings?.voice)}
                className="inline-flex items-center justify-center ml-sm align-middle p-1 rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                title="Nghe câu ví dụ"
              >
                <Volume2 size={28} />
              </button>
            </p>
          </div>

          <button
            type="button"
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            disabled={Boolean(currentResult)}
            className={`w-32 h-32 rounded-full flex items-center justify-center mb-lg shadow-md transition-all active:scale-95 border ${isRecording
                ? 'bg-error text-on-error border-error animate-pulse'
                : 'bg-primary text-on-primary border-primary hover:bg-primary-active'
              } disabled:opacity-50 disabled:pointer-events-none`}
            title={isRecording ? 'Dừng' : 'Ghi âm'}
          >
            {isRecording ? <Square size={48} fill="currentColor" /> : <Mic size={56} />}
          </button>

          <p className="font-button text-button text-on-surface-variant mb-xl">
            {isRecording ? 'Đang ghi âm...' : currentResult ? 'Đã chấm xong' : 'Bấm micro và đọc câu ví dụ'}
          </p>

          {errorMessage && (
            <div className="w-full bg-error-container text-on-error-container border border-error/20 rounded-[12px] p-md mb-lg font-body-sm text-body-sm">
              {errorMessage}
            </div>
          )}

          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-md mb-xl">
            <div className="bg-canvas-soft border border-hairline rounded-[12px] p-md">
              <div className="font-eyebrow text-eyebrow uppercase text-ink-muted mb-xs">Bạn đã đọc</div>
              <p className="font-body-md text-body-md text-ink min-h-[72px]">
                {liveTranscript || 'Transcript sẽ xuất hiện sau khi trình duyệt nhận dạng giọng nói.'}
              </p>
            </div>
            <div className="bg-canvas-soft border border-hairline rounded-[12px] p-md">
              <div className="font-eyebrow text-eyebrow uppercase text-ink-muted mb-xs">Kết quả</div>
              {currentResult ? (
                <div className="flex flex-col gap-xs">
                  <div className={`font-heading-3 text-heading-3 ${currentResult.isPass ? 'text-accent-green' : 'text-accent-orange'}`}>
                    {currentResult.isPass ? 'Đạt' : 'Cần luyện lại'}
                  </div>
                  <p className="font-body-sm text-body-sm text-ink-muted">
                    Similarity: {formatScore(currentResult.similarityScore)}%
                  </p>
                  <p className="font-body-sm text-body-sm text-ink-muted">
                    Accuracy {formatScore(currentResult.accuracyScore)} · Web Speech transcript matching
                  </p>
                </div>
              ) : (
                <p className="font-body-md text-body-md text-ink-muted min-h-[72px]">
                  Dừng ghi âm để xem điểm. Mặc định đạt khi độ khớp câu đọc từ {FALLBACK_SIMILARITY_THRESHOLD}% trở lên.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-sm w-full">
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRecording || !currentResult}
              className="flex-1 bg-surface-container-high text-on-surface rounded-full py-md px-lg font-button text-button hover:bg-surface-container-highest transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              Đọc lại
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={isRecording || !currentResult}
              className="flex-1 bg-primary text-on-primary rounded-full py-md px-lg font-button text-button hover:bg-primary-active transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {currentIndex + 1 < practiceQueue.length ? 'Câu tiếp theo' : 'Xem kết quả'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const passedCount = sessionResults.filter(result => result.isPass).length;
  const averageSimilarity = sessionResults.length
    ? Math.round(sessionResults.reduce((sum, result) => sum + (result.similarityScore || 0), 0) / sessionResults.length)
    : 0;

  return (
    <div className="min-h-full flex items-center justify-center p-lg md:p-xl">
      <div className="w-full max-w-4xl bg-surface border border-hairline rounded-[16px] p-lg md:p-xxl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-lg mb-xl">
          <div>
            <h2 className="font-display-2 text-display-2 text-ink mb-xs">Kết quả luyện nói</h2>
            <p className="font-body-md text-body-md text-ink-muted">
              Bạn đạt {passedCount}/{sessionResults.length} câu. Độ khớp trung bình: {averageSimilarity}%.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPhase('setup')}
            className="inline-flex items-center justify-center gap-xs bg-primary text-on-primary rounded-full py-sm px-xl font-button text-button hover:bg-primary-active transition-colors shadow-sm"
          >
            <RotateCcw size={18} />
            Luyện lại
          </button>
        </div>

        <div className="flex flex-col gap-md">
          {sessionResults.map((result, index) => (
            <div
              key={`${result.word.id}-${index}`}
              className={`p-md rounded-[12px] border ${result.isPass ? 'bg-accent-green/5 border-accent-green/25' : 'bg-accent-orange/5 border-accent-orange/25'}`}
            >
              <div className="flex items-start gap-md">
                <div className="mt-1">
                  {result.isPass ? (
                    <CheckCircle2 className="text-accent-green" />
                  ) : (
                    <XCircle className="text-accent-orange" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-heading-3 text-heading-3 text-ink">{result.word.word}</div>
                  <p className="font-body-md text-body-md text-ink mt-xs">{result.word.example}</p>
                  <p className="font-body-sm text-body-sm text-ink-muted mt-sm">
                    Bạn đọc: {result.transcript || '(Không nhận dạng được)'}
                  </p>
                  <p className="font-body-sm text-body-sm text-ink-muted mt-xs">
                    Similarity {formatScore(result.similarityScore)}% · Accuracy {formatScore(result.accuracyScore)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
