import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  CheckCircle2, XCircle, Volume2, Mic, Square, RotateCcw,
  ClipboardCheck, Headphones, BookOpen, MessageSquare, Loader2, ChevronRight, ChevronLeft, Lightbulb,
  PenLine, Clock3, FileText, AlertTriangle, Trophy
} from 'lucide-react';
import {
  evaluateExamWritingSubmission,
  generateExamContent,
  generateExamWritingContent,
} from '../../services/api';
import { speakEnglishText, getEnglishVoices, getSelectedEnglishVoice } from '../../utils/speech';
import {
  createPronunciationAssessmentSession,
  FALLBACK_SIMILARITY_THRESHOLD,
  hasSpeechRecognitionSupport,
} from '../../services/speechAssessment';
import { WritingVisual } from './WritingVisual';
import { saveExamResult, getExamLeaderboard, incrementReviewCount } from '../../services/examHistoryService';
import { deleteExamWritingDraft, getExamWritingDraft, saveExamWritingDraft } from '../../services/examDraftService';
import {
  EXAM_WRITING_TASK1_SECONDS,
  EXAM_WRITING_TASKS,
  EXAM_WRITING_TOTAL_SECONDS,
  countWords,
  formatWritingTime,
} from '../../utils/examWriting';

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
  const [leaderboard, setLeaderboard] = useState([]);
  const [retakeRecordId, setRetakeRecordId] = useState(null);
  const [hasPlayedDialogue, setHasPlayedDialogue] = useState(false);
  const [showSetupLeaderboard, setShowSetupLeaderboard] = useState(false);
  const [setupLeaderboard, setSetupLeaderboard] = useState([]);
  const [setupLeaderboardTab, setSetupLeaderboardTab] = useState('Dễ');
  const hasSavedResult = useRef(false);

  // ── Setup state ──
  const [difficulty, setDifficulty] = useState('Trung bình'); // Dễ, Trung bình, Khó
  const [includeWritingTest, setIncludeWritingTest] = useState(true);

  // ── Listening state ──
  const [listeningStep, setListeningStep] = useState('dialogue'); // dialogue | questions
  const [currentDialogueLine, setCurrentDialogueLine] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [listeningAnswers, setListeningAnswers] = useState([]);
  const [listeningSelectedOption, setListeningSelectedOption] = useState(null);
  const [currentListeningQ, setCurrentListeningQ] = useState(0);
  const [showDialogue, setShowDialogue] = useState(false);

  // ── Speaking state ──
  const [currentSpeakingLine, setCurrentSpeakingLine] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [speakingResult, setSpeakingResult] = useState(null);
  const [speakingResults, setSpeakingResults] = useState([]);
  const [speakingError, setSpeakingError] = useState('');
  const sessionRef = useRef(null);
  const chatEndRef = useRef(null);
  const writingDraftRef = useRef(null);
  const [speakerVoiceMap, setSpeakerVoiceMap] = useState({});

  // ── Reading state ──
  const [currentReadingQ, setCurrentReadingQ] = useState(0);
  const [readingAnswers, setReadingAnswers] = useState([]);
  const [readingSelectedOption, setReadingSelectedOption] = useState(null);
  const [readingInputValue, setReadingInputValue] = useState('');
  const [readingInputSubmitted, setReadingInputSubmitted] = useState(false);
  const [readingInputIsCorrect, setReadingInputIsCorrect] = useState(false);
  const [showReadingHint, setShowReadingHint] = useState(false);

  // ── Writing state ──
  const [writingTaskIndex, setWritingTaskIndex] = useState(0);
  const [writingAnswers, setWritingAnswers] = useState(['', '']);
  const [writingEvaluation, setWritingEvaluation] = useState(null);
  const [writingTimeLeft, setWritingTimeLeft] = useState(EXAM_WRITING_TOTAL_SECONDS);
  const [isWritingLocked, setIsWritingLocked] = useState(false);
  const [isEvaluatingWriting, setIsEvaluatingWriting] = useState(false);
  const [writingSubmitError, setWritingSubmitError] = useState('');

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

  // ── Restore an interrupted Writing phase ──
  useEffect(() => {
    let cancelled = false;
    getExamWritingDraft().then(draft => {
      if (!draft || cancelled) return;
      if (!draft?.examData?.writing?.tasks || !Array.isArray(draft.writingAnswers)) return;

      setExamData(draft.examData);
      setDifficulty(draft.difficulty || 'Trung bình');
      setIncludeWritingTest(true);
      setListeningAnswers(draft.listeningAnswers || []);
      setSpeakingResults(draft.speakingResults || []);
      setReadingAnswers(draft.readingAnswers || []);
      setWritingTaskIndex(draft.writingTaskIndex || 0);
      setWritingAnswers([
        draft.writingAnswers[0] || '',
        draft.writingAnswers[1] || '',
      ]);
      setWritingTimeLeft(Math.max(0, draft.writingTimeLeft || 0));
      setIsWritingLocked(Boolean(draft.isWritingLocked) || (draft.writingTimeLeft || 0) <= 0);
      setWritingSubmitError('');
      setPhase('writing');
    }).catch(error => {
      console.error('Không thể tải draft bài thi:', error);
      deleteExamWritingDraft().catch(() => {});
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getExamLeaderboard(setupLeaderboardTab, activeTopicId)
      .then(items => { if (!cancelled) setSetupLeaderboard(items); })
      .catch(error => console.error('Không thể tải bảng xếp hạng:', error));
    return () => { cancelled = true; };
  }, [setupLeaderboardTab, activeTopicId]);

  // ── Writing timer ──
  useEffect(() => {
    if (phase !== 'writing' || isWritingLocked) return undefined;
    const timer = setInterval(() => {
      setWritingTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, isWritingLocked]);

  useEffect(() => {
    if (phase !== 'writing') return;
    if (writingTimeLeft <= EXAM_WRITING_TASK1_SECONDS && writingTaskIndex === 0) {
      setWritingTaskIndex(1);
    }
    if (writingTimeLeft <= 0 && !isWritingLocked) {
      setIsWritingLocked(true);
    }
  }, [phase, writingTimeLeft, writingTaskIndex, isWritingLocked]);

  useEffect(() => {
    if (phase !== 'writing') return;
    writingDraftRef.current = {
      savedAt: Date.now(),
      phase,
      examData,
      difficulty,
      includeWritingTest,
      listeningAnswers,
      speakingResults,
      readingAnswers,
      writingTaskIndex,
      writingAnswers,
      writingTimeLeft,
      isWritingLocked,
    };
  }, [
    phase,
    examData,
    difficulty,
    includeWritingTest,
    listeningAnswers,
    speakingResults,
    readingAnswers,
    writingTaskIndex,
    writingAnswers,
    writingTimeLeft,
    isWritingLocked,
  ]);

  useEffect(() => {
    if (phase !== 'writing') return undefined;
    const persistDraft = () => {
      if (writingDraftRef.current) {
        saveExamWritingDraft(writingDraftRef.current)
          .catch(error => console.error('Không thể autosave draft bài thi:', error));
      }
    };
    persistDraft();
    const timer = setInterval(persistDraft, 10000);
    return () => clearInterval(timer);
  }, [phase]);

  // ═══════════════════════════════════════
  //  SETUP PHASE
  // ═══════════════════════════════════════
  const handleStartExam = async () => {
    if (selectedWords.length === 0) return;
    if (!settings.apiKey || !settings.model) {
      setError('Vui lòng cấu hình API Key và model trong Cài đặt trước khi tạo bài kiểm tra.');
      return;
    }
    setPhase('loading');
    setError('');
    hasSavedResult.current = false;
    setRetakeRecordId(null);
    setHasPlayedDialogue(false);

    try {
      const examWords = selectedWords.map(w => ({ word: w.word, meaning: w.meaning, example: w.example }));
      const [baseExamData, writingData] = await Promise.all([
        generateExamContent(examWords, settings.apiKey, settings.model, difficulty),
        includeWritingTest
          ? generateExamWritingContent({
              wordList: examWords,
              topicName: activeTopic?.name || 'General',
              difficulty,
            }, settings.apiKey, settings.model)
          : Promise.resolve(null),
      ]);
      const data = writingData ? { ...baseExamData, writing: writingData } : baseExamData;
      setExamData(data);
      deleteExamWritingDraft().catch(error => console.error('Không thể xóa draft bài thi:', error));

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
      setShowDialogue(false);
      setCurrentSpeakingLine(0);
      setSpeakingResults([]);
      setSpeakingResult(null);
      setLiveTranscript('');
      setSpeakingError('');
      setCurrentReadingQ(0);
      setReadingAnswers([]);
      setReadingSelectedOption(null);
      setShowReadingHint(false);
      setWritingTaskIndex(0);
      setWritingAnswers(['', '']);
      setWritingEvaluation(null);
      setWritingTimeLeft(EXAM_WRITING_TOTAL_SECONDS);
      setIsWritingLocked(false);
      setIsEvaluatingWriting(false);
      setWritingSubmitError('');

      setPhase('listening');
    } catch (err) {
      setError(err.message || 'Lỗi tạo bài kiểm tra');
      setPhase('setup');
    }
  };

  const handleRetakeExam = (record) => {
    if (!record.examData) {
      setError('Bài kiểm tra này là dữ liệu cũ, không thể làm lại vì không có đề thi chi tiết.');
      return;
    }
    
    incrementReviewCount(record.id).catch(error => console.error('Không thể tăng lượt ôn:', error));
    
    setHasPlayedDialogue(false);
    setListeningStep('dialogue');
    setCurrentDialogueLine(0);
    setListeningAnswers([]);
    setListeningSelectedOption(null);
    setCurrentListeningQ(0);
    setShowDialogue(false);
    
    setCurrentSpeakingLine(0);
    setSpeakingResults([]);
    setLiveTranscript('');
    setSpeakingResult(null);
    
    setCurrentReadingQ(0);
    setReadingAnswers([]);
    setReadingSelectedOption(null);
    setReadingInputValue('');
    setReadingInputSubmitted(false);
    setReadingInputIsCorrect(false);
    setShowReadingHint(false);
    
    setWritingTaskIndex(0);
    setWritingAnswers(['', '']);
    setWritingEvaluation(null);
    setWritingTimeLeft(EXAM_WRITING_TOTAL_SECONDS);
    setIsWritingLocked(false);
    setWritingSubmitError('');
    setIsEvaluatingWriting(false);

    setRetakeRecordId(record.id);
    setExamData(record.examData);
    setDifficulty(record.difficulty);
    hasSavedResult.current = false;
      deleteExamWritingDraft().catch(error => console.error('Không thể xóa draft bài thi:', error));
    
    const voices = getEnglishVoices();
    const listeningSpeakers = (record.examData.listening?.dialogue || []).map(d => d.speaker);
    const speakingSpeakers = (record.examData.speaking?.dialogue || [])
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
    
    setPhase('listening');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    setHasPlayedDialogue(true);
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

    const delay = isCorrect ? 3500 : 1500;

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
    }, delay);
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

  const finishReadingSection = () => {
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

    if (includeWritingTest && examData?.writing?.tasks?.length === 2) {
      setWritingTaskIndex(0);
      setWritingAnswers(['', '']);
      setWritingEvaluation(null);
      setWritingTimeLeft(EXAM_WRITING_TOTAL_SECONDS);
      setIsWritingLocked(false);
      setWritingSubmitError('');
      setPhase('writing');
    } else {
      setPhase('results');
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
      setReadingInputValue('');
      setReadingInputSubmitted(false);
      setReadingInputIsCorrect(false);
      setShowReadingHint(false);
      if (currentReadingQ + 1 < examData.reading.length) {
        setCurrentReadingQ(currentReadingQ + 1);
      } else {
        finishReadingSection();
      }
    }, 1500);
  };

  const handleReadingSubmitInput = () => {
    if (!readingInputValue.trim() || readingInputSubmitted) return;
    
    setReadingInputSubmitted(true);
    const q = examData.reading[currentReadingQ];
    const isCorrect = readingInputValue.trim().toLowerCase() === q.word.toLowerCase();
    setReadingInputIsCorrect(isCorrect);
    
    const newAnswers = [...readingAnswers, { word: q.word, meaning: q.meaning, isCorrect, selected: null, typed: readingInputValue }];
    setReadingAnswers(newAnswers);
    
    setTimeout(() => {
      setReadingSelectedOption(null);
      setReadingInputValue('');
      setReadingInputSubmitted(false);
      setReadingInputIsCorrect(false);
      setShowReadingHint(false);
      if (currentReadingQ + 1 < examData.reading.length) {
        setCurrentReadingQ(currentReadingQ + 1);
      } else {
        finishReadingSection();
      }
    }, 1500);
  };

  // ═══════════════════════════════════════
  //  WRITING PHASE
  // ═══════════════════════════════════════
  const handleWritingAnswerChange = value => {
    setWritingAnswers(prev => {
      const next = [...prev];
      next[writingTaskIndex] = value;
      return next;
    });
  };

  const handleSubmitWritingExam = async () => {
    if (isEvaluatingWriting) return;
    if (!settings.apiKey || !settings.model) {
      setWritingSubmitError('Vui lòng cấu hình API Key và model trong Cài đặt trước khi chấm bài.');
      return;
    }

    setIsEvaluatingWriting(true);
    setIsWritingLocked(true);
    setWritingSubmitError('');

    try {
      const result = await evaluateExamWritingSubmission(
        { tasks: examData.writing.tasks, answers: writingAnswers },
        settings.apiKey,
        settings.model
      );
      setWritingEvaluation(result);
      deleteExamWritingDraft().catch(error => console.error('Không thể xóa draft bài thi:', error));
      setPhase('results');
    } catch (err) {
      setWritingSubmitError(err.message || 'Không thể chấm bài Writing. Vui lòng thử lại.');
      setIsWritingLocked(writingTimeLeft <= 0);
    } finally {
      setIsEvaluatingWriting(false);
    }
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

  useEffect(() => {
    if (phase === 'results' && !hasSavedResult.current) {
      hasSavedResult.current = true;

      const persistResult = async () => {
        if (!retakeRecordId) {
          await saveExamResult({
            difficulty,
            totalScore,
            listeningScore,
            speakingScore,
            readingScore,
            writingBand: writingEvaluation?.overallWritingBand || null,
            examData,
            topicId: activeTopicId,
          });
        }
        const items = await getExamLeaderboard(difficulty, activeTopicId);
        setLeaderboard(items);
        if (difficulty === setupLeaderboardTab) setSetupLeaderboard(items);
      };
      persistResult().catch(error => console.error('Không thể lưu kết quả bài thi:', error));
    }
  }, [phase, difficulty, totalScore, listeningScore, speakingScore, readingScore, writingEvaluation, retakeRecordId, examData, activeTopicId, setupLeaderboardTab]);

  // ═══════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════

  // ── SETUP ──
  if (phase === 'setup') {
    return (
      <div className="min-h-full flex items-stretch p-lg md:p-xl gap-xl transition-all duration-300 relative">
        <div className={`bg-surface border border-hairline rounded-[16px] p-[40px] shadow-sm flex flex-col items-center text-center transition-all duration-300 ${showSetupLeaderboard ? 'w-2/3' : 'max-w-2xl mx-auto w-full'}`}>
          <div className="w-24 h-24 mb-md mx-auto rounded-full bg-surface-container-low flex items-center justify-center">
            <ClipboardCheck size={48} className="text-primary" />
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

          <div className="w-full text-left mb-xl bg-canvas-soft p-lg rounded-[12px] border border-hairline">
            <div className="flex items-start justify-between gap-md">
              <div className="min-w-0">
                <label htmlFor="include-writing-test" className="block font-eyebrow text-eyebrow text-primary uppercase mb-xs tracking-wide">
                  IELTS Writing test
                </label>
                <p className="font-body-sm text-body-sm text-ink-muted">
                  Thêm phase Viết chuẩn Academic: Task 1 trong 20 phút và Task 2 trong 40 phút.
                </p>
              </div>
              <button
                id="include-writing-test"
                type="button"
                onClick={() => setIncludeWritingTest(value => !value)}
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors ${
                  includeWritingTest
                    ? 'bg-primary border-primary'
                    : 'bg-surface-container-high border-hairline'
                }`}
                aria-pressed={includeWritingTest}
                aria-label="Bật hoặc tắt IELTS Writing test"
              >
                <span
                  className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-surface shadow-sm transition-transform ${
                    includeWritingTest ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div className="mt-md grid grid-cols-1 sm:grid-cols-3 gap-sm">
              {[
                ['Nghe/Nói/Đọc', 'Flow hiện tại'],
                ['Writing Task 1', '150 từ · 20 phút'],
                ['Writing Task 2', '250 từ · 40 phút'],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-[8px] border border-hairline bg-surface px-md py-sm">
                  <p className="font-button text-button text-ink">{title}</p>
                  <p className="font-body-sm text-body-sm text-ink-muted">{detail}</p>
                </div>
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

        {/* Leaderboard Panel */}
        <div className={`transition-all duration-300 flex ${showSetupLeaderboard ? 'w-1/3 opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
          <div className="bg-surface border border-hairline rounded-[16px] p-[24px] shadow-sm w-full flex flex-col relative h-full min-w-[300px]">
            <h3 className="font-heading-2 text-heading-2 text-ink mb-md">Bảng xếp hạng</h3>
            
            <div className="flex bg-canvas-soft border border-hairline rounded-[8px] overflow-hidden mb-lg">
              {['Dễ', 'Trung bình', 'Khó'].map(level => (
                <button
                  key={level}
                  onClick={() => setSetupLeaderboardTab(level)}
                  className={`flex-1 py-sm text-center font-button text-[12px] transition-colors ${
                    setupLeaderboardTab === level
                      ? 'bg-primary text-on-primary'
                      : 'text-ink hover:bg-surface-container-low'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto pr-sm -mr-sm space-y-md">
              {setupLeaderboard.length === 0 ? (
                <div className="text-center py-xl text-ink-muted">
                  <Trophy size={48} className="mx-auto mb-md opacity-20" />
                  <p className="font-body-sm">Chưa có kết quả ở mức độ này</p>
                </div>
              ) : (
                setupLeaderboard.map((record, idx) => (
                  <div key={record.id} className="p-md rounded-[12px] border border-hairline bg-surface flex justify-between items-center gap-md">
                    <div className="flex items-center gap-md min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                        idx === 0 ? 'bg-accent-orange text-surface' :
                        idx === 1 ? 'bg-surface-container-high text-ink' :
                        idx === 2 ? 'bg-accent-orange/20 text-accent-orange' :
                        'bg-canvas-soft text-ink-muted'
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="font-button text-button text-ink truncate mb-[2px]">
                          {new Date(record.timestamp).toLocaleDateString('vi-VN')}
                        </div>
                        <div className="font-body-sm text-[11px] text-ink-muted">
                          Nghe: {record.listeningScore}% · Nói: {record.speakingScore}%
                        </div>
                        {(record.reviewCount > 0) && (
                          <div className="mt-xs text-[10px] font-button text-primary bg-primary/10 inline-block px-sm py-[2px] rounded-full">
                            Đã ôn {record.reviewCount} lần
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-sm">
                      <div className={`font-display-2 text-xl ${idx === 0 ? 'text-accent-orange' : 'text-primary'}`}>
                        {record.totalScore}%
                      </div>
                      {record.examData && (
                        <button
                          onClick={() => handleRetakeExam(record)}
                          className="p-xs bg-surface border border-hairline rounded-[6px] hover:bg-canvas-soft text-ink-muted hover:text-primary transition-colors flex items-center justify-center"
                          title="Làm lại đề này"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setShowSetupLeaderboard(!showSetupLeaderboard)}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-surface border border-r-0 border-hairline shadow-lg p-sm rounded-l-[12px] hover:bg-canvas-soft transition-colors z-10 text-primary"
          title={showSetupLeaderboard ? "Đóng Bảng xếp hạng" : "Mở Bảng xếp hạng"}
        >
          {showSetupLeaderboard ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
        </button>
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
            <span className="font-eyebrow text-eyebrow text-ink-muted">{includeWritingTest ? '1/4' : '1/3'}</span>
          </div>
        </div>

        <div className="w-full max-w-3xl bg-surface border border-hairline rounded-[16px] p-lg md:p-xxl shadow-sm">
          {listeningStep === 'dialogue' ? (
            <>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-xl gap-sm">
                <div>
                  <h3 className="font-heading-2 text-heading-2 text-ink mb-xs">Nghe đoạn hội thoại</h3>
                  <p className="font-body-md text-body-md text-ink-muted">
                    Bấm nút phát để nghe hội thoại, sau đó trả lời các câu hỏi.
                  </p>
                </div>
                <button
                  onClick={() => setShowDialogue(!showDialogue)}
                  className="px-md py-sm rounded-full border border-hairline hover:bg-surface-container-low transition-colors text-body-sm font-button text-ink whitespace-nowrap"
                >
                  {showDialogue ? 'Ẩn hội thoại' : 'Hiện hội thoại'}
                </button>
              </div>

              {/* Dialogue lines */}
              {showDialogue ? (
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
              ) : (
                <div className="flex items-center justify-center p-xl mb-xl border-2 border-dashed border-hairline rounded-[16px] bg-canvas-soft">
                  <div className="text-center">
                    <Headphones size={48} className="text-ink-muted mb-md mx-auto opacity-50" />
                    <p className="text-body-md text-ink-muted font-medium">Đoạn hội thoại đã được ẩn</p>
                    <p className="text-body-sm text-ink-muted opacity-70">Tập trung nghe để làm bài tốt hơn</p>
                  </div>
                </div>
              )}

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
                  disabled={isPlaying || !hasPlayedDialogue}
                  className="flex-1 bg-accent-green text-surface font-button text-button py-md rounded-full shadow-md hover:bg-accent-green/90 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-xs"
                >
                  Trả lời câu hỏi <ChevronRight size={18} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-md">
                <h3 className="font-heading-2 text-heading-2 text-ink">Câu hỏi kiểm tra nghe</h3>
                {(difficulty === 'Dễ' || difficulty === 'Trung bình') && (
                  <button
                    onClick={() => handlePlayDialogue(false)}
                    disabled={isPlaying}
                    className="bg-surface-container-high text-on-surface font-button text-button py-sm px-md rounded-full shadow-sm hover:bg-surface-container-highest transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-xs text-sm"
                  >
                    <Volume2 size={16} /> {isPlaying ? 'Đang phát...' : 'Nghe lại hội thoại'}
                  </button>
                )}
              </div>
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

              {listeningSelectedOption !== null && listeningSelectedOption === examData.listening.questions[currentListeningQ].correctIndex && examData.listening.questions[currentListeningQ].questionTranslation && (
                <div className="mt-md p-md bg-accent-green/10 border border-accent-green rounded-[12px] text-accent-green animate-in fade-in slide-in-from-bottom-2 text-left">
                  <strong className="font-bold">Dịch nghĩa ngữ cảnh:</strong> {examData.listening.questions[currentListeningQ].questionTranslation}
                </div>
              )}
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
            <span className="font-eyebrow text-eyebrow text-ink-muted">{includeWritingTest ? '2/4' : '2/3'}</span>
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
            <span className="font-eyebrow text-eyebrow text-ink-muted">{includeWritingTest ? '3/4' : '3/3'}</span>
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

          <div className="w-full bg-canvas-soft border-2 border-hairline rounded-[12px] p-lg font-heading-2 text-heading-2 text-ink text-center mb-xl shadow-inner relative">
            {exampleWithBlank || '____'}
            
            <div className="mt-md flex justify-center">
              {!showReadingHint ? (
                <button 
                  onClick={() => setShowReadingHint(true)}
                  className="text-primary text-body-sm font-button flex items-center gap-xs hover:underline"
                >
                  <Lightbulb size={16} /> Gợi ý
                </button>
              ) : (
                <span className="text-body-md text-ink-muted italic border-t border-hairline pt-sm block w-full mt-sm">
                  Gợi ý: {q.meaning}
                </span>
              )}
            </div>
          </div>

          {((difficulty === 'Trung bình' || difficulty === 'Khó') && currentReadingQ >= 3) ? (
            <div className="w-full flex flex-col items-center">
              <input
                type="text"
                autoFocus
                placeholder="Nhập từ vựng tiếng Anh..."
                value={readingInputValue}
                onChange={(e) => setReadingInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleReadingSubmitInput();
                }}
                disabled={readingInputSubmitted}
                className={`w-full max-w-sm text-center font-heading-2 text-heading-2 p-md border-2 rounded-[12px] outline-none transition-colors ${
                  readingInputSubmitted
                    ? readingInputIsCorrect
                      ? 'border-accent-green bg-accent-green/10 text-accent-green'
                      : 'border-accent-orange bg-accent-orange/10 text-accent-orange'
                    : 'border-hairline bg-surface text-ink focus:border-primary focus:ring-2 focus:ring-primary/20'
                }`}
              />
              
              {!readingInputSubmitted ? (
                <button
                  onClick={handleReadingSubmitInput}
                  disabled={!readingInputValue.trim()}
                  className="mt-md px-xl py-sm bg-primary text-on-primary font-button text-button rounded-full hover:bg-primary-active disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-sm"
                >
                  Kiểm tra
                </button>
              ) : (
                <div className="mt-md text-center">
                  {readingInputIsCorrect ? (
                    <span className="font-bold text-accent-green flex items-center justify-center gap-xs">
                      <CheckCircle2 size={20} /> Chính xác!
                    </span>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span className="font-bold text-accent-orange flex items-center gap-xs mb-xs">
                        <XCircle size={20} /> Chưa đúng!
                      </span>
                      <span className="text-body-md text-ink">
                        Đáp án đúng là: <strong className="text-primary">{q.word}</strong>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
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
          )}
        </div>
      </div>
    );
  }

  // ── WRITING ──
  if (phase === 'writing') {
    const writingData = examData?.writing;
    const task = writingData?.tasks?.[writingTaskIndex] || {};
    const taskMeta = EXAM_WRITING_TASKS[writingTaskIndex] || EXAM_WRITING_TASKS[0];
    const currentAnswer = writingAnswers[writingTaskIndex] || '';
    const currentWordCount = countWords(currentAnswer);
    const task1WordCount = countWords(writingAnswers[0]);
    const task2WordCount = countWords(writingAnswers[1]);
    const currentMinWords = taskMeta?.minWords || 0;
    const isUnderWordTarget = currentWordCount < currentMinWords;
    const task2HasStarted = writingTimeLeft <= EXAM_WRITING_TASK1_SECONDS;
    const totalWritingProgress = ((EXAM_WRITING_TOTAL_SECONDS - writingTimeLeft) / EXAM_WRITING_TOTAL_SECONDS) * 100;

    return (
      <div className="min-h-full p-lg md:p-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-lg">
          <div className="flex flex-col gap-md md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-sm">
              <div className="px-md py-xs rounded-full bg-accent-purple/10 text-accent-purple font-button text-button flex items-center gap-xs">
                <PenLine size={16} /> Phần 4: Kiểm tra Viết
              </div>
              <div className="h-px flex-1 bg-hairline md:w-32" />
              <span className="font-eyebrow text-eyebrow text-ink-muted">4/4</span>
            </div>
            <div className={`flex items-center gap-sm rounded-full border px-md py-sm font-button text-button ${
              writingTimeLeft <= 300
                ? 'border-error/30 bg-error/10 text-error'
                : 'border-hairline bg-surface text-ink'
            }`}>
              <Clock3 size={18} />
              <span>{formatWritingTime(writingTimeLeft)}</span>
            </div>
          </div>

          <div className="h-3 w-full overflow-hidden rounded-full bg-hairline">
            <div
              className="h-full bg-accent-purple transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, totalWritingProgress))}%` }}
            />
          </div>

          <div className="grid grid-cols-1 gap-lg xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <aside className="flex min-w-0 flex-col gap-lg">
              <div className="bg-surface border border-hairline rounded-[16px] p-lg shadow-sm">
                <div className="mb-md grid grid-cols-2 gap-sm rounded-[10px] bg-canvas-soft p-xs border border-hairline">
                  {EXAM_WRITING_TASKS.map((meta, index) => (
                    <button
                      key={meta.taskType}
                      type="button"
                      onClick={() => setWritingTaskIndex(index)}
                      className={`rounded-[8px] px-md py-sm text-left transition-colors ${
                        writingTaskIndex === index
                          ? 'bg-surface text-primary shadow-sm'
                          : 'text-ink-muted hover:text-ink hover:bg-surface/70'
                      }`}
                    >
                      <span className="block font-button text-button">{meta.label}</span>
                      <span className="block font-body-sm text-body-sm">{meta.minWords} từ · {meta.minutes} phút</span>
                    </button>
                  ))}
                </div>

                <div className="mb-md flex flex-wrap items-center gap-sm">
                  <span className={`rounded-full px-md py-xs font-body-sm text-body-sm ${
                    writingTaskIndex === 0 && task2HasStarted
                      ? 'bg-accent-orange/10 text-accent-orange'
                      : 'bg-primary/10 text-primary'
                  }`}>
                    {writingTaskIndex === 0 && task2HasStarted
                      ? 'Đã qua mốc 20 phút'
                      : `${taskMeta.label} · mục tiêu ${taskMeta.minWords}+ từ`}
                  </span>
                  {isWritingLocked && (
                    <span className="rounded-full bg-error/10 px-md py-xs font-body-sm text-body-sm text-error">
                      Hết giờ
                    </span>
                  )}
                </div>

                <div className="rounded-[12px] border border-hairline bg-canvas-soft p-md">
                  <div className="mb-sm flex items-center gap-xs font-eyebrow text-eyebrow uppercase tracking-wide text-ink-muted">
                    <FileText size={15} /> Đề bài
                  </div>
                  <p className="whitespace-pre-line font-body-md text-body-md leading-relaxed text-ink">
                    {task.prompt}
                  </p>
                </div>

                {writingTaskIndex === 0 && task.visuals?.length > 0 && (
                  <div className="mt-lg">
                    <WritingVisual visuals={task.visuals} />
                  </div>
                )}
              </div>
            </aside>

            <section className="flex min-w-0 flex-col rounded-[16px] border border-hairline bg-surface p-lg shadow-sm">
              <div className="mb-md flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-heading-2 text-heading-2 text-ink">{taskMeta.label}</h3>
                  <p className="font-body-sm text-body-sm text-ink-muted">
                    Task 1: {task1WordCount}/150 từ · Task 2: {task2WordCount}/250 từ
                  </p>
                </div>
                <span className={`rounded-full px-md py-xs font-button text-button ${
                  isUnderWordTarget
                    ? 'bg-accent-orange/10 text-accent-orange'
                    : 'bg-accent-green/10 text-accent-green'
                }`}>
                  {currentWordCount}/{currentMinWords}+ từ
                </span>
              </div>

              <textarea
                value={currentAnswer}
                onChange={event => handleWritingAnswerChange(event.target.value)}
                disabled={isWritingLocked || isEvaluatingWriting}
                placeholder="Viết bài của bạn ở đây..."
                className="min-h-[460px] flex-1 resize-none rounded-[12px] border border-hairline bg-canvas-soft p-lg font-body-md text-body-md leading-7 text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-70"
              />

              {writingSubmitError && (
                <div className="mt-md flex items-start gap-sm rounded-[12px] border border-error/20 bg-error-container p-md text-on-error-container">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <p className="font-body-sm text-body-sm">{writingSubmitError}</p>
                </div>
              )}

              <div className="mt-lg flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="font-body-sm text-body-sm text-ink-muted">
                  Autosave mỗi 10 giây. Task 2 được tính nặng gấp đôi Task 1 khi chấm band Writing.
                </p>
                <button
                  type="button"
                  onClick={handleSubmitWritingExam}
                  disabled={isEvaluatingWriting}
                  className="inline-flex items-center justify-center gap-xs rounded-full bg-primary px-xl py-md font-button text-button text-on-primary shadow-sm transition-all hover:bg-primary-active disabled:opacity-60"
                >
                  {isEvaluatingWriting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Đang chấm bài...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} /> Nộp bài
                    </>
                  )}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  // ── RESULTS ──
  return (
    <div className="min-h-full flex items-center justify-center p-lg md:p-xl">
      <div className="w-full max-w-6xl bg-surface border border-hairline rounded-[16px] p-lg md:p-xxl shadow-sm">
        <div className="text-center mb-xxl">
          <div className="w-24 h-24 bg-accent-green/10 rounded-full flex items-center justify-center mx-auto mb-lg shadow-inner border border-accent-green/20">
            <CheckCircle2 size={48} className="text-accent-green" />
          </div>
          <h2 className="font-display-2 text-display-2 text-ink mb-sm">Kết quả kiểm tra</h2>
          <p className="font-body-md text-body-md text-ink-muted">
            Điểm tổng hợp: <strong className="text-ink text-[1.3em]">{totalScore}%</strong>
          </p>
        </div>

        <div className={`grid grid-cols-1 gap-lg mb-xxl ${writingEvaluation ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
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

          {writingEvaluation && (
            <div className="bg-accent-purple/5 border border-accent-purple/20 rounded-[16px] p-xl text-center">
              <PenLine size={32} className="text-accent-purple mx-auto mb-md" />
              <div className="font-display-1 text-display-1 text-accent-purple mb-xs">
                {writingEvaluation.overallWritingBand}
              </div>
              <div className="font-eyebrow text-eyebrow text-ink-muted uppercase">Kiểm tra Viết</div>
              <div className="font-body-sm text-body-sm text-ink-muted mt-sm">
                Task 1: {writingEvaluation.task1Band} · Task 2: {writingEvaluation.task2Band}
              </div>
            </div>
          )}
        </div>

        {writingEvaluation && (
          <div className="mb-xxl rounded-[16px] border border-hairline bg-canvas-soft p-lg text-left">
            <div className="mb-lg flex items-center gap-sm">
              <PenLine size={22} className="text-accent-purple" />
              <div>
                <h3 className="font-heading-2 text-heading-2 text-ink">Phản hồi Writing</h3>
                <p className="font-body-sm text-body-sm text-ink-muted">
                  Band tổng Writing dùng tỉ lệ Task 1:Task 2 = 1:2.
                </p>
              </div>
            </div>

            {writingEvaluation.summary && (
              <p className="mb-lg rounded-[12px] border border-hairline bg-surface p-md font-body-md text-body-md text-ink">
                {writingEvaluation.summary}
              </p>
            )}

            <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
              {(writingEvaluation.taskReports || []).map(report => (
                <div key={report.taskType} className="rounded-[12px] border border-hairline bg-surface p-md">
                  <h4 className="mb-md font-title text-title text-ink">Task {report.taskType}</h4>
                  <div className="space-y-sm">
                    {(report.criteria || []).map(item => (
                      <div key={item.name} className="rounded-[8px] bg-canvas-soft p-sm">
                        <div className="mb-xs flex items-center justify-between gap-sm">
                          <span className="font-button text-button text-ink">{item.name}</span>
                          <span className="rounded-full bg-accent-purple/10 px-sm py-[2px] font-button text-button text-accent-purple">
                            {item.band}
                          </span>
                        </div>
                        <p className="font-body-sm text-body-sm text-ink-muted">{item.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {writingEvaluation.upgradedRewrites?.length > 0 && (
              <div className="mt-lg rounded-[12px] border border-hairline bg-surface p-md">
                <h4 className="mb-md font-title text-title text-ink">Gợi ý nâng band</h4>
                <div className="space-y-md">
                  {writingEvaluation.upgradedRewrites.slice(0, 3).map((rewrite, index) => (
                    <div key={`${rewrite.original}-${index}`} className="border-b border-hairline pb-md last:border-0 last:pb-0">
                      <p className="font-body-sm text-body-sm text-ink-muted">{rewrite.original}</p>
                      <p className="mt-xs font-body-md text-body-md text-ink">{rewrite.upgraded}</p>
                      {rewrite.explanation && (
                        <p className="mt-xs font-body-sm text-body-sm text-accent-purple">{rewrite.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {leaderboard.length > 0 && (
          <div className="mb-xxl rounded-[16px] border border-hairline bg-canvas-soft p-lg text-left">
            <div className="mb-lg flex items-center gap-sm">
              <Trophy size={22} className="text-accent-orange" />
              <div>
                <h3 className="font-heading-2 text-heading-2 text-ink">Bảng xếp hạng điểm cao</h3>
                <p className="font-body-sm text-body-sm text-ink-muted">
                  Mức độ: {difficulty}
                </p>
              </div>
            </div>

            <div className="space-y-sm">
              {leaderboard.map((record, idx) => (
                <div key={record.id} className={`flex items-center justify-between p-md rounded-[12px] border ${idx === 0 ? 'bg-accent-orange/10 border-accent-orange/20' : 'bg-surface border-hairline'}`}>
                  <div className="flex items-center gap-md">
                    <span className={`font-display-2 w-8 text-center ${idx === 0 ? 'text-accent-orange' : 'text-ink-muted'}`}>
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="font-title text-title text-ink">
                        {new Date(record.timestamp).toLocaleString('vi-VN', { 
                          hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' 
                        })}
                      </div>
                      <div className="font-body-sm text-body-sm text-ink-muted">
                        Nghe: {record.listeningScore}% · Nói: {record.speakingScore}% · Đọc: {record.readingScore}%
                        {record.writingBand ? ` · Viết: ${record.writingBand}` : ''}
                      </div>
                      {(record.reviewCount > 0) && (
                        <div className="mt-xs text-xs font-button text-primary bg-primary/10 inline-block px-sm py-[2px] rounded-full">
                          Đã ôn {record.reviewCount} lần
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-md">
                    <div className={`font-display-2 text-display-2 ${idx === 0 ? 'text-accent-orange' : 'text-primary'}`}>
                      {record.totalScore}%
                    </div>
                    {record.examData && (
                      <button
                        onClick={() => handleRetakeExam(record)}
                        className="p-sm bg-surface border border-hairline rounded-[8px] hover:bg-canvas-soft text-ink-muted hover:text-primary transition-colors flex flex-col items-center gap-[2px]"
                        title="Làm lại đề này"
                      >
                        <RotateCcw size={16} />
                        <span className="text-[10px] uppercase font-bold">Làm lại</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <button
            onClick={() => {
      deleteExamWritingDraft().catch(error => console.error('Không thể xóa draft bài thi:', error));
              setRetakeRecordId(null);
              setPhase('setup');
            }}
            className="bg-primary text-on-primary rounded-full py-md px-xxl font-button text-button hover:bg-primary-active transition-all shadow-sm flex items-center gap-xs"
          >
            <RotateCcw size={18} /> Kiểm tra lại
          </button>
        </div>
      </div>
    </div>
  );
}
