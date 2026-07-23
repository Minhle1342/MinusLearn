import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { speakEnglishText } from '../../utils/speech';
import { Puzzle, RotateCcw, CheckCircle2, AlertCircle, Sparkles, Trophy, Award, ArrowRight } from 'lucide-react';

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function WordMatchingQuiz({ words, settings, onAddWord }) {
  const [rounds, setRounds] = useState([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [retryWordIds, setRetryWordIds] = useState(new Set());
  
  // Round items
  const [leftItems, setLeftItems] = useState([]);
  const [rightItems, setRightItems] = useState([]);
  
  // Selection & feedback state
  const [selectedItem, setSelectedItem] = useState(null); // { id, wordId, type, text }
  const [matchedIds, setMatchedIds] = useState(new Set());
  const [wrongPairIds, setWrongPairIds] = useState(null); // [id1, id2]
  const [isProcessing, setIsProcessing] = useState(false);

  // Statistics
  const [totalMatches, setTotalMatches] = useState(0);
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // Initialize game
  const initGame = useCallback(() => {
    if (!words || words.length === 0) {
      setRounds([]);
      return;
    }

    const shuffledWords = shuffleArray(words);
    const chunkSize = 5;
    const initialRounds = [];
    
    for (let i = 0; i < shuffledWords.length; i += chunkSize) {
      initialRounds.push(shuffledWords.slice(i, i + chunkSize));
    }

    setRounds(initialRounds);
    setCurrentRoundIndex(0);
    setRetryWordIds(new Set());
    setMatchedIds(new Set());
    setSelectedItem(null);
    setWrongPairIds(null);
    setTotalMatches(0);
    setTotalMistakes(0);
    setIsCompleted(false);
  }, [words]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // Prepare items for current round
  useEffect(() => {
    if (rounds.length === 0 || currentRoundIndex >= rounds.length) return;

    const currentWords = rounds[currentRoundIndex];
    if (!currentWords || currentWords.length === 0) return;

    const left = currentWords.map(w => ({
      id: `w-${w.id}`,
      wordId: w.id,
      type: 'word',
      text: w.word,
      phonetic: w.phonetic
    }));

    const right = currentWords.map(w => ({
      id: `m-${w.id}`,
      wordId: w.id,
      type: 'meaning',
      text: w.meaning
    }));

    setLeftItems(shuffleArray(left));
    setRightItems(shuffleArray(right));
    setMatchedIds(new Set());
    setSelectedItem(null);
    setWrongPairIds(null);
  }, [rounds, currentRoundIndex]);

  // Handle item click
  const handleItemClick = (item) => {
    if (isProcessing || matchedIds.has(item.id)) return;

    // Pronounce English word if word item clicked
    if (item.type === 'word') {
      speakEnglishText(item.text, settings?.speechVoiceURI);
    }

    // First selection
    if (!selectedItem) {
      setSelectedItem(item);
      return;
    }

    // Clicking the same item again -> unselect
    if (selectedItem.id === item.id) {
      setSelectedItem(null);
      return;
    }

    // Clicking same type (e.g. word -> word or meaning -> meaning) -> switch selection
    if (selectedItem.type === item.type) {
      setSelectedItem(item);
      return;
    }

    // Matching attempt between word and meaning
    setIsProcessing(true);

    if (selectedItem.wordId === item.wordId) {
      // SUCCESS MATCH!
      const newMatched = new Set(matchedIds);
      newMatched.add(selectedItem.id);
      newMatched.add(item.id);
      setMatchedIds(newMatched);
      setTotalMatches(prev => prev + 1);
      setSelectedItem(null);
      setIsProcessing(false);

      // Check if current round is complete
      const totalRoundItems = leftItems.length + rightItems.length;
      if (newMatched.size >= totalRoundItems) {
        setTimeout(() => {
          advanceToNextRound();
        }, 600);
      }
    } else {
      // WRONG MATCH!
      setWrongPairIds([selectedItem.id, item.id]);
      setTotalMistakes(prev => prev + 1);

      // Record incorrect wordId for retry round
      setRetryWordIds(prev => new Set(prev).add(selectedItem.wordId).add(item.wordId));

      setTimeout(() => {
        setWrongPairIds(null);
        setSelectedItem(null);
        setIsProcessing(false);
      }, 700);
    }
  };

  // Move to next round or create retry rounds if mistakes were made
  const advanceToNextRound = () => {
    if (currentRoundIndex + 1 < rounds.length) {
      setCurrentRoundIndex(prev => prev + 1);
    } else {
      // Reached the end of initial rounds. Check if there are retry words
      if (retryWordIds.size > 0) {
        const retryList = words.filter(w => retryWordIds.has(w.id));
        const shuffledRetry = shuffleArray(retryList);
        const chunkSize = 5;
        const newRetryRounds = [];

        for (let i = 0; i < shuffledRetry.length; i += chunkSize) {
          newRetryRounds.push(shuffledRetry.slice(i, i + chunkSize));
        }

        setRounds(prev => [...prev, ...newRetryRounds]);
        setRetryWordIds(new Set()); // Reset retry pool for upcoming rounds
        setCurrentRoundIndex(prev => prev + 1);
      } else {
        // Game completely finished!
        setIsCompleted(true);
      }
    }
  };

  if (!words || words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-xxl text-center mt-12">
        <div className="w-20 h-20 mb-md rounded-full bg-surface-container-low flex items-center justify-center">
          <Puzzle size={40} className="text-primary" />
        </div>
        <h3 className="font-heading-1 text-heading-1 text-on-surface mb-xs">Chưa có từ vựng để nối</h3>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md mb-lg">
          Hãy thêm ít nhất 2 từ vựng vào danh sách để tham gia trò chơi Quiz Nối từ.
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

  const currentWords = rounds[currentRoundIndex] || [];
  const isRetryRound = currentRoundIndex >= Math.ceil(words.length / 5);

  return (
    <div className="flex flex-col max-w-4xl mx-auto w-full p-md md:p-lg gap-md">
      {/* Header & Controls */}
      <div className="bg-surface border border-hairline rounded-[16px] p-md md:p-lg shadow-sm flex flex-col gap-sm">
        <div className="flex items-center justify-between flex-wrap gap-sm">
          <div className="flex items-center gap-sm">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Puzzle size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-title text-title text-on-surface">Quiz Nối Từ</h2>
                {isRetryRound && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <Sparkles size={12} /> Vòng Ôn Tập (Sửa Lỗi)
                  </span>
                )}
              </div>
              <p className="text-sm text-on-surface-variant">
                Vòng {currentRoundIndex + 1} / {rounds.length} ({currentWords.length} từ)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-md">
            <div className="flex items-center gap-xs text-sm font-medium px-md py-1.5 bg-surface-container rounded-full border border-hairline">
              <span className="text-emerald-600 dark:text-emerald-400">Đã nối: {totalMatches}</span>
              <span className="text-on-surface-variant">|</span>
              <span className="text-rose-500">Lỗi: {totalMistakes}</span>
            </div>

            <button
              onClick={initGame}
              className="p-2 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
              title="Chơi lại từ đầu"
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-surface-container-low h-2 rounded-full overflow-hidden">
          <div
            className="bg-primary h-full transition-all duration-300 rounded-full"
            style={{
              width: `${((matchedIds.size / 2) / (currentWords.length || 1)) * 100}%`
            }}
          />
        </div>
      </div>

      {/* Completion Screen */}
      {isCompleted ? (
        <div className="bg-surface border border-hairline rounded-[20px] p-xxl shadow-md text-center flex flex-col items-center gap-md my-md animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center mb-xs">
            <Trophy size={44} />
          </div>
          <h3 className="font-heading-1 text-2xl md:text-3xl text-on-surface">Xuất Sắc! Hoàn Thành Quiz!</h3>
          <p className="text-on-surface-variant max-w-md">
            Bạn đã nối đúng toàn bộ từ vựng và hoàn thành tất cả các vòng ôn tập.
          </p>

          <div className="grid grid-cols-3 gap-md w-full max-w-md my-sm">
            <div className="bg-surface-container-low p-md rounded-xl border border-hairline flex flex-col items-center">
              <span className="text-xs text-on-surface-variant mb-1">Tổng từ</span>
              <span className="text-xl font-bold text-on-surface">{words.length}</span>
            </div>
            <div className="bg-surface-container-low p-md rounded-xl border border-hairline flex flex-col items-center">
              <span className="text-xs text-on-surface-variant mb-1">Số lần nối</span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{totalMatches}</span>
            </div>
            <div className="bg-surface-container-low p-md rounded-xl border border-hairline flex flex-col items-center">
              <span className="text-xs text-on-surface-variant mb-1">Số lỗi sai</span>
              <span className="text-xl font-bold text-rose-500">{totalMistakes}</span>
            </div>
          </div>

          <button
            onClick={initGame}
            className="mt-xs bg-primary text-on-primary px-xxl py-md rounded-full font-button text-button hover:bg-primary-active transition-colors shadow-md flex items-center gap-sm"
          >
            <RotateCcw size={18} />
            Chơi lại từ đầu
          </button>
        </div>
      ) : (
        /* Quiz Columns Layout */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md md:gap-lg">
          {/* Left Column: English Words */}
          <div className="flex flex-col gap-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant px-xs">
              Từ tiếng Anh
            </h4>
            <div className="flex flex-col gap-sm">
              {leftItems.map(item => {
                const isMatched = matchedIds.has(item.id);
                const isSelected = selectedItem?.id === item.id;
                const isWrong = wrongPairIds?.includes(item.id);

                return (
                  <button
                    key={item.id}
                    disabled={isMatched}
                    onClick={() => handleItemClick(item)}
                    className={`p-md rounded-xl border text-left font-title text-base md:text-lg transition-all duration-200 shadow-sm flex items-center justify-between min-h-[64px] ${
                      isMatched
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 opacity-60 pointer-events-none scale-[0.98]'
                        : isWrong
                        ? 'border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-400 animate-bounce'
                        : isSelected
                        ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30 scale-[1.02] shadow-md'
                        : 'bg-surface border-hairline hover:border-primary/50 hover:bg-surface-container-low text-on-surface'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span>{item.text}</span>
                      {item.phonetic && (
                        <span className="text-xs font-mono text-on-surface-variant font-normal opacity-80">
                          {item.phonetic}
                        </span>
                      )}
                    </div>
                    {isMatched && <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0" />}
                    {isWrong && <AlertCircle size={20} className="text-rose-500 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Vietnamese Meanings */}
          <div className="flex flex-col gap-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant px-xs">
              Bản dịch nghĩa
            </h4>
            <div className="flex flex-col gap-sm">
              {rightItems.map(item => {
                const isMatched = matchedIds.has(item.id);
                const isSelected = selectedItem?.id === item.id;
                const isWrong = wrongPairIds?.includes(item.id);

                return (
                  <button
                    key={item.id}
                    disabled={isMatched}
                    onClick={() => handleItemClick(item)}
                    className={`p-md rounded-xl border text-left font-body-md text-base md:text-lg transition-all duration-200 shadow-sm flex items-center justify-between min-h-[64px] ${
                      isMatched
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 opacity-60 pointer-events-none scale-[0.98]'
                        : isWrong
                        ? 'border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-400 animate-bounce'
                        : isSelected
                        ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30 scale-[1.02] shadow-md'
                        : 'bg-surface border-hairline hover:border-primary/50 hover:bg-surface-container-low text-on-surface'
                    }`}
                  >
                    <span className="line-clamp-2">{item.text}</span>
                    {isMatched && <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0 ml-2" />}
                    {isWrong && <AlertCircle size={20} className="text-rose-500 flex-shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
