import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PenLine, Clock, Send, RotateCcw, ChevronRight, ChevronLeft,
  CheckCircle2, XCircle, AlertCircle, Sparkles, BookOpen, Eye, EyeOff,
  Lightbulb, Target, ArrowRight, X, FileText, Loader2
} from 'lucide-react';
import { generateWritingPrompt, analyzeWritingPrompt, evaluateWritingSubmission } from '../../services/api';
import {
  createSession, updateSession, getLatestDraft, deleteSession,
  addSentenceMistake, getSentenceMistakes, clearSentenceMistakes
} from '../../services/writingSessionService';
import { WritingVisual } from './WritingVisual';

// ─── Helpers ─────────────────────────────────────────────────

function normalize(text) {
  return text.toLowerCase().trim().replace(/[.,!?;:'"()\[\]{}\-—–…""'']/g, '').replace(/\s+/g, ' ');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─── SentencePractice Sub-component ──────────────────────────

function SentencePractice({ words, activeTopicId, topics, onBack }) {
  const topicWords = words.filter(
    w => w.topicId === activeTopicId && w.example && w.example.trim()
  );
  const currentTopic = topics.find(t => t.id === activeTopicId);

  const [shuffled, setShuffled] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [results, setResults] = useState([]);
  const [phase, setPhase] = useState('setup'); // 'setup' | 'playing' | 'results'
  const [showExample, setShowExample] = useState(false);
  const [feedback, setFeedback] = useState(null); // null | 'correct' | 'wrong'
  const inputRef = useRef(null);

  const mistakes = getSentenceMistakes(activeTopicId);

  const handleStart = () => {
    if (topicWords.length === 0) return;
    const s = [...topicWords].sort(() => 0.5 - Math.random());
    setShuffled(s);
    setCurrentIndex(0);
    setResults([]);
    setUserInput('');
    setFeedback(null);
    setShowExample(false);
    setPhase('playing');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSubmit = () => {
    if (!userInput.trim()) return;
    const current = shuffled[currentIndex];
    const expected = current.example;
    const isCorrect = normalize(userInput) === normalize(expected);

    const result = { word: current, userInput, expected, isCorrect };
    setResults(prev => [...prev, result]);
    setFeedback(isCorrect ? 'correct' : 'wrong');

    if (!isCorrect) {
      addSentenceMistake({
        wordId: current.id,
        expected,
        userInput,
        topicId: activeTopicId,
      });
    }

    setTimeout(() => {
      if (currentIndex + 1 < shuffled.length) {
        setCurrentIndex(prev => prev + 1);
        setUserInput('');
        setFeedback(null);
        setShowExample(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        setPhase('results');
      }
    }, 1500);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !feedback) handleSubmit();
  };

  const correctCount = results.filter(r => r.isCorrect).length;

  if (phase === 'setup') {
    return (
      <div className="max-w-2xl mx-auto px-md md:px-xxl py-xl">
        <button onClick={onBack} className="flex items-center gap-xs text-primary font-button text-button mb-lg hover:underline">
          <ChevronLeft size={18} /> Quay lại
        </button>

        <div className="bg-surface rounded-lg border border-hairline p-xl">
          <div className="flex items-center gap-sm mb-lg">
            <BookOpen size={24} className="text-primary" />
            <h2 className="text-heading-2 font-heading-2 text-ink">Viết câu mẫu</h2>
          </div>

          <p className="text-body-md font-body-md text-ink-secondary mb-lg">
            Luyện gõ lại câu ví dụ từ từ vựng hiện có. Hệ thống sẽ kiểm tra độ chính xác (không phân biệt hoa/thường, dấu câu nhẹ).
          </p>

          <div className="bg-canvas-soft rounded-lg p-md mb-lg">
            <p className="text-body-sm font-body-sm text-ink-muted">
              Chủ đề: <span className="font-button text-ink">{currentTopic?.name || 'N/A'}</span>
            </p>
            <p className="text-body-sm font-body-sm text-ink-muted">
              Số từ có câu mẫu: <span className="font-button text-ink">{topicWords.length}</span>
            </p>
            {mistakes.length > 0 && (
              <p className="text-body-sm font-body-sm text-ink-muted">
                Lỗi trước đó: <span className="font-button text-error">{mistakes.length}</span>
              </p>
            )}
          </div>

          {topicWords.length === 0 ? (
            <div className="text-center py-lg text-ink-muted">
              <AlertCircle size={32} className="mx-auto mb-sm" />
              <p>Không có từ nào có câu ví dụ trong chủ đề này.</p>
            </div>
          ) : (
            <button onClick={handleStart} className="w-full bg-primary text-on-primary px-lg py-sm rounded-full font-button text-button hover:bg-primary-active transition-colors flex items-center justify-center gap-xs">
              <PenLine size={18} /> Bắt đầu ({topicWords.length} câu)
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'results') {
    return (
      <div className="max-w-2xl mx-auto px-md md:px-xxl py-xl">
        <div className="bg-surface rounded-lg border border-hairline p-xl">
          <div className="text-center mb-xl">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-md ${correctCount === results.length ? 'bg-accent-green/10' : 'bg-accent-orange/10'}`}>
              <span className="text-heading-1 font-heading-1">{correctCount}/{results.length}</span>
            </div>
            <h2 className="text-heading-2 font-heading-2 text-ink">Kết quả viết câu mẫu</h2>
            <p className="text-body-md text-ink-muted mt-xs">
              {correctCount === results.length ? 'Xuất sắc! Bạn gõ đúng hết!' : `Bạn cần ôn lại ${results.length - correctCount} câu.`}
            </p>
          </div>

          <div className="space-y-sm mb-xl">
            {results.map((r, idx) => (
              <div key={idx} className={`p-md rounded-lg border ${r.isCorrect ? 'border-accent-green/30 bg-accent-green/5' : 'border-error/30 bg-error/5'}`}>
                <div className="flex items-start gap-sm">
                  {r.isCorrect ? <CheckCircle2 size={18} className="text-accent-green mt-0.5 shrink-0" /> : <XCircle size={18} className="text-error mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-button text-body-md text-ink">{r.word.word} <span className="text-ink-muted font-body-md">— {r.word.meaning}</span></p>
                    {!r.isCorrect && (
                      <>
                        <p className="text-body-sm text-error mt-xxs">Bạn viết: {r.userInput}</p>
                        <p className="text-body-sm text-accent-green mt-xxs">Đáp án: {r.expected}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-sm">
            <button onClick={handleStart} className="flex-1 bg-primary text-on-primary px-lg py-sm rounded-full font-button text-button hover:bg-primary-active transition-colors flex items-center justify-center gap-xs">
              <RotateCcw size={16} /> Làm lại
            </button>
            <button onClick={onBack} className="flex-1 bg-surface border border-hairline px-lg py-sm rounded-[8px] font-button text-button text-ink hover:bg-canvas-soft transition-colors">
              Quay lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  // phase === 'playing'
  const current = shuffled[currentIndex];

  return (
    <div className="max-w-2xl mx-auto px-md md:px-xxl py-xl">
      <div className="flex items-center justify-between mb-lg">
        <button onClick={onBack} className="flex items-center gap-xs text-error font-button text-button hover:underline">
          <X size={18} /> Thoát
        </button>
        <span className="text-body-sm font-button text-ink-muted">{currentIndex + 1} / {shuffled.length}</span>
      </div>

      <div className="bg-surface rounded-lg border border-hairline p-xl">
        {/* Word info */}
        <div className="mb-lg">
          <h3 className="text-heading-3 font-heading-3 text-ink">{current.word}</h3>
          <p className="text-body-md text-ink-secondary mt-xxs">{current.meaning}</p>
          {current.phonetic && <p className="text-body-sm text-ink-muted mt-xxs">{current.phonetic}</p>}
        </div>

        {/* Example hint */}
        <div className="mb-lg">
          <button
            onClick={() => setShowExample(!showExample)}
            className="flex items-center gap-xs text-body-sm font-button text-primary hover:underline"
          >
            {showExample ? <EyeOff size={14} /> : <Eye size={14} />}
            {showExample ? 'Ẩn câu mẫu' : 'Xem câu mẫu'}
          </button>
          {showExample && (
            <p className="mt-sm p-md bg-canvas-soft rounded-lg text-body-md text-ink-secondary italic">
              {current.example}
            </p>
          )}
        </div>

        {/* Input */}
        <div className="relative">
          <input
            ref={inputRef}
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!!feedback}
            placeholder="Gõ lại câu ví dụ bằng tiếng Anh..."
            className={`w-full px-md py-sm bg-canvas border rounded-[8px] font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary transition-all ${
              feedback === 'correct' ? 'border-accent-green bg-accent-green/5' :
              feedback === 'wrong' ? 'border-error bg-error/5' :
              'border-hairline'
            }`}
          />
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`mt-sm p-md rounded-lg ${feedback === 'correct' ? 'bg-accent-green/10 text-accent-green' : 'bg-error/10 text-error'}`}>
            <div className="flex items-center gap-xs font-button text-body-md">
              {feedback === 'correct' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              {feedback === 'correct' ? 'Chính xác!' : 'Sai rồi!'}
            </div>
            {feedback === 'wrong' && (
              <p className="mt-xs text-body-sm text-ink-secondary">Đáp án: <span className="text-accent-green">{current.example}</span></p>
            )}
          </div>
        )}

        {/* Submit button */}
        {!feedback && (
          <button
            onClick={handleSubmit}
            disabled={!userInput.trim()}
            className="mt-md w-full bg-primary text-on-primary px-lg py-sm rounded-full font-button text-button hover:bg-primary-active transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-xs"
          >
            <Send size={16} /> Kiểm tra
          </button>
        )}

        {/* Progress bar */}
        <div className="mt-lg h-1.5 bg-canvas-soft rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + (feedback ? 1 : 0)) / shuffled.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}


// ─── Main WritingPractice Component ──────────────────────────

export function WritingPractice({ words, topics, activeTopicId, settings, onOpenSettings }) {
  const currentTopic = topics.find(t => t.id === activeTopicId);
  const topicWords = words.filter(w => w.topicId === activeTopicId);

  // ── State ──
  const [mode, setMode] = useState(null);           // null | 'sentence' | 'ai'
  const [phase, setPhase] = useState('setup');       // 'setup' | 'practice' | 'evaluating' | 'result'

  // Setup state
  const [taskType, setTaskType] = useState('2');
  const [bandTarget, setBandTarget] = useState(6.5);
  const [duration, setDuration] = useState(40);       // in minutes
  const [customPrompt, setCustomPrompt] = useState('');
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  // Practice state
  const [sessionId, setSessionId] = useState(null);
  const [writingPrompt, setWritingPrompt] = useState('');
  const [visuals, setVisuals] = useState([]);
  const [outline, setOutline] = useState([]);
  const [suggestedVocab, setSuggestedVocab] = useState([]);
  const [tips, setTips] = useState('');
  const [essay, setEssay] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Result state
  const [evaluation, setEvaluation] = useState(null);
  const [activeHighlight, setActiveHighlight] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);

  // Error state
  const [error, setError] = useState('');

  // Refs
  const editorRef = useRef(null);
  const autoSaveRef = useRef(null);
  const timerRef = useRef(null);

  // ── Restore draft on mount ──
  useEffect(() => {
    const draft = getLatestDraft();
    if (draft) {
      const elapsed = Math.floor((Date.now() - draft.startedAt) / 1000);
      const remaining = Math.max(0, draft.duration - elapsed);

      if (remaining > 0) {
        setSessionId(draft.id);
        setWritingPrompt(draft.prompt);
        setVisuals(draft.visuals || []);
        setEssay(draft.essay || '');
        setTaskType(draft.taskType);
        setBandTarget(draft.bandTarget);
        setTimeLeft(remaining);
        setMode('ai');
        setPhase('practice');
        setTimerActive(true);
      } else {
        // Expired draft, delete it to prevent getting stuck
        deleteSession(draft.id);
      }
    }
  }, []);

  // ── Timer ──
  useEffect(() => {
    if (!timerActive || timeLeft <= 0) {
      if (timerActive && timeLeft <= 0) {
        setIsTimedOut(true);
        setTimerActive(false);
      }
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setIsTimedOut(true);
          setTimerActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [timerActive, timeLeft]);

  // ── Auto-save every 10s ──
  useEffect(() => {
    if (phase !== 'practice' || !sessionId) return;
    autoSaveRef.current = setInterval(() => {
      updateSession(sessionId, { essay });
    }, 10000);
    return () => clearInterval(autoSaveRef.current);
  }, [phase, sessionId, essay]);

  // ── Generate random prompt ──
  const handleGeneratePrompt = async () => {
    const apiKey = settings.apiKey;
    if (!apiKey) {
      setError('Chưa cấu hình API Key. Vào Cài đặt để thêm Gemini API Key.');
      return;
    }
    setGeneratingPrompt(true);
    setError('');
    try {
      const wordHints = topicWords.slice(0, 15).map(w => w.word);
      const result = await generateWritingPrompt(
        { topicName: currentTopic?.name, taskType, bandTarget, wordHints },
        apiKey, settings.model
      );
      setCustomPrompt(result.prompt);
      setVisuals(result.visuals || []);
    } catch (err) {
      setError(err.message || 'Lỗi khi tạo đề.');
    } finally {
      setGeneratingPrompt(false);
    }
  };

  // ── Start practice ──
  const handleStartPractice = async () => {
    const prompt = customPrompt.trim();
    if (!prompt) { setError('Vui lòng nhập đề hoặc tạo đề ngẫu nhiên.'); return; }
    if (taskType === '1' && visuals.length === 0) {
      setError('Đề Task 1 cần có biểu đồ. Vui lòng bấm "Tạo đề ngẫu nhiên"!');
      return;
    }
    setError('');

    const durationSec = duration * 60;
    const session = createSession({
      taskType, bandTarget, prompt, visuals, outline: '', duration: durationSec,
    });
    setSessionId(session.id);
    setWritingPrompt(prompt);
    setEssay('');
    setTimeLeft(durationSec);
    setTimerActive(true);
    setIsTimedOut(false);
    setPhase('practice');

    // Analyze prompt in background (non-blocking)
    const apiKey = settings.apiKey;
    if (apiKey) {
      try {
        const analysis = await analyzeWritingPrompt({ prompt, taskType, bandTarget, visuals }, apiKey, settings.model);
        setOutline(analysis.outline || []);
        setSuggestedVocab(analysis.suggestedVocab || []);
        setTips(analysis.tips || '');
      } catch {
        // silently fail — outline is a nice-to-have
      }
    }
  };

  // ── Submit essay ──
  const handleSubmitEssay = async () => {
    const apiKey = settings.apiKey;
    if (!apiKey) {
      setError('Chưa cấu hình API Key.');
      return;
    }
    if (!essay.trim()) {
      setError('Bạn chưa viết gì!');
      return;
    }

    setSubmitting(true);
    setError('');
    setTimerActive(false);
    clearInterval(autoSaveRef.current);

    // Save before submit
    updateSession(sessionId, { essay, status: 'submitted' });

    try {
      setPhase('evaluating');
      const result = await evaluateWritingSubmission(
        { prompt: writingPrompt, outline: outline.join('\n'), essay, taskType, bandTarget, visuals },
        apiKey, settings.model
      );
      setEvaluation(result);
      updateSession(sessionId, { evaluation: result, status: 'evaluated' });
      setPhase('result');
    } catch (err) {
      setError(err.message || 'Lỗi khi chấm bài. Draft đã được lưu.');
      setPhase('practice');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reset ──
  const handleReset = () => {
    if (sessionId) {
      deleteSession(sessionId);
    }
    setMode(null);
    setPhase('setup');
    setSessionId(null);
    setWritingPrompt('');
    setCustomPrompt('');
    setVisuals([]);
    setOutline([]);
    setSuggestedVocab([]);
    setTips('');
    setEssay('');
    setTimeLeft(0);
    setTimerActive(false);
    setIsTimedOut(false);
    setEvaluation(null);
    setActiveHighlight(null);
    setError('');
    clearInterval(timerRef.current);
    clearInterval(autoSaveRef.current);
  };

  // ── Sentence mode ──
  if (mode === 'sentence') {
    return (
      <div className="flex-1 overflow-y-auto bg-canvas-soft">
        <SentencePractice
          words={words}
          activeTopicId={activeTopicId}
          topics={topics}
          onBack={() => { setMode(null); setPhase('setup'); }}
        />
      </div>
    );
  }

  // ── Evaluating screen ──
  if (phase === 'evaluating') {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas-soft">
        <div className="text-center">
          <Loader2 size={48} className="text-primary animate-spin mx-auto mb-lg" />
          <h2 className="text-heading-2 font-heading-2 text-ink mb-xs">Đang chấm bài...</h2>
          <p className="text-body-md text-ink-muted">AI đang phân tích bài viết của bạn theo tiêu chí Cambridge IELTS.</p>
        </div>
      </div>
    );
  }

  // ── Result screen ──
  if (phase === 'result' && evaluation) {
    return (
      <div className="flex-1 overflow-y-auto bg-canvas-soft">
        <div className="max-w-5xl mx-auto px-md md:px-xxl py-xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-lg">
            <h2 className="text-heading-2 font-heading-2 text-ink">Kết quả chấm bài</h2>
            <button onClick={handleReset} className="flex items-center gap-xs text-primary font-button text-button hover:underline">
              <RotateCcw size={16} /> Làm bài mới
            </button>
          </div>

          {/* Overall band */}
          <div className="bg-surface rounded-lg border border-hairline p-xl mb-lg text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-accent-teal/20 mb-md">
              <span className="text-heading-1 font-heading-1 text-primary">{evaluation.overallBand}</span>
            </div>
            <h3 className="text-heading-3 font-heading-3 text-ink">Overall Band Score</h3>
            <p className="text-body-md text-ink-secondary mt-sm max-w-xl mx-auto">{evaluation.summary}</p>
          </div>

          {/* 4 Criteria cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-lg">
            {(evaluation.criteria || []).map((c, idx) => (
              <div key={idx} className="bg-surface rounded-lg border border-hairline p-lg">
                <div className="flex items-center justify-between mb-sm">
                  <h4 className="font-button text-body-md text-ink">{c.name}</h4>
                  <span className={`text-heading-3 font-heading-3 ${c.band >= 7 ? 'text-accent-green' : c.band >= 5.5 ? 'text-accent-orange' : 'text-error'}`}>
                    {c.band}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-canvas-soft rounded-full mb-sm overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${c.band >= 7 ? 'bg-accent-green' : c.band >= 5.5 ? 'bg-accent-orange' : 'bg-error'}`}
                    style={{ width: `${(c.band / 9) * 100}%` }}
                  />
                </div>
                <p className="text-body-sm text-ink-secondary">{c.comment}</p>
              </div>
            ))}
          </div>

          {/* Strengths & Weaknesses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-lg">
            <div className="bg-surface rounded-lg border border-hairline p-lg">
              <h4 className="font-button text-body-md text-accent-green flex items-center gap-xs mb-sm">
                <CheckCircle2 size={16} /> Điểm mạnh
              </h4>
              <ul className="space-y-xs">
                {(evaluation.strengths || []).map((s, i) => (
                  <li key={i} className="text-body-sm text-ink-secondary flex items-start gap-xs">
                    <span className="text-accent-green mt-0.5">•</span> {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-surface rounded-lg border border-hairline p-lg">
              <h4 className="font-button text-body-md text-error flex items-center gap-xs mb-sm">
                <AlertCircle size={16} /> Điểm yếu
              </h4>
              <ul className="space-y-xs">
                {(evaluation.weaknesses || []).map((w, i) => (
                  <li key={i} className="text-body-sm text-ink-secondary flex items-start gap-xs">
                    <span className="text-error mt-0.5">•</span> {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Essay with highlights */}
          <div className="bg-surface rounded-lg border border-hairline p-xl mb-lg">
            <h4 className="font-button text-body-md text-ink mb-md flex items-center gap-xs">
              <FileText size={16} /> Bài viết & nhận xét chi tiết
            </h4>
            <div className="text-body-md text-ink-secondary leading-relaxed whitespace-pre-wrap">
              {renderHighlightedEssay(essay, evaluation.highlights || [], activeHighlight, setActiveHighlight)}
            </div>

            {/* Active highlight popover */}
            {activeHighlight && (
              <div className="mt-md p-md bg-canvas-soft rounded-lg border border-hairline animate-[fadeIn_0.2s_ease-out]">
                <div className="flex items-center justify-between mb-sm">
                  <span className={`text-caption font-button uppercase tracking-wider ${
                    activeHighlight.type === 'grammar' || activeHighlight.type === 'lexical' ? 'text-error' : 'text-accent-orange'
                  }`}>
                    {activeHighlight.type}
                  </span>
                  <button onClick={() => setActiveHighlight(null)} className="text-ink-muted hover:text-ink">
                    <X size={14} />
                  </button>
                </div>
                <p className="text-body-sm text-ink-secondary mb-sm">{activeHighlight.explanation}</p>
                {activeHighlight.rewrites && activeHighlight.rewrites.length > 0 && (
                  <div>
                    <p className="text-caption font-button text-ink-muted mb-xxs">Gợi ý sửa:</p>
                    {activeHighlight.rewrites.map((rw, i) => (
                      <p key={i} className="text-body-sm text-accent-green ml-sm">→ {rw}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Upgraded Rewrites */}
          {evaluation.upgradedRewrites && evaluation.upgradedRewrites.length > 0 && (
            <div className="bg-surface rounded-lg border border-hairline p-xl mb-lg">
              <h4 className="font-button text-body-md text-ink mb-md flex items-center gap-xs">
                <Sparkles size={16} className="text-primary" /> Nâng band — Viết lại nổi bật
              </h4>
              <div className="space-y-md">
                {evaluation.upgradedRewrites.map((ur, idx) => (
                  <div key={idx} className="p-md bg-canvas-soft rounded-lg">
                    <div className="flex items-start gap-sm mb-sm">
                      <span className="text-body-sm text-error line-through">{ur.original}</span>
                    </div>
                    <div className="flex items-start gap-sm mb-sm">
                      <ArrowRight size={14} className="text-accent-green mt-1 shrink-0" />
                      <span className="text-body-sm text-accent-green font-button">{ur.upgraded}</span>
                    </div>
                    <p className="text-caption text-ink-muted">{ur.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Practice screen ──
  if (phase === 'practice') {
    const wc = countWords(essay);

    return (
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-canvas-soft">
        {/* Left panel — prompt, outline, vocab, timer */}
        <div className={`${showSidebar ? 'w-full md:w-[380px]' : 'w-0 md:w-0'} transition-all duration-300 overflow-hidden border-r border-hairline bg-surface flex flex-col`}>
          <div className="flex-1 overflow-y-auto p-lg">
            {/* Timer */}
            <div className="flex items-center justify-between mb-lg">
              <div className="flex items-center gap-xs">
                <Clock size={20} className={timeLeft <= 300 ? 'text-error' : 'text-primary'} />
                <span className={`text-heading-3 font-heading-3 tabular-nums ${timeLeft <= 300 ? 'text-error' : 'text-primary'}`}>
                  {formatTime(timeLeft)}
                </span>
              </div>
              <span className="text-caption text-ink-muted">
                Task {taskType} • Band {bandTarget}
              </span>
            </div>

            {/* Prompt */}
            <div className="mb-lg">
              <h4 className="font-button text-body-sm text-ink-muted uppercase tracking-wider mb-sm">Đề bài</h4>
              <p className="text-body-md text-ink leading-relaxed whitespace-pre-wrap mb-md">{writingPrompt}</p>
              {taskType === '1' && <WritingVisual visuals={visuals} />}
            </div>

            {/* Outline */}
            {outline.length > 0 && (
              <div className="mb-lg">
                <h4 className="font-button text-body-sm text-ink-muted uppercase tracking-wider mb-sm flex items-center gap-xs">
                  <Lightbulb size={14} /> Outline gợi ý
                </h4>
                <ul className="space-y-xxs">
                  {outline.map((item, i) => (
                    <li key={i} className="text-body-sm text-ink-secondary flex items-start gap-xs">
                      <span className="text-primary font-button">{i + 1}.</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggested vocab */}
            {suggestedVocab.length > 0 && (
              <div className="mb-lg">
                <h4 className="font-button text-body-sm text-ink-muted uppercase tracking-wider mb-sm">Từ vựng gợi ý</h4>
                <div className="flex flex-wrap gap-xxs">
                  {suggestedVocab.map((v, i) => (
                    <span key={i} className="inline-block px-sm py-xxs bg-canvas-soft rounded-full text-caption text-ink-secondary border border-hairline">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tips */}
            {tips && (
              <div className="p-md bg-primary/5 rounded-lg border border-primary/10">
                <p className="text-body-sm text-ink-secondary">{tips}</p>
              </div>
            )}
          </div>
        </div>

        {/* Toggle sidebar button (mobile) */}
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="md:hidden fixed bottom-20 left-2 z-30 bg-surface border border-hairline rounded-full p-2 shadow-sm"
        >
          {showSidebar ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>

        {/* Right panel — editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Editor toolbar */}
          <div className="flex items-center justify-between px-lg py-sm border-b border-hairline bg-surface shrink-0">
            <div className="flex items-center gap-md">
              <button
                onClick={handleReset}
                className="flex items-center gap-xs text-body-sm text-error hover:underline"
              >
                <X size={14} /> Thoát
              </button>
              <div className="w-px h-4 bg-hairline hidden md:block"></div>
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="hidden md:flex items-center gap-xs text-body-sm text-ink-muted hover:text-ink"
              >
                {showSidebar ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                {showSidebar ? 'Ẩn đề' : 'Hiện đề'}
              </button>
              <span className="text-body-sm text-ink-muted tabular-nums">{wc} từ</span>
            </div>
            <div className="flex items-center gap-sm">
              {isTimedOut && (
                <span className="text-caption text-error font-button flex items-center gap-xxs">
                  <AlertCircle size={14} /> Hết giờ
                </span>
              )}
              <button
                onClick={handleSubmitEssay}
                disabled={submitting || !essay.trim()}
                className="bg-primary text-on-primary px-lg py-xs rounded-full font-button text-button hover:bg-primary-active transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-xs"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Nộp bài
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-lg mt-sm p-sm bg-error/10 text-error text-body-sm rounded-lg flex items-center gap-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {/* Textarea */}
          <div className="flex-1 overflow-y-auto p-lg">
            <textarea
              ref={editorRef}
              value={essay}
              onChange={e => { setEssay(e.target.value); setError(''); }}
              disabled={isTimedOut}
              placeholder={isTimedOut ? 'Hết giờ. Bấm "Nộp bài" để chấm điểm.' : 'Bắt đầu viết bài của bạn ở đây...'}
              className="w-full h-full min-h-[400px] resize-none bg-transparent text-body-md font-body-md text-ink leading-relaxed focus:outline-none placeholder:text-ink-faint disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Setup screen (default) ──
  return (
    <div className="flex-1 overflow-y-auto bg-canvas-soft">
      <div className="max-w-3xl mx-auto px-md md:px-xxl py-xl">
        <h1 className="text-heading-2 font-heading-2 text-ink mb-xs">Luyện viết</h1>
        <p className="text-body-md text-ink-secondary mb-xl">
          Chọn chế độ luyện tập phù hợp với mục tiêu của bạn.
        </p>

        {/* Mode selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-xl">
          {/* Sentence mode */}
          <button
            onClick={() => setMode('sentence')}
            className="bg-surface rounded-lg border border-hairline p-xl text-left hover:shadow-sm transition-shadow group"
          >
            <div className="flex items-center gap-sm mb-md">
              <div className="w-10 h-10 rounded-lg bg-accent-teal/10 flex items-center justify-center group-hover:bg-accent-teal/20 transition-colors">
                <BookOpen size={20} className="text-accent-teal" />
              </div>
              <h3 className="text-heading-3 font-heading-3 text-ink">Viết câu mẫu</h3>
            </div>
            <p className="text-body-sm text-ink-muted">
              Luyện gõ lại câu ví dụ từ từ vựng hiện có. Không cần AI, không tốn token.
            </p>
            <div className="mt-md flex items-center gap-xxs text-primary font-button text-body-sm">
              Bắt đầu <ChevronRight size={14} />
            </div>
          </button>

          {/* AI Writing mode */}
          <button
            onClick={() => setMode('ai')}
            className="bg-surface rounded-lg border border-hairline p-xl text-left hover:shadow-sm transition-shadow group"
          >
            <div className="flex items-center gap-sm mb-md">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Sparkles size={20} className="text-primary" />
              </div>
              <h3 className="text-heading-3 font-heading-3 text-ink">Luyện viết với AI</h3>
            </div>
            <p className="text-body-sm text-ink-muted">
              Mô phỏng IELTS Writing Task 1/2. AI tạo đề, chấm bài theo tiêu chí Cambridge.
            </p>
            <div className="mt-md flex items-center gap-xxs text-primary font-button text-body-sm">
              Thiết lập <ChevronRight size={14} />
            </div>
          </button>
        </div>

        {/* AI Setup form — only shown when mode === 'ai' */}
        {mode === 'ai' && (
          <div className="bg-surface rounded-lg border border-hairline p-xl animate-[fadeIn_0.2s_ease-out]">
            <h3 className="text-heading-3 font-heading-3 text-ink mb-lg">Thiết lập bài viết</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-md mb-lg">
              {/* Task type */}
              <div>
                <label className="block text-body-sm font-button text-ink-muted mb-xs">Loại bài</label>
                <div className="flex gap-xs">
                  {['1', '2'].map(t => (
                    <button
                      key={t}
                      onClick={() => setTaskType(t)}
                      className={`flex-1 py-sm rounded-[8px] font-button text-button border transition-colors ${
                        taskType === t ? 'bg-primary text-on-primary border-primary' : 'bg-surface border-hairline text-ink hover:bg-canvas-soft'
                      }`}
                    >
                      Task {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Band target */}
              <div>
                <label className="block text-body-sm font-button text-ink-muted mb-xs">Mục tiêu Band</label>
                <select
                  value={bandTarget}
                  onChange={e => setBandTarget(parseFloat(e.target.value))}
                  className="w-full px-md py-sm bg-surface border border-hairline rounded-[8px] font-body-md text-body-md text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {[5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0].map(b => (
                    <option key={b} value={b}>Band {b}</option>
                  ))}
                </select>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-body-sm font-button text-ink-muted mb-xs">Thời gian</label>
                <div className="flex gap-xs">
                  {[20, 40].map(d => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`flex-1 py-sm rounded-[8px] font-button text-button border transition-colors ${
                        duration === d ? 'bg-primary text-on-primary border-primary' : 'bg-surface border-hairline text-ink hover:bg-canvas-soft'
                      }`}
                    >
                      {d} phút
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Custom prompt */}
            <div className="mb-lg">
              <label className="block text-body-sm font-button text-ink-muted mb-xs">Đề bài</label>
              <textarea
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                rows={4}
                placeholder="Nhập đề IELTS Writing hoặc bấm nút tạo đề ngẫu nhiên bên dưới..."
                className="w-full px-md py-sm bg-canvas border border-hairline rounded-[8px] font-body-md text-body-md text-ink focus:outline-none focus:ring-2 focus:ring-primary resize-none placeholder:text-ink-faint"
              />
              <button
                onClick={handleGeneratePrompt}
                disabled={generatingPrompt}
                className="mt-sm flex items-center gap-xs text-primary font-button text-body-sm hover:underline disabled:opacity-50"
              >
                {generatingPrompt ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {generatingPrompt ? 'Đang tạo đề...' : 'Tạo đề ngẫu nhiên'}
              </button>
            </div>

            {/* Info */}
            <div className="bg-canvas-soft rounded-lg p-md mb-lg">
              <p className="text-body-sm text-ink-muted">
                <span className="font-button text-ink">Chủ đề:</span> {currentTopic?.name || 'Chưa chọn'} •{' '}
                <span className="font-button text-ink">Từ vựng:</span> {topicWords.length} từ
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="p-sm bg-error/10 text-error text-body-sm rounded-lg flex items-center gap-xs mb-md">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* Start button */}
            <button
              onClick={handleStartPractice}
              disabled={!customPrompt.trim()}
              className="w-full bg-primary text-on-primary px-lg py-sm rounded-full font-button text-button hover:bg-primary-active transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-xs"
            >
              <PenLine size={18} /> Bắt đầu viết
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Highlight rendering helper ──────────────────────────────

function renderHighlightedEssay(essay, highlights, activeHighlight, setActiveHighlight) {
  if (!highlights || highlights.length === 0) {
    return <span>{essay}</span>;
  }

  // Find all highlight positions by text matching
  const segments = [];
  let lastEnd = 0;

  // Sort highlights by their position in the essay
  const positioned = highlights
    .map(h => {
      const idx = essay.indexOf(h.text, lastEnd > 0 ? Math.max(0, lastEnd - 50) : 0);
      if (idx === -1) {
        // try from start
        const fallbackIdx = essay.indexOf(h.text);
        return fallbackIdx !== -1 ? { ...h, start: fallbackIdx, end: fallbackIdx + h.text.length } : null;
      }
      return { ...h, start: idx, end: idx + h.text.length };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  // Remove overlapping highlights
  const nonOverlapping = [];
  let maxEnd = 0;
  for (const h of positioned) {
    if (h.start >= maxEnd) {
      nonOverlapping.push(h);
      maxEnd = h.end;
    }
  }

  let cursor = 0;
  for (const h of nonOverlapping) {
    if (h.start > cursor) {
      segments.push({ type: 'text', content: essay.slice(cursor, h.start) });
    }
    segments.push({ type: 'highlight', content: essay.slice(h.start, h.end), highlight: h });
    cursor = h.end;
  }
  if (cursor < essay.length) {
    segments.push({ type: 'text', content: essay.slice(cursor) });
  }

  return segments.map((seg, i) => {
    if (seg.type === 'text') return <span key={i}>{seg.content}</span>;

    const isGrammarOrLexical = seg.highlight.type === 'grammar' || seg.highlight.type === 'lexical';
    const isActive = activeHighlight && activeHighlight.text === seg.highlight.text;

    return (
      <span
        key={i}
        onClick={() => setActiveHighlight(isActive ? null : seg.highlight)}
        className={`cursor-pointer border-b-2 transition-colors ${
          isGrammarOrLexical
            ? 'bg-error/10 border-error hover:bg-error/20'
            : 'bg-accent-orange/10 border-accent-orange hover:bg-accent-orange/20'
        } ${isActive ? 'ring-2 ring-primary/30 rounded-sm' : ''}`}
      >
        {seg.content}
      </span>
    );
  });
}
