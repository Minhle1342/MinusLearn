import React, { useState, useEffect, useMemo } from 'react';
import { Volume2, RotateCcw, BookOpen, Brain, CheckCircle2, Clock, Sparkles, ChevronRight } from 'lucide-react';
import {
  calculateSM2,
  previewInterval,
  formatInterval,
  getDueWords,
  getNextDueDate,
  initSRState,
  recordReview,
} from '../../utils/spacedRepetition';
import { speakEnglishText } from '../../utils/speech';

export function SpacedReview({ words, activeTopicId, topics, srData, setSrData, settings }) {
  const [phase, setPhase] = useState('setup'); // 'setup' | 'reviewing' | 'summary'
  const [reviewQueue, setReviewQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionResults, setSessionResults] = useState([]); // [{ wordId, quality, word }]

  const topicWords = useMemo(() => words.filter(w => w.topicId === activeTopicId), [words, activeTopicId]);
  const currentTopic = topics.find(t => t.id === activeTopicId);

  // Stats
  const stats = useMemo(() => {
    const wordIds = topicWords.map(w => w.id);
    const { dueWords, newWords, learnedWords } = getDueWords(srData, wordIds);
    return {
      total: wordIds.length,
      due: dueWords.length,
      newCount: newWords.length,
      learned: learnedWords.length,
      dueIds: [...dueWords, ...newWords], // both due and new are reviewable
    };
  }, [topicWords, srData]);

  // Reset when topic changes
  useEffect(() => {
    setPhase('setup');
    setReviewQueue([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionResults([]);
  }, [activeTopicId]);

  const speak = (text) => {
    speakEnglishText(text, settings?.speechVoiceURI, { rate: 0.9 });
  };

  // --- Phase: SETUP ---
  const handleStartReview = () => {
    if (stats.dueIds.length === 0) return;

    // Shuffle due words
    const shuffled = [...stats.dueIds].sort(() => 0.5 - Math.random());
    // Find the actual word objects
    const queue = shuffled
      .map(id => topicWords.find(w => w.id === id))
      .filter(Boolean);

    setReviewQueue(queue);
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionResults([]);
    setPhase('reviewing');
  };

  // --- Phase: REVIEWING ---
  const currentWord = reviewQueue[currentIndex];
  const currentSR = currentWord ? { ...initSRState(), ...(srData[currentWord.id] || {}) } : initSRState();

  const handleFlip = () => {
    setIsFlipped(true);
  };

  const handleRate = (quality) => {
    if (!currentWord) return;

    // Calculate new SR state
    const newState = calculateSM2(
      quality,
      currentSR.repetition,
      currentSR.efactor,
      currentSR.interval
    );

    // Persist to srData
    setSrData(prev => ({
      ...prev,
      [currentWord.id]: recordReview(prev[currentWord.id], newState),
    }));

    // Record session result
    setSessionResults(prev => [...prev, {
      wordId: currentWord.id,
      word: currentWord.word,
      meaning: currentWord.meaning,
      quality,
      newInterval: newState.interval,
    }]);

    // Move to next or finish
    if (currentIndex + 1 < reviewQueue.length) {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    } else {
      setPhase('summary');
    }
  };

  // Preview intervals for the 4 rating buttons
  const previewIntervals = useMemo(() => {
    if (!currentWord) return {};
    return {
      0: previewInterval(0, currentSR.repetition, currentSR.efactor, currentSR.interval),
      3: previewInterval(3, currentSR.repetition, currentSR.efactor, currentSR.interval),
      4: previewInterval(4, currentSR.repetition, currentSR.efactor, currentSR.interval),
      5: previewInterval(5, currentSR.repetition, currentSR.efactor, currentSR.interval),
    };
  }, [currentWord, currentSR]);

  // --- Phase: SUMMARY ---
  const summaryStats = useMemo(() => {
    const forgot = sessionResults.filter(r => r.quality < 3);
    const hard = sessionResults.filter(r => r.quality === 3);
    const good = sessionResults.filter(r => r.quality === 4);
    const easy = sessionResults.filter(r => r.quality === 5);
    return { forgot, hard, good, easy, total: sessionResults.length };
  }, [sessionResults]);

  // Next due date for the "all done" message
  const nextDueDate = useMemo(() => {
    const wordIds = topicWords.map(w => w.id);
    return getNextDueDate(srData, wordIds);
  }, [topicWords, srData, phase]);

  const formatCountdown = (timestamp) => {
    if (!timestamp) return '';
    const diff = timestamp - Date.now();
    if (diff <= 0) return 'Ngay bây giờ';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days} ngày ${hours % 24} giờ nữa`;
    }
    return `${hours} giờ ${minutes} phút nữa`;
  };

  // ==================== RENDER ====================

  if (!activeTopicId || topicWords.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-xl">
        <div className="text-center max-w-md flex flex-col items-center">
          <div className="w-24 h-24 mb-md rounded-full bg-surface-container-low flex items-center justify-center">
            <BookOpen size={48} className="text-primary" />
          </div>
          <h2 className="font-heading-2 text-heading-2 text-ink mb-sm">Chưa có từ vựng</h2>
          <p className="text-body-md text-on-surface-variant">
            Hãy chọn một chủ đề có từ vựng ở thanh bên trái để bắt đầu ôn tập.
          </p>
        </div>
      </div>
    );
  }

  // ===== SETUP PHASE =====
  if (phase === 'setup') {
    return (
      <div className="flex-1 flex items-center justify-center p-lg md:p-xl">
        <div className="bg-surface border border-hairline rounded-[16px] p-[40px] shadow-sm max-w-lg w-full flex flex-col items-center text-center">
          {/* Header */}
          <div className="text-center mb-xl">
            <div className="inline-flex items-center gap-xs px-md py-xs bg-primary/10 text-primary rounded-full font-button text-button mb-md">
              <Brain size={16} />
              <span>Spaced Repetition</span>
            </div>
            <h2 className="font-heading-1 text-heading-1 text-ink mb-xs">
              Tổng ôn: {currentTopic?.name}
            </h2>
            <p className="text-body-md text-on-surface-variant">
              Hệ thống sẽ tự điều chỉnh lịch ôn tập phù hợp với mức ghi nhớ của bạn.
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-md mb-xl">
            <div className="bg-surface border border-hairline rounded-[12px] p-lg flex flex-col items-center gap-xs">
              <BookOpen size={20} className="text-on-surface-variant" />
              <span className="font-heading-2 text-heading-2 text-ink">{stats.total}</span>
              <span className="text-body-sm text-on-surface-variant">Tổng từ vựng</span>
            </div>
            <div className="bg-surface border border-hairline rounded-[12px] p-lg flex flex-col items-center gap-xs">
              <Clock size={20} className="text-red-500" />
              <span className="font-heading-2 text-heading-2 text-red-600">{stats.due}</span>
              <span className="text-body-sm text-on-surface-variant">Cần ôn lại</span>
            </div>
            <div className="bg-surface border border-hairline rounded-[12px] p-lg flex flex-col items-center gap-xs">
              <Sparkles size={20} className="text-amber-500" />
              <span className="font-heading-2 text-heading-2 text-amber-600">{stats.newCount}</span>
              <span className="text-body-sm text-on-surface-variant">Từ mới</span>
            </div>
            <div className="bg-surface border border-hairline rounded-[12px] p-lg flex flex-col items-center gap-xs">
              <CheckCircle2 size={20} className="text-green-500" />
              <span className="font-heading-2 text-heading-2 text-green-600">{stats.learned}</span>
              <span className="text-body-sm text-on-surface-variant">Đã thuộc</span>
            </div>
          </div>

          {/* CTA */}
          {stats.dueIds.length > 0 ? (
            <button
              onClick={handleStartReview}
              className="w-full bg-primary text-on-primary py-md rounded-full font-button text-button hover:bg-primary-active transition-colors shadow-sm flex items-center justify-center gap-sm"
            >
              <Brain size={20} />
              Bắt đầu ôn tập ({stats.dueIds.length} từ)
              <ChevronRight size={18} />
            </button>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-[12px] p-lg text-center">
              <div className="text-4xl mb-sm">🎉</div>
              <p className="font-heading-3 text-heading-3 text-green-700 mb-xs">
                Bạn đã ôn hết rồi!
              </p>
              {nextDueDate && (
                <p className="text-body-sm text-green-600">
                  Lần ôn tiếp theo: {formatCountdown(nextDueDate)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== REVIEWING PHASE =====
  if (phase === 'reviewing' && currentWord) {
    const progress = ((currentIndex + 1) / reviewQueue.length) * 100;

    return (
      <div className="flex-1 flex flex-col items-center p-lg md:p-xl">
        {/* Progress bar */}
        <div className="w-full max-w-xl mb-lg">
          <div className="flex justify-between items-center mb-xs">
            <span className="text-body-sm text-on-surface-variant font-medium">
              {currentIndex + 1} / {reviewQueue.length}
            </span>
            <button
              onClick={() => { setPhase('setup'); }}
              className="text-body-sm text-on-surface-variant hover:text-ink transition-colors"
            >
              Thoát
            </button>
          </div>
          <div className="w-full h-[6px] bg-surface-container-low rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Flashcard */}
        <div className="w-full max-w-xl flex-1 flex flex-col">
          <div className="bg-surface border border-hairline rounded-[12px] shadow-sm flex-1 flex flex-col overflow-hidden">
            {/* Front face — always visible */}
            <div className="flex-1 flex flex-col items-center justify-center p-xl text-center">
              {/* Image */}
              {currentWord.imageUrl && (
                <div className="w-32 h-32 mb-lg rounded-[12px] overflow-hidden border border-hairline">
                  <img src={currentWord.imageUrl} alt={currentWord.word} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </div>
              )}

              {/* Word */}
              <h2 className="font-display-2 text-display-2 text-ink mb-xs">
                {currentWord.word}
              </h2>

              {/* Phonetic */}
              {currentWord.phonetic && (
                <p className="text-body-md text-on-surface-variant mb-md">
                  {currentWord.phonetic}
                </p>
              )}

              {/* Speak button */}
              <button
                onClick={() => speak(currentWord.word)}
                className="p-sm rounded-full bg-surface-container-low hover:bg-surface-container transition-colors mb-lg"
                title="Phát âm"
              >
                <Volume2 size={24} className="text-primary" />
              </button>

              {/* Back face — revealed on flip */}
              {isFlipped && (
                <div className="w-full border-t border-hairline pt-lg mt-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <p className="font-heading-2 text-heading-2 text-ink mb-sm">
                    {currentWord.meaning}
                  </p>
                  {currentWord.example && (
                    <p className="text-body-md text-on-surface-variant italic">
                      "{currentWord.example}"
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Action area */}
            <div className="p-lg border-t border-hairline bg-canvas-soft">
              {!isFlipped ? (
                <button
                  onClick={handleFlip}
                  className="w-full bg-primary text-on-primary py-sm rounded-full font-button text-button hover:bg-primary-active transition-colors"
                >
                  Hiển thị nghĩa
                </button>
              ) : (
                <div className="flex flex-col gap-sm">
                  <p className="text-body-sm text-on-surface-variant text-center mb-xs">
                    Bạn nhớ từ này tốt không?
                  </p>
                  <div className="grid grid-cols-4 gap-sm">
                    {/* Quên (q=0) */}
                    <button
                      onClick={() => handleRate(0)}
                      className="flex flex-col items-center gap-xs py-sm px-xs rounded-[8px] border border-red-200 bg-red-50 hover:bg-red-100 transition-colors"
                    >
                      <span className="text-body-sm font-semibold text-red-600">Quên</span>
                      <span className="text-caption text-red-400">{formatInterval(previewIntervals[0])}</span>
                    </button>
                    {/* Khó (q=3) */}
                    <button
                      onClick={() => handleRate(3)}
                      className="flex flex-col items-center gap-xs py-sm px-xs rounded-[8px] border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors"
                    >
                      <span className="text-body-sm font-semibold text-amber-600">Khó</span>
                      <span className="text-caption text-amber-400">{formatInterval(previewIntervals[3])}</span>
                    </button>
                    {/* Tốt (q=4) */}
                    <button
                      onClick={() => handleRate(4)}
                      className="flex flex-col items-center gap-xs py-sm px-xs rounded-[8px] border border-green-200 bg-green-50 hover:bg-green-100 transition-colors"
                    >
                      <span className="text-body-sm font-semibold text-green-600">Tốt</span>
                      <span className="text-caption text-green-400">{formatInterval(previewIntervals[4])}</span>
                    </button>
                    {/* Dễ (q=5) */}
                    <button
                      onClick={() => handleRate(5)}
                      className="flex flex-col items-center gap-xs py-sm px-xs rounded-[8px] border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <span className="text-body-sm font-semibold text-blue-600">Dễ</span>
                      <span className="text-caption text-blue-400">{formatInterval(previewIntervals[5])}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== SUMMARY PHASE =====
  if (phase === 'summary') {
    const barMax = summaryStats.total || 1;

    return (
      <div className="flex-1 flex items-center justify-center p-lg md:p-xl">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="text-center mb-xl">
            <div className="text-5xl mb-md">
              {summaryStats.forgot.length === 0 ? '🏆' : '📊'}
            </div>
            <h2 className="font-heading-1 text-heading-1 text-ink mb-xs">
              Phiên ôn hoàn tất!
            </h2>
            <p className="text-body-md text-on-surface-variant">
              Bạn đã ôn {summaryStats.total} từ vựng trong phiên này.
            </p>
          </div>

          {/* Distribution bars */}
          <div className="bg-surface border border-hairline rounded-[12px] p-lg mb-lg">
            <h3 className="font-heading-3 text-heading-3 text-ink mb-md">Phân bổ kết quả</h3>
            <div className="flex flex-col gap-md">
              {[
                { label: 'Quên', count: summaryStats.forgot.length, color: 'bg-red-500', textColor: 'text-red-600' },
                { label: 'Khó', count: summaryStats.hard.length, color: 'bg-amber-500', textColor: 'text-amber-600' },
                { label: 'Tốt', count: summaryStats.good.length, color: 'bg-green-500', textColor: 'text-green-600' },
                { label: 'Dễ', count: summaryStats.easy.length, color: 'bg-blue-500', textColor: 'text-blue-600' },
              ].map(({ label, count, color, textColor }) => (
                <div key={label} className="flex items-center gap-sm">
                  <span className={`w-12 text-body-sm font-semibold ${textColor}`}>{label}</span>
                  <div className="flex-1 h-[8px] bg-surface-container-low rounded-full overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-full transition-all duration-700`}
                      style={{ width: `${(count / barMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-body-sm text-on-surface-variant font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Forgot words list */}
          {summaryStats.forgot.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-[12px] p-lg mb-lg">
              <h3 className="font-heading-3 text-heading-3 text-red-700 mb-sm">
                Từ cần ôn lại ({summaryStats.forgot.length})
              </h3>
              <p className="text-body-sm text-red-500 mb-md">
                Những từ này sẽ xuất hiện lại vào ngày mai.
              </p>
              <div className="flex flex-wrap gap-sm">
                {summaryStats.forgot.map(r => (
                  <span
                    key={r.wordId}
                    className="px-sm py-xs bg-white border border-red-200 rounded-full text-body-sm text-red-700 font-medium"
                  >
                    {r.word}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-md">
            <button
              onClick={() => setPhase('setup')}
              className="flex-1 py-sm border border-hairline rounded-full font-button text-button text-on-surface hover:bg-surface-container-lowest transition-colors flex items-center justify-center gap-xs"
            >
              <RotateCcw size={16} />
              Quay lại
            </button>

            {/* If there are still due words, offer to continue */}
            {stats.dueIds.length > 0 && (
              <button
                onClick={handleStartReview}
                className="flex-1 py-sm bg-primary text-on-primary rounded-full font-button text-button hover:bg-primary-active transition-colors flex items-center justify-center gap-xs"
              >
                <Brain size={16} />
                Ôn tiếp
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
