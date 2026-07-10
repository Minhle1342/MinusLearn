import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  CheckCircle2, XCircle, Volume2, Mic, Square, RotateCcw,
  ClipboardCheck, Headphones, BookOpen, MessageSquare, Loader2, ChevronRight
} from 'lucide-react';
import { generateExamContent } from '../../services/api';
import { speakEnglishText, getEnglishVoices, getSelectedEnglishVoice } from '../../utils/speech';
import {
  createPronunciationAssessmentSession,
  FALLBACK_SIMILARITY_THRESHOLD,
  hasSpeechRecognitionSupport,
} from '../../services/speechAssessment';

function shuffleArray(arr) {
  return [...arr].sort(() => 0.5 - Math.random());
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

export function ExamPage({ words, activeTopicId, topics, settings, setSrData, onOpenSettings }) {
  // ── Phase management ──
  const [phase, setPhase] = useState('setup'); // setup | loading | listening | speaking | reading | results
  const [examData, setExamData] = useState(null);
  const [error, setError] = useState('');

  // ── Setup state ──
  const [difficulty, setDifficulty] = useState('Trung bình'); // Dễ, Trung bình, Khó

  // ── Listening state ──
  const [listeningStep, setListeningStep] = useState('dialogue'); // dialogue | questions
  const [currentDialogueLine, setCurrentDialogueLine] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [listeningAnswers, setListeningAnswers] = useState([]);
  const [listeningSelectedOption, setListeningSelectedOption] = useState(null);
  const [currentListeningQ, setCurrentListeningQ] = useState(0);

  // ── Speaking state ──
  const [currentSpeakingLine, setCurrentSpeakingLine] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [speakingResult, setSpeakingResult] = useState(null);
  const [speakingResults, setSpeakingResults] = useState([]);
  const [speakingError, setSpeakingError] = useState('');
  const sessionRef = useRef(null);
  const chatEndRef = useRef(null);
  const [speakerVoiceMap, setSpeakerVoiceMap] = useState({});

  // ── Reading state ──
  const [currentReadingQ, setCurrentReadingQ] = useState(0);
  const [readingAnswers, setReadingAnswers] = useState([]);
  const [readingSelectedOption, setReadingSelectedOption] = useState(null);

  // ── Derived ──
  const selectedWords = useMemo(
    () => words.filter(w => w.topicId === activeTopicId),
    [words, activeTopicId]
  );
  
  const activeTopic = useMemo(
    () => topics.find(t => t.id === activeTopicId),
    [topics, activeTopicId]
  );

  // ── Cleanup speech session on unmount ──
  useEffect(() => () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
  }, []);

  // ── Auto-scroll speaking chat ──
  useEffect(() => {
    if (phase === 'speaking') {
      const el = document.getElementById('speaking-line-current');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentSpeakingLine, phase]);

  // ═══════════════════════════════════════
  //  SETUP PHASE
  // ═══════════════════════════════════════
  const handleStartExam = async () => {
    if (selectedWords.length === 0) return;
    setPhase('loading');
    setError('');

    try {
      const data = await generateExamContent(
        selectedWords.map(w => ({ word: w.word, meaning: w.meaning, example: w.example })),
        settings.apiKey,
        settings.model,
        difficulty
      );
      setExamData(data);

      // Build speaker→voice map for both listening and speaking sections
      const voices = getEnglishVoices();
      const listeningSpeakers = (data.listening?.dialogue || []).map(d => d.speaker);
      const speakingSpeakers = (data.speaking?.dialogue || [])
        .filter(d => !d.isUserTurn)
        .map(d => d.speaker);

      const npcSpeakers = [...new Set([...listeningSpeakers, ...speakingSpeakers])];
      
      const shuffledVoices = [...voices].sort(() => 0.5 - Math.random());
      const map = {};
      npcSpeakers.forEach((speaker, i) => {
        if (shuffledVoices.length > 0) {
          map[speaker] = shuffledVoices[i % shuffledVoices.length].voiceURI;
        }
      });
      setSpeakerVoiceMap(map);

      // Reset all sub-states
      setCurrentDialogueLine(0);
      setListeningStep('dialogue');
      setListeningAnswers([]);
      setListeningSelectedOption(null);
      setCurrentListeningQ(0);
      setCurrentSpeakingLine(0);
      setSpeakingResults([]);
      setSpeakingResult(null);
      setLiveTranscript('');
      setSpeakingError('');
      setCurrentReadingQ(0);
      setReadingAnswers([]);
      setReadingSelectedOption(null);

      setPhase('listening');
    } catch (err) {
      setError(err.message || 'Lỗi tạo bài kiểm tra');
      setPhase('setup');
    }
  };

  // ═══════════════════════════════════════
  //  LISTENING PHASE
  // ═══════════════════════════════════════
  const speakDialogueLine = (line, rate = 0.9) => {
    return new Promise(resolve => {
      if (!window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(line.text);
      const voice = getSelectedEnglishVoice(speakerVoiceMap[line.speaker] || settings.speechVoiceURI);
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

  const handlePlayDialogue = async (slow = false) => {
    if (!examData?.listening?.dialogue || isPlaying) return;
    setIsPlaying(true);
    const rate = slow ? 0.6 : 0.9;

    for (let i = 0; i < examData.listening.dialogue.length; i++) {
      setCurrentDialogueLine(i);
      await speakDialogueLine(examData.listening.dialogue[i], rate);
      // Small pause between lines
      await new Promise(r => setTimeout(r, 400));
    }
    setCurrentDialogueLine(examData.listening.dialogue.length);
    setIsPlaying(false);
  };

  const handleSelectListeningAnswer = (optionIndex) => {
    if (listeningSelectedOption !== null) return;
    setListeningSelectedOption(optionIndex);
    const q = examData.listening.questions[currentListeningQ];
    const isCorrect = optionIndex === q.correctIndex;
    const newAnswers = [...listeningAnswers, { question: q.question, isCorrect, selected: optionIndex }];
    setListeningAnswers(newAnswers);

    setTimeout(() => {
      setListeningSelectedOption(null);
      if (currentListeningQ + 1 < examData.listening.questions.length) {
        setCurrentListeningQ(currentListeningQ + 1);
      } else {
        // Move to speaking phase
        setPhase('speaking');
        // Auto-play first NPC line
        const firstLine = examData.speaking?.dialogue?.[0];
        if (firstLine && !firstLine.isUserTurn) {
          setTimeout(() => {
            speakDialogueLine(firstLine);
          }, 500);
        }
      }
    }, 1500);
  };

  // ═══════════════════════════════════════
  //  SPEAKING PHASE
  // ═══════════════════════════════════════
  const currentSpeakingData = examData?.speaking?.dialogue?.[currentSpeakingLine];

  const handleStartRecording = async () => {
    if (!currentSpeakingData || isRecording) return;
    setLiveTranscript('');
    setSpeakingResult(null);
    setSpeakingError('');

    try {
      const session = await createPronunciationAssessmentSession({
        referenceText: currentSpeakingData.text,
        onTranscript: setLiveTranscript,
        onError: setSpeakingError,
      });
      sessionRef.current = session;
      await session.start();
      setIsRecording(true);
    } catch (err) {
      setSpeakingError(err.message || 'Không thể bắt đầu ghi âm.');
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    if (!sessionRef.current || !isRecording) return;
    try {
      const result = await sessionRef.current.stop();
      setSpeakingResult(result);
      setLiveTranscript(result.transcript);
      setSpeakingResults(prev => [...prev, { line: currentSpeakingData, ...result }]);
    } catch (err) {
      setSpeakingError(err.message || 'Không thể dừng ghi âm.');
    } finally {
      sessionRef.current = null;
      setIsRecording(false);
    }
  };

  const handleRetrySpeaking = () => {
    setSpeakingResults(prev => {
      if (!prev.length) return prev;
      return prev.slice(0, -1);
    });
    setLiveTranscript('');
    setSpeakingResult(null);
    setSpeakingError('');
  };

  const handleNextSpeakingLine = () => {
    const dialogue = examData.speaking.dialogue;
    if (currentSpeakingLine + 1 < dialogue.length) {
      const nextIndex = currentSpeakingLine + 1;
      setCurrentSpeakingLine(nextIndex);
      setLiveTranscript('');
      setSpeakingResult(null);
      setSpeakingError('');

      const nextLine = dialogue[nextIndex];
      if (nextLine && !nextLine.isUserTurn) {
        setTimeout(() => speakDialogueLine(nextLine), 300);
      }
    } else {
      // Move to reading phase
      setPhase('reading');
    }
  };

  // ═══════════════════════════════════════
  //  READING PHASE
  // ═══════════════════════════════════════
  const handleSelectReadingAnswer = (optionIndex) => {
    if (readingSelectedOption !== null) return;
    setReadingSelectedOption(optionIndex);
    const q = examData.reading[currentReadingQ];
    const isCorrect = optionIndex === q.correctIndex;
    const newAnswers = [...readingAnswers, { word: q.word, meaning: q.meaning, isCorrect, selected: optionIndex }];
    setReadingAnswers(newAnswers);

    setTimeout(() => {
      setReadingSelectedOption(null);
      if (currentReadingQ + 1 < examData.reading.length) {
        setCurrentReadingQ(currentReadingQ + 1);
      } else {
        // Update srData
        if (setSrData) {
          const now = Date.now();
          setSrData(prev => {
            const next = { ...prev };
            selectedWords.forEach(w => {
              next[w.id] = {
                ...(next[w.id] || { interval: 0, ease: 2.5, step: 0 }),
                lastReviewDate: now
              };
            });
            return next;
          });
        }
        setPhase('results');
      }
    }, 1500);
  };

  // ═══════════════════════════════════════
  //  RESULTS COMPUTATION
  // ═══════════════════════════════════════
  const listeningScore = listeningAnswers.length > 0
    ? Math.round((listeningAnswers.filter(a => a.isCorrect).length / listeningAnswers.length) * 100)
    : 0;

  const speakingScore = speakingResults.length > 0
    ? Math.round(speakingResults.reduce((s, r) => s + (r.similarityScore || 0), 0) / speakingResults.length)
    : 0;

  const readingScore = readingAnswers.length > 0
    ? Math.round((readingAnswers.filter(a => a.isCorrect).length / readingAnswers.length) * 100)
    : 0;

  const totalScore = Math.round((listeningScore + speakingScore + readingScore) / 3);

  // ═══════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════

  // ── SETUP ──
  if (phase === 'setup') {
    return (
      <div className="min-h-full flex items-center justify-center p-xl">
        <div className="bg-surface border border-hairline rounded-[16px] p-[40px] shadow-sm max-w-lg w-full flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-accent-purple/10 rounded-full flex items-center justify-center mb-xl shadow-inner border border-accent-purple/20">
            <ClipboardCheck size={48} className="text-accent-purple" />
          </div>

          <h2 className="font-display-2 text-display-2 text-ink mb-sm tracking-tight">Kiểm tra tổng hợp</h2>
          <p className="font-body-md text-body-md text-ink-muted mb-xl">
            Chọn chủ đề bạn muốn kiểm tra. Gemini sẽ tạo bài kiểm tra 3 phần: Nghe, Nói, Đọc-hiểu.
          </p>

          {error && (
            <div className="w-full bg-error-container text-on-error-container border border-error/20 rounded-[12px] p-md mb-lg font-body-sm text-body-sm text-left">
              {error}
            </div>
          )}

          <div className="w-full text-left mb-xl bg-canvas-soft p-lg rounded-[12px] border border-hairline">
            <label className="block font-eyebrow text-eyebrow text-primary uppercase mb-sm tracking-wide">
              Mức độ kiểm tra
            </label>
            <div className="flex bg-surface border border-hairline rounded-[8px] overflow-hidden">
              {['Dễ', 'Trung bình', 'Khó'].map(level => (
                <button
                  key={level}
                  onClick={() => setDifficulty(level)}
                  className={`flex-1 py-md text-center font-button text-button transition-colors ${
                    difficulty === level
                      ? 'bg-primary text-on-primary'
                      : 'text-ink hover:bg-surface-container-low'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full text-left mb-lg font-body-sm text-body-sm text-ink-muted bg-canvas-soft p-md rounded-[8px] border border-hairline">
            Chủ đề hiện tại: <strong className="text-ink">{activeTopic?.name || 'Chưa chọn'}</strong><br/>
            Số từ vựng kiểm tra: <strong className="text-ink">{selectedWords.length}</strong>
          </div>

          <button
            onClick={handleStartExam}
            disabled={selectedWords.length === 0}
            className="w-full bg-primary text-on-primary font-button text-button py-md rounded-full shadow-md hover:bg-primary-active hover:shadow-lg hover:-translate-y-0.5 transition-all active:translate-y-0 active:shadow-sm disabled:opacity-50 disabled:pointer-events-none"
          >
            Bắt đầu kiểm tra
          </button>
        </div>
      </div>
    );
  }

  // ── LOADING ──
  if (phase === 'loading') {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-xl">
        <Loader2 size={64} className="text-primary animate-spin mb-xl" />
        <h2 className="font-heading-2 text-heading-2 text-ink mb-sm">Đang tạo bài kiểm tra...</h2>
        <p className="font-body-md text-body-md text-ink-muted">Gemini đang soạn đề kiểm tra cho {selectedWords.length} từ vựng</p>
      </div>
    );
  }

  // ── LISTENING ──
  if (phase === 'listening') {
    const dialogue = examData.listening.dialogue;

    return (
      <div className="min-h-full flex flex-col items-center p-lg md:p-xl">
        {/* Section header */}
        <div className="w-full max-w-3xl mb-lg">
          <div className="flex items-center gap-sm mb-md">
            <div className="px-md py-xs rounded-full bg-accent-sky/10 text-accent-sky font-button text-button flex items-center gap-xs">
              <Headphones size={16} /> Phần 1: Kiểm tra Nghe
            </div>
            <div className="flex-1 h-px bg-hairline" />
            <span className="font-eyebrow text-eyebrow text-ink-muted">1/3</span>
          </div>
        </div>

        <div className="w-full max-w-3xl bg-surface border border-hairline rounded-[16px] p-lg md:p-xxl shadow-sm">
          {listeningStep === 'dialogue' ? (
            <>
              <h3 className="font-heading-2 text-heading-2 text-ink mb-md">Nghe đoạn hội thoại</h3>
              <p className="font-body-md text-body-md text-ink-muted mb-xl">
                Bấm nút phát để nghe hội thoại, sau đó trả lời các câu hỏi.
              </p>

              {/* Dialogue lines */}
              <div className="flex flex-col gap-md mb-xl max-h-[360px] overflow-y-auto">
                {dialogue.map((line, i) => {
                  const styles = getSpeakerStyles(line.speaker);
                  return (
                    <div
                      key={i}
                      className={`flex gap-md p-md rounded-[12px] border transition-all ${
                        i === currentDialogueLine && isPlaying
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : i < currentDialogueLine
                            ? 'border-hairline bg-canvas-soft'
                            : 'border-hairline/50 opacity-60'
                      }`}
                    >
                      <div className={`relative w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2 shadow-sm ${styles.bg} ${styles.border} overflow-hidden`}>
                        <span className={`font-bold text-lg ${styles.text}`}>{line.speaker?.[0]}</span>
                        <img 
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(line.speaker)}`} 
                          alt={line.speaker} 
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </div>
                      <div>
                        <div className="font-title text-title text-ink mb-xs">{line.speaker}</div>
                        <div className="font-body-md text-body-md text-ink">{line.text}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Controls */}
              <div className="flex flex-col sm:flex-row gap-sm">
                <button
                  onClick={() => handlePlayDialogue(false)}
                  disabled={isPlaying}
                  className="flex-1 bg-primary text-on-primary font-button text-button py-md rounded-full shadow-md hover:bg-primary-active transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-xs"
                >
                  <Volume2 size={18} /> Phát hội thoại
                </button>
                <button
                  onClick={() => handlePlayDialogue(true)}
                  disabled={isPlaying}
                  className="flex-1 bg-surface-container-high text-on-surface font-button text-button py-md rounded-full shadow-sm hover:bg-surface-container-highest transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-xs"
                >
                  <Volume2 size={18} /> Đọc chậm
                </button>
                <button
                  onClick={() => setListeningStep('questions')}
                  disabled={isPlaying}
                  className="flex-1 bg-accent-green text-surface font-button text-button py-md rounded-full shadow-md hover:bg-accent-green/90 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-xs"
                >
                  Trả lời câu hỏi <ChevronRight size={18} />
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-heading-2 text-heading-2 text-ink mb-md">Câu hỏi kiểm tra nghe</h3>
              <div className="flex justify-between font-eyebrow text-eyebrow text-ink-muted uppercase mb-sm">
                <span>Câu hỏi</span>
                <span>{currentListeningQ + 1} / {examData.listening.questions.length}</span>
              </div>
              <div className="h-2 w-full bg-hairline rounded-full overflow-hidden mb-xl">
                <div className="h-full bg-accent-sky transition-all duration-500" style={{ width: `${((currentListeningQ) / examData.listening.questions.length) * 100}%` }} />
              </div>

              <div className="w-full bg-canvas-soft border-2 border-hairline rounded-[12px] p-lg font-heading-3 text-heading-3 text-ink text-center mb-xl">
                {examData.listening.questions[currentListeningQ].question}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md mb-lg">
                {examData.listening.questions[currentListeningQ].options.map((opt, i) => {
                  const isSelected = listeningSelectedOption === i;
                  const isCorrectAnswer = i === examData.listening.questions[currentListeningQ].correctIndex;

                  let borderClass = "border-hairline hover:border-primary hover:bg-primary/5";
                  let bgClass = "bg-surface";
                  let textClass = "text-ink";

                  if (listeningSelectedOption !== null) {
                    if (isCorrectAnswer) {
                      borderClass = "border-accent-green"; bgClass = "bg-accent-green/10"; textClass = "text-accent-green";
                    } else if (isSelected) {
                      borderClass = "border-accent-orange"; bgClass = "bg-accent-orange/10"; textClass = "text-accent-orange";
                    } else {
                      borderClass = "border-hairline opacity-50";
                    }
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => handleSelectListeningAnswer(i)}
                      disabled={listeningSelectedOption !== null}
                      className={`w-full border-2 rounded-[12px] p-md font-title text-title transition-colors shadow-sm text-left flex items-center ${borderClass} ${bgClass}`}
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mr-md flex-shrink-0 ${
                        listeningSelectedOption !== null && isCorrectAnswer ? 'bg-accent-green text-surface' :
                        listeningSelectedOption !== null && isSelected ? 'bg-accent-orange text-surface' :
                        'bg-surface-container-low text-primary'
                      }`}>
                        {['A', 'B', 'C', 'D'][i]}
                      </span>
                      <span className={textClass}>{opt}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── SPEAKING ──
  if (phase === 'speaking') {
    const dialogue = examData.speaking.dialogue;
    const line = currentSpeakingData;
    const speakingProgress = ((currentSpeakingLine + 1) / dialogue.length) * 100;

    return (
      <div className="min-h-full flex flex-col items-center p-lg md:p-xl">
        <div className="w-full max-w-3xl mb-lg">
          <div className="flex items-center gap-sm mb-md">
            <div className="px-md py-xs rounded-full bg-accent-pink/10 text-accent-pink font-button text-button flex items-center gap-xs">
              <MessageSquare size={16} /> Phần 2: Kiểm tra Nói
            </div>
            <div className="flex-1 h-px bg-hairline" />
            <span className="font-eyebrow text-eyebrow text-ink-muted">2/3</span>
          </div>
          <div className="h-3 w-full bg-hairline rounded-full overflow-hidden">
            <div className="h-full bg-accent-pink transition-all duration-500" style={{ width: `${speakingProgress}%` }} />
          </div>
        </div>

        {examData.speaking.situation && (
          <div className="w-full max-w-3xl bg-accent-purple/5 border border-accent-purple/20 rounded-[12px] p-md mb-lg text-center">
            <span className="font-body-md text-body-md text-ink">{examData.speaking.situation}</span>
          </div>
        )}

        <div className="w-full max-w-3xl bg-surface border border-hairline rounded-[16px] p-lg md:p-xl shadow-sm flex flex-col">
          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto w-full p-md space-y-md min-h-[320px] max-h-[450px] bg-canvas-soft border border-hairline rounded-[16px] mb-lg relative">
            {dialogue.map((item, idx) => {
              const isUser = item.isUserTurn;
              const isCurrent = idx === currentSpeakingLine;
              const isFuture = idx > currentSpeakingLine;
              const styles = getSpeakerStyles(item.speaker);

              if (isUser) {
                return (
                  <div id={isCurrent ? 'speaking-line-current' : undefined} key={idx} className={`flex justify-end items-end gap-sm animate-in slide-in-from-bottom-2 duration-300 ${isFuture ? 'opacity-40 grayscale' : ''}`}>
                    <div className="flex flex-col items-end max-w-[70%]">
                      <span className="font-eyebrow text-[10px] text-ink-muted mb-1">You</span>
                      <div className={`p-md rounded-[18px] rounded-tr-[4px] shadow-sm font-body-md text-body-md transition-colors ${
                        isCurrent 
                          ? 'bg-primary text-on-primary ring-2 ring-primary/30 border border-primary/20' 
                          : 'bg-primary/80 text-on-primary opacity-80'
                      }`}>
                        {item.text}
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div id={isCurrent ? 'speaking-line-current' : undefined} key={idx} className={`flex justify-start items-start gap-sm animate-in slide-in-from-bottom-2 duration-300 ${isFuture ? 'opacity-40 grayscale' : ''}`}>
                    <div className={`relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border shadow-sm ${styles.bg} ${styles.border} overflow-hidden`}>
                      <span className={`font-bold text-sm ${styles.text}`}>{item.speaker?.[0]}</span>
                      <img 
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(item.speaker)}`} 
                        alt={item.speaker} 
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="flex flex-col items-start max-w-[70%]">
                      <span className="font-eyebrow text-[10px] text-ink-muted mb-1">{item.speaker}</span>
                      <div className={`p-md rounded-[18px] rounded-tl-[4px] border shadow-sm font-body-md text-body-md transition-colors ${
                        isCurrent 
                          ? 'bg-surface border-primary/50 text-ink ring-2 ring-primary/10' 
                          : 'bg-surface border-hairline text-ink'
                      }`}>
                        {item.text}
                        {!isCurrent && !isFuture && (
                          <button
                            onClick={() => speakDialogueLine(item)}
                            className="ml-xs inline-flex items-center justify-center align-middle p-1 rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Nghe lại"
                          >
                            <Volume2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Bottom Messenger-like Input/Mic Bar */}
          <div className="w-full bg-surface-container-low border border-hairline rounded-[24px] p-xs flex items-center gap-md shadow-sm">
            
            {/* NPC Voice reading buttons */}
            {!line?.isUserTurn && (
              <div className="flex items-center gap-xs">
                <button
                  onClick={() => speakDialogueLine(line)}
                  className="p-sm bg-primary/10 hover:bg-primary/20 text-primary rounded-full transition-colors"
                  title="Nghe NPC đọc"
                >
                  <Volume2 size={20} />
                </button>
                <button
                  onClick={() => speakDialogueLine(line, 0.6)}
                  className="px-md py-sm bg-surface-container-high hover:bg-surface-container-highest text-ink font-button text-sm rounded-full transition-colors border border-hairline"
                >
                  Đọc chậm
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
              ) : speakingResult ? (
                <span className="truncate font-medium text-ink">
                  Similarity: <strong className={speakingResult.isPass ? 'text-accent-green' : 'text-accent-orange'}>{Math.round(speakingResult.similarityScore || 0)}%</strong>
                </span>
              ) : line?.isUserTurn ? (
                <span className="truncate">Hãy bấm micro để đọc: "{line?.text}"</span>
              ) : (
                <span className="truncate text-ink-faint">Đang nghe {line?.speaker}...</span>
              )}

              {speakingResult && (
                <span className={`px-sm py-[2px] rounded-full text-[10px] font-bold ${
                  speakingResult.isPass ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-orange/20 text-accent-orange'
                }`}>
                  {speakingResult.isPass ? 'ĐẠT ✓' : 'LẠI'}
                </span>
              )}
            </div>

            {/* User Mic & Navigation buttons */}
            <div className="flex items-center gap-xs">
              {line?.isUserTurn && (
                <>
                  <button
                    type="button"
                    onClick={isRecording ? handleStopRecording : handleStartRecording}
                    disabled={Boolean(speakingResult)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 border shadow-sm ${
                      isRecording
                        ? 'bg-error text-on-error border-error animate-pulse'
                        : 'bg-primary text-on-primary border-primary hover:bg-primary-active'
                    } disabled:opacity-50 disabled:pointer-events-none`}
                  >
                    {isRecording ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
                  </button>

                  {speakingResult && (
                    <button
                      onClick={handleRetrySpeaking}
                      className="p-sm bg-surface-container-high hover:bg-surface-container-highest rounded-full text-ink transition-colors border border-hairline"
                      title="Đọc lại"
                    >
                      <RotateCcw size={16} />
                    </button>
                  )}
                </>
              )}

              <button
                onClick={handleNextSpeakingLine}
                disabled={line?.isUserTurn && !speakingResult}
                className="p-sm bg-primary text-on-primary rounded-full hover:bg-primary-active disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-sm flex items-center justify-center"
                title={currentSpeakingLine + 1 < dialogue.length ? 'Tin nhắn tiếp theo' : 'Hoàn thành phần Nói'}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          {speakingError && (
            <div className="w-full bg-error-container text-on-error-container rounded-[12px] p-md mt-md font-body-sm text-body-sm text-left">
              {speakingError}
            </div>
          )}

          {(liveTranscript || (speakingResult && speakingResult.transcript)) && (
            <div className="w-full bg-canvas-soft border border-hairline rounded-[12px] p-md mt-md text-left">
              <span className="font-eyebrow text-[10px] text-ink-muted uppercase block mb-1">Kết quả nhận diện</span>
              <p className="font-body-md text-body-md text-ink">
                {liveTranscript || speakingResult?.transcript}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── READING ──
  if (phase === 'reading') {
    const q = examData.reading[currentReadingQ];
    const exampleWithBlank = (q.newExample || '').replace(
      new RegExp(`\\b${q.word}\\b`, 'gi'),
      '____'
    );
    const readingProgress = ((currentReadingQ + 1) / examData.reading.length) * 100;

    return (
      <div className="min-h-full flex flex-col items-center p-lg md:p-xl">
        <div className="w-full max-w-3xl mb-lg">
          <div className="flex items-center gap-sm mb-md">
            <div className="px-md py-xs rounded-full bg-accent-teal/10 text-accent-teal font-button text-button flex items-center gap-xs">
              <BookOpen size={16} /> Phần 3: Đọc - hiểu
            </div>
            <div className="flex-1 h-px bg-hairline" />
            <span className="font-eyebrow text-eyebrow text-ink-muted">3/3</span>
          </div>
          <div className="flex justify-between font-eyebrow text-eyebrow text-ink-muted uppercase mb-xs">
            <span>Tiến độ</span>
            <span>{currentReadingQ + 1} / {examData.reading.length}</span>
          </div>
          <div className="h-3 w-full bg-hairline rounded-full overflow-hidden">
            <div className="h-full bg-accent-teal transition-all duration-500" style={{ width: `${readingProgress}%` }} />
          </div>
        </div>

        <div className="w-full max-w-3xl bg-surface border border-hairline rounded-[16px] p-lg md:p-xxl shadow-sm flex flex-col items-center">
          <p className="font-title text-title text-ink-muted mb-lg text-center">
            Chọn từ thích hợp để điền vào chỗ trống
          </p>

          <div className="w-full bg-canvas-soft border-2 border-hairline rounded-[12px] p-lg font-heading-2 text-heading-2 text-ink text-center mb-xl shadow-inner">
            {exampleWithBlank || '____'}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md w-full mb-lg">
            {q.options.map((opt, i) => {
              const isSelected = readingSelectedOption === i;
              const isCorrectAnswer = i === q.correctIndex;

              let borderClass = "border-hairline hover:border-primary hover:bg-primary/5";
              let bgClass = "bg-surface";
              let textClass = "text-ink";
              let badgeClass = "bg-surface-container-low text-primary";

              if (readingSelectedOption !== null) {
                if (isCorrectAnswer) {
                  borderClass = "border-accent-green"; bgClass = "bg-accent-green/10"; textClass = "text-accent-green"; badgeClass = "bg-accent-green text-surface";
                } else if (isSelected) {
                  borderClass = "border-accent-orange"; bgClass = "bg-accent-orange/10"; textClass = "text-accent-orange"; badgeClass = "bg-accent-orange text-surface";
                } else {
                  borderClass = "border-hairline opacity-50"; badgeClass = "bg-surface-container-low text-ink-muted";
                }
              }

              // Find meaning for this option
              const optMeaning = examData.reading.find(r => r.word.toLowerCase() === opt.toLowerCase())?.meaning || '';

              return (
                <button
                  key={i}
                  onClick={() => handleSelectReadingAnswer(i)}
                  disabled={readingSelectedOption !== null}
                  className={`w-full border-2 rounded-[12px] p-md font-title text-title transition-colors shadow-sm text-left flex flex-col ${borderClass} ${bgClass}`}
                >
                  <div className="flex items-center">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mr-md flex-shrink-0 shadow-sm ${badgeClass}`}>
                      {['A', 'B', 'C', 'D'][i]}
                    </span>
                    <span className={textClass}>{opt}</span>
                  </div>
                  {readingSelectedOption !== null && (isCorrectAnswer || isSelected) && optMeaning && (
                    <div className={`mt-sm ml-[48px] text-body-sm font-body-sm ${textClass}`}>
                      {optMeaning}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── RESULTS ──
  return (
    <div className="min-h-full flex items-center justify-center p-lg md:p-xl">
      <div className="w-full max-w-4xl bg-surface border border-hairline rounded-[16px] p-lg md:p-xxl shadow-sm">
        <div className="text-center mb-xxl">
          <div className="w-24 h-24 bg-accent-green/10 rounded-full flex items-center justify-center mx-auto mb-lg shadow-inner border border-accent-green/20">
            <CheckCircle2 size={48} className="text-accent-green" />
          </div>
          <h2 className="font-display-2 text-display-2 text-ink mb-sm">Kết quả kiểm tra</h2>
          <p className="font-body-md text-body-md text-ink-muted">
            Điểm tổng hợp: <strong className="text-ink text-[1.3em]">{totalScore}%</strong>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-lg mb-xxl">
          {/* Listening score */}
          <div className="bg-accent-sky/5 border border-accent-sky/20 rounded-[16px] p-xl text-center">
            <Headphones size={32} className="text-accent-sky mx-auto mb-md" />
            <div className="font-display-1 text-display-1 text-accent-sky mb-xs">{listeningScore}%</div>
            <div className="font-eyebrow text-eyebrow text-ink-muted uppercase">Kiểm tra Nghe</div>
            <div className="font-body-sm text-body-sm text-ink-muted mt-sm">
              {listeningAnswers.filter(a => a.isCorrect).length}/{listeningAnswers.length} câu đúng
            </div>
          </div>

          {/* Speaking score */}
          <div className="bg-accent-pink/5 border border-accent-pink/20 rounded-[16px] p-xl text-center">
            <Mic size={32} className="text-accent-pink mx-auto mb-md" />
            <div className="font-display-1 text-display-1 text-accent-pink mb-xs">{speakingScore}%</div>
            <div className="font-eyebrow text-eyebrow text-ink-muted uppercase">Kiểm tra Nói</div>
            <div className="font-body-sm text-body-sm text-ink-muted mt-sm">
              {speakingResults.filter(r => r.isPass).length}/{speakingResults.length} lượt đạt
            </div>
          </div>

          {/* Reading score */}
          <div className="bg-accent-teal/5 border border-accent-teal/20 rounded-[16px] p-xl text-center">
            <BookOpen size={32} className="text-accent-teal mx-auto mb-md" />
            <div className="font-display-1 text-display-1 text-accent-teal mb-xs">{readingScore}%</div>
            <div className="font-eyebrow text-eyebrow text-ink-muted uppercase">Đọc - hiểu</div>
            <div className="font-body-sm text-body-sm text-ink-muted mt-sm">
              {readingAnswers.filter(a => a.isCorrect).length}/{readingAnswers.length} câu đúng
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => { setPhase('setup'); setSelectedTopicIds([]); }}
            className="bg-primary text-on-primary rounded-full py-md px-xxl font-button text-button hover:bg-primary-active transition-all shadow-sm flex items-center gap-xs"
          >
            <RotateCcw size={18} /> Kiểm tra lại
          </button>
        </div>
      </div>
    </div>
  );
}
