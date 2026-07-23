import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { speakEnglishText } from '../../utils/speech';
import { Volume2, RotateCcw, Trophy, CheckCircle2, XCircle, ArrowRight, Sparkles, HelpCircle } from 'lucide-react';

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const CARD_SUITS = ['♠', '♥', '♦', '♣', '♠'];

export function WordGuessQuiz({ words, allWords = [], settings, onAddWord }) {
  const [questionList, setQuestionList] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState([]);
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // Initialize quiz question list
  const initQuiz = useCallback(() => {
    if (!words || words.length === 0) {
      setQuestionList([]);
      return;
    }

    const shuffled = shuffleArray(words);
    setQuestionList(shuffled);
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setSelectedOptionId(null);
    setIsAnswered(false);
    setIsCompleted(false);
  }, [words]);

  useEffect(() => {
    initQuiz();
  }, [initQuiz]);

  const currentWord = questionList[currentIndex];

  // Generate 5 options (1 correct + 4 wrong distractors)
  useEffect(() => {
    if (!currentWord) return;

    // Pick 4 wrong options from allWords or words
    const pool = (allWords && allWords.length >= 5 ? allWords : words).filter(w => w.id !== currentWord.id);
    const shuffledPool = shuffleArray(pool);
    const distractors = shuffledPool.slice(0, 4);

    // If pool has fewer than 4 items, add fallback dummy distractors
    while (distractors.length < 4) {
      distractors.push({
        id: `dummy-${distractors.length}`,
        word: `Dummy ${distractors.length + 1}`,
        meaning: `Nghĩa giả định ${distractors.length + 1}`
      });
    }

    const allOptions = shuffleArray([
      { id: currentWord.id, meaning: currentWord.meaning, isCorrect: true },
      ...distractors.map(d => ({ id: d.id, meaning: d.meaning, isCorrect: false }))
    ]);

    setOptions(allOptions);
    setSelectedOptionId(null);
    setIsAnswered(false);

    // Auto pronounce word on question change
    if (currentWord.word) {
      speakEnglishText(currentWord.word, settings?.speechVoiceURI);
    }
  }, [currentWord, allWords, words, settings?.speechVoiceURI]);

  // Handle option selection
  const handleSelectOption = (option) => {
    if (isAnswered) return;

    setSelectedOptionId(option.id);
    setIsAnswered(true);

    if (option.isCorrect) {
      setScore(prev => prev + 1);
      setStreak(prev => {
        const nextStreak = prev + 1;
        setMaxStreak(m => Math.max(m, nextStreak));
        return nextStreak;
      });
    } else {
      setStreak(0);
    }
  };

  // Move to next question
  const handleNextQuestion = () => {
    if (currentIndex + 1 < questionList.length) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsCompleted(true);
    }
  };

  const speak = (e) => {
    e?.stopPropagation();
    if (currentWord?.word) {
      speakEnglishText(currentWord.word, settings?.speechVoiceURI);
    }
  };

  if (!words || words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-xxl text-center mt-12">
        <div className="w-20 h-20 mb-md rounded-full bg-surface-container-low flex items-center justify-center">
          <HelpCircle size={40} className="text-primary" />
        </div>
        <h3 className="font-heading-1 text-heading-1 text-on-surface mb-xs">Chưa có từ vựng để đoán</h3>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md mb-lg">
          Hãy thêm từ vựng vào bộ sưu tập để tham gia trò chơi Quiz Đoán từ.
        </p>
        {onAddWord && (
          <button
            onClick={onAddWord}
            className="bg-primary text-on-primary px-lg py-sm rounded-full font-button text-button hover:bg-primary-active transition-colors shadow-sm"
          >
            Thêm từ vựng mới
          </button>
        )}
      </div>
    );
  }

  // Fanned card layout parameters for 5 cards held like a hand fan
  const FAN_CARDS_CONFIG = [
    { rotate: -22, translateY: 19, translateX: 14, zIndex: 10 },
    { rotate: -11, translateY: 9,  translateX: 6,  zIndex: 11 },
    { rotate: 0,   translateY: 3,  translateX: 0,  zIndex: 12 },
    { rotate: 11,  translateY: 9,  translateX: -6, zIndex: 13 },
    { rotate: 22,  translateY: 19, translateX: -14, zIndex: 14 }
  ];

  return (
    <div className="flex flex-col max-w-4xl mx-auto w-full p-md md:p-lg gap-lg items-center">
      {/* Quiz Header */}
      <div className="w-full bg-surface border border-hairline rounded-[16px] p-md shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-sm">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-lg">
            🃏
          </div>
          <div>
            <h2 className="font-title text-title text-on-surface">Quiz Đoán Từ</h2>
            <p className="text-xs text-on-surface-variant">
              Câu {currentIndex + 1} / {questionList.length}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-md">
          <div className="flex items-center gap-xs text-sm font-medium px-md py-1.5 bg-surface-container rounded-full border border-hairline">
            <span className="text-emerald-600 dark:text-emerald-400">Điểm: {score}</span>
            <span className="text-on-surface-variant">|</span>
            <span className="text-amber-500 flex items-center gap-1">
              🔥 {streak}
            </span>
          </div>

          <button
            onClick={initQuiz}
            className="p-2 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
            title="Chơi lại từ đầu"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {/* Completion View */}
      {isCompleted ? (
        <div className="bg-surface border border-hairline rounded-[20px] p-xxl shadow-md text-center flex flex-col items-center gap-md my-md animate-fade-in w-full max-w-md">
          <div className="w-20 h-20 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center mb-xs">
            <Trophy size={44} />
          </div>
          <h3 className="font-heading-1 text-2xl text-on-surface">Hoàn Thành Bài Quiz!</h3>
          <p className="text-on-surface-variant text-sm">
            Bạn đã xuất sắc vượt qua tất cả các thẻ bài đoán từ vựng.
          </p>

          <div className="grid grid-cols-2 gap-md w-full my-sm">
            <div className="bg-surface-container-low p-md rounded-xl border border-hairline flex flex-col items-center">
              <span className="text-xs text-on-surface-variant mb-1">Điểm số</span>
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{score} / {questionList.length}</span>
            </div>
            <div className="bg-surface-container-low p-md rounded-xl border border-hairline flex flex-col items-center">
              <span className="text-xs text-on-surface-variant mb-1">Chuỗi đúng cao nhất</span>
              <span className="text-2xl font-bold text-amber-500">🔥 {maxStreak}</span>
            </div>
          </div>

          <button
            onClick={initQuiz}
            className="mt-xs bg-primary text-on-primary px-xxl py-md rounded-full font-button text-button hover:bg-primary-active transition-colors shadow-md flex items-center gap-sm"
          >
            <RotateCcw size={18} />
            Chơi lại từ đầu
          </button>
        </div>
      ) : (
        <>
          {/* Center Target Word Display Card */}
          <div className="w-full bg-surface border border-hairline rounded-[24px] p-lg md:p-xl shadow-md text-center flex flex-col items-center justify-center gap-md relative overflow-hidden min-h-[180px]">
            <div className="absolute top-md left-md text-xs font-semibold text-primary uppercase tracking-wider bg-primary/10 px-3 py-1 rounded-full">
              Từ vựng cần đoán
            </div>

            <div className="flex items-center gap-sm mt-2">
              <h3 className="font-title text-3xl md:text-4xl text-on-surface tracking-wide">
                {currentWord?.word}
              </h3>
              <button
                onClick={speak}
                className="w-10 h-10 rounded-full bg-surface-container-low hover:bg-surface-container text-primary flex items-center justify-center transition-colors shadow-sm"
                title="Phát âm"
              >
                <Volume2 size={20} />
              </button>
            </div>

            {currentWord?.phonetic && (
              <span className="font-mono text-sm px-3 py-1 bg-surface-container text-on-surface-variant rounded-md">
                {currentWord.phonetic}
              </span>
            )}

            <p className="text-xs text-on-surface-variant italic">
              Hãy chọn lá bài có bản dịch chính xác nhất ở bên dưới:
            </p>

            {isAnswered && (
              <button
                onClick={handleNextQuestion}
                className="mt-xs bg-primary text-on-primary px-xl py-sm rounded-full font-button text-button hover:bg-primary-active transition-all shadow-md flex items-center gap-xs animate-bounce"
              >
                <span>Câu tiếp theo</span>
                <ArrowRight size={18} />
              </button>
            )}
          </div>

          {/* Playing Cards Hand (Lá Bài Xòe Hình Quạt Tay) */}
          <div className="w-full flex flex-col items-center justify-end min-h-[350px] pt-md pb-xl relative overflow-visible">
            <div className="flex items-center justify-center relative max-w-full px-md">
              {options.map((option, idx) => {
                const suit = CARD_SUITS[idx % CARD_SUITS.length];
                const isRedSuit = suit === '♥' || suit === '♦';
                const isSelected = selectedOptionId === option.id;
                const isCorrectOption = option.isCorrect;
                const fanConfig = FAN_CARDS_CONFIG[idx] || { rotate: 0, translateY: 0, translateX: 0, zIndex: idx };

                // Card state styling
                let borderStyle = 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100';
                let glowStyle = '';

                if (isAnswered) {
                  if (isCorrectOption) {
                    borderStyle = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 ring-4 ring-emerald-500/40';
                    glowStyle = 'shadow-[0_0_30px_rgba(16,185,129,0.6)] !z-50 !scale-110 !-translate-y-12 !rotate-0';
                  } else if (isSelected && !isCorrectOption) {
                    borderStyle = 'border-rose-500 bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 ring-4 ring-rose-500/40';
                    glowStyle = 'shadow-[0_0_25px_rgba(244,63,94,0.5)] !z-40 !scale-105 !-translate-y-6';
                  } else {
                    borderStyle = 'border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40 text-slate-400 opacity-40';
                  }
                }

                const baseTransform = `rotate(${fanConfig.rotate}deg) translateY(${fanConfig.translateY}px) translateX(${fanConfig.translateX}px)`;

                return (
                  <div
                    key={option.id}
                    onClick={() => handleSelectOption(option)}
                    style={{
                      transformOrigin: '50% 115%',
                      transform: isAnswered && (isCorrectOption || isSelected) ? undefined : baseTransform,
                      zIndex: isAnswered && (isCorrectOption || isSelected) ? (isCorrectOption ? 50 : 40) : fanConfig.zIndex
                    }}
                    className={`group relative w-28 sm:w-36 md:w-44 h-48 sm:h-56 md:h-64 rounded-2xl border-2 cursor-pointer transition-all duration-300 ease-out shadow-xl hover:shadow-2xl flex flex-col justify-between p-sm md:p-md select-none -mx-2 sm:-mx-4 md:-mx-6 hover:!rotate-0 hover:!-translate-y-14 hover:!scale-110 hover:!z-50 ${borderStyle} ${glowStyle}`}
                  >
                    {/* Top Left Card Index & Suit */}
                    <div className="flex flex-col items-start leading-none">
                      <span className={`font-mono text-xs md:text-sm font-bold ${isRedSuit ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}`}>
                        {idx + 1}
                      </span>
                      <span className={`text-xs md:text-base ${isRedSuit ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}`}>
                        {suit}
                      </span>
                    </div>

                    {/* Center Card Content (Bản dịch nghĩa) */}
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-xs z-10">
                      <p className="font-body-md text-xs sm:text-sm md:text-base font-semibold line-clamp-4 leading-tight">
                        {option.meaning}
                      </p>

                      {isAnswered && isCorrectOption && (
                        <div className="mt-2 text-emerald-500 flex items-center gap-1 text-xs font-bold animate-pulse">
                          <CheckCircle2 size={16} /> Đúng
                        </div>
                      )}
                      {isAnswered && isSelected && !isCorrectOption && (
                        <div className="mt-2 text-rose-500 flex items-center gap-1 text-xs font-bold">
                          <XCircle size={16} /> Sai
                        </div>
                      )}
                    </div>

                    {/* Bottom Right Inverted Card Index & Suit */}
                    <div className="flex flex-col items-end leading-none rotate-180">
                      <span className={`font-mono text-xs md:text-sm font-bold ${isRedSuit ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}`}>
                        {idx + 1}
                      </span>
                      <span className={`text-xs md:text-base ${isRedSuit ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}`}>
                        {suit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hand Grip Base */}
            <div className="w-24 h-5 bg-surface-container-high/60 border border-hairline rounded-t-full mt-3 flex items-center justify-center shadow-inner pointer-events-none">
              <div className="w-10 h-1 bg-on-surface-variant/20 rounded-full"></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
