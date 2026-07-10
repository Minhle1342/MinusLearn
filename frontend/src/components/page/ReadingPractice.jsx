import React, { useState, useEffect } from 'react';
import { BookOpen, CheckCircle2, XCircle } from 'lucide-react';
import { useLocalStorage } from '../../hooks/useLocalStorage';

export function ReadingPractice({ words, activeTopicId, topics, setSrData }) {
  const [testState, setTestState] = useState('setup'); // setup, playing, results
  const [testMode, setTestMode] = useState('multiple_choice');
  const [wordCount, setWordCount] = useState(10);
  const [shuffledQuestions, setShuffledQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [toast, setToast] = useState(null);
  const [results, setResults] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);

  const [mistakes, setMistakes] = useLocalStorage('minuslearn_reading_mistakes', {});

  const topicWords = words.filter(w => w.topicId === activeTopicId);
  const currentTopic = topics.find(t => t.id === activeTopicId);

  useEffect(() => {
    setWordCount(topicWords.length);
    setTestState('setup');
    setResults([]);
  }, [activeTopicId, topicWords.length]);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleStart = (reviewMode = false) => {
    let sourceWords = topicWords;
    let selectedCount = wordCount;

    if (reviewMode) {
      sourceWords = topicWords.filter(w => mistakes[w.id]);
      selectedCount = sourceWords.length;
    } else {
      if (wordCount < 1 || wordCount > topicWords.length) return;
    }

    // Pick words for questions
    const shuffled = [...sourceWords].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, selectedCount);

    // Generate questions with 4 options
    const questions = selected.map(word => {
      // Find 3 other random words
      const otherWords = words.filter(w => w.id !== word.id).sort(() => 0.5 - Math.random()).slice(0, 3);
      // Combine and shuffle options
      const options = [word, ...otherWords].sort(() => 0.5 - Math.random());

      // Replace word in example with blanks (using regex case insensitive)
      let exampleWithBlank = word.example || '';
      if (exampleWithBlank) {
        const regex = new RegExp(`\\b${word.word}\\b`, 'gi');
        if (regex.test(exampleWithBlank)) {
          exampleWithBlank = exampleWithBlank.replace(regex, '____');
        } else {
          // Fallback: simple replace if no boundary match
          const simpleRegex = new RegExp(word.word, 'gi');
          exampleWithBlank = exampleWithBlank.replace(simpleRegex, '____');
        }
      }

      return {
        word,
        exampleWithBlank,
        options
      };
    });

    setShuffledQuestions(questions);
    setCurrentIndex(0);
    setResults([]);
    setUserInput('');
    setSelectedOption(null);
    setTestState('playing');
    setToast(null);
    setShowHint(false);
  };

  const handleSelectOption = (selectedWord) => {
    if (selectedOption) return;
    
    setSelectedOption(selectedWord);
    
    const currentQ = shuffledQuestions[currentIndex];
    const isCorrect = selectedWord.id === currentQ.word.id;

    if (isCorrect) {
      showToast('Chính xác!', 'success');
      if (mistakes[currentQ.word.id]) {
        const newMistakes = { ...mistakes };
        delete newMistakes[currentQ.word.id];
        setMistakes(newMistakes);
      }
      if (window.confetti) {
        window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#1aae39', '#ff64c8', '#0075de', '#d6b6f6'] });
      }
    } else {
      showToast(`Sai rồi! Đáp án: ${currentQ.word.word}`, 'error');
      setMistakes({ ...mistakes, [currentQ.word.id]: true });
    }

    const newResults = [...results, {
      word: currentQ.word,
      userAnswer: selectedWord.word,
      isCorrect
    }];
    setResults(newResults);

    setTimeout(() => {
      setSelectedOption(null);
      if (currentIndex + 1 < shuffledQuestions.length) {
        setCurrentIndex(currentIndex + 1);
        setShowHint(false);
      } else {
        if (setSrData) {
          const now = Date.now();
          setSrData(prev => {
            const next = { ...prev };
            newResults.forEach(r => {
              next[r.word.id] = {
                ...(next[r.word.id] || { interval: 0, ease: 2.5, step: 0 }),
                lastReviewDate: now
              };
            });
            return next;
          });
        }
        setTestState('results');
      }
    }, 1500);
  };

  const handleTypingSubmit = () => {
    if (!userInput.trim()) return;

    const currentQ = shuffledQuestions[currentIndex];
    const isCorrect = userInput.trim().toLowerCase() === currentQ.word.word.toLowerCase();

    if (isCorrect) {
      showToast('Chính xác!', 'success');
      if (mistakes[currentQ.word.id]) {
        const newMistakes = { ...mistakes };
        delete newMistakes[currentQ.word.id];
        setMistakes(newMistakes);
      }
      if (window.confetti) {
        window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#1aae39', '#ff64c8', '#0075de', '#d6b6f6'] });
      }
    } else {
      showToast(`Sai rồi! Đáp án: ${currentQ.word.word}`, 'error');
      setMistakes({ ...mistakes, [currentQ.word.id]: true });
    }

    const newResults = [...results, {
      word: currentQ.word,
      userAnswer: userInput.trim(),
      isCorrect
    }];
    setResults(newResults);
    setUserInput('');

    setTimeout(() => {
      if (currentIndex + 1 < shuffledQuestions.length) {
        setCurrentIndex(currentIndex + 1);
        setShowHint(false);
      } else {
        if (setSrData) {
          const now = Date.now();
          setSrData(prev => {
            const next = { ...prev };
            newResults.forEach(r => {
              next[r.word.id] = {
                ...(next[r.word.id] || { interval: 0, ease: 2.5, step: 0 }),
                lastReviewDate: now
              };
            });
            return next;
          });
        }
        setTestState('results');
      }
    }, 1500);
  };

  if (topicWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-xl text-center">
        <div className="w-24 h-24 bg-surface rounded-full flex items-center justify-center shadow-sm mb-lg border border-hairline">
          <BookOpen size={40} className="text-on-surface-variant" />
        </div>
        <h2 className="font-heading-2 text-heading-2 text-ink mb-sm">Chưa có từ vựng</h2>
        <p className="font-body-md text-body-md text-ink-muted max-w-md">
          Chủ đề này chưa có từ vựng nào. Hãy thêm từ vựng ở màn hình chính trước khi bắt đầu đọc hiểu nhé.
        </p>
      </div>
    );
  }

  const wrongWordsInTopic = topicWords.filter(w => mistakes[w.id]);

  return (
    <div className={`relative min-h-full flex flex-col items-center p-xl ${testState !== 'results' ? 'justify-center' : 'justify-start'}`}>
      {toast && (
        <div className={`absolute bottom-xl right-xl z-50 flex items-center gap-sm px-lg py-sm rounded-full shadow-soft font-body-md text-body-md transition-all animate-in slide-in-from-bottom-5 fade-in duration-300 ${toast.type === 'success' ? 'bg-accent-green text-surface' : 'bg-accent-orange text-surface'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          {toast.message}
        </div>
      )}

      {testState === 'setup' && (
        <div className="bg-surface border border-hairline rounded-[16px] p-[40px] shadow-sm max-w-lg w-full flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-accent-teal/10 rounded-full flex items-center justify-center mb-xl shadow-inner border border-accent-teal/20">
            <BookOpen size={48} className="text-accent-teal" />
          </div>

          <h2 className="font-display-2 text-display-2 text-ink mb-sm tracking-tight">Đọc - hiểu</h2>
          <p className="font-body-md text-body-md text-ink-muted mb-xl">
            Chủ đề <span className="font-bold text-ink px-1">{currentTopic?.name}</span> hiện có {topicWords.length} từ vựng. <br />Sẵn sàng đọc hiểu chưa?
          </p>

          <div className="w-full text-left mb-lg bg-canvas-soft p-lg rounded-[12px] border border-hairline">
            <label className="block font-eyebrow text-eyebrow text-primary uppercase mb-sm tracking-wide">
              Chế độ kiểm tra
            </label>
            <div className="flex gap-sm">
              <button 
                onClick={() => setTestMode('multiple_choice')}
                className={`flex-1 py-sm rounded-[8px] font-title text-title transition-all border ${testMode === 'multiple_choice' ? 'bg-primary text-surface border-primary shadow-sm' : 'bg-surface text-ink hover:bg-surface-container-low border-hairline'}`}
              >
                Trắc nghiệm
              </button>
              <button 
                onClick={() => setTestMode('typing')}
                className={`flex-1 py-sm rounded-[8px] font-title text-title transition-all border ${testMode === 'typing' ? 'bg-primary text-surface border-primary shadow-sm' : 'bg-surface text-ink hover:bg-surface-container-low border-hairline'}`}
              >
                Nhập từ vựng
              </button>
            </div>
          </div>

          <div className="w-full text-left mb-xxl bg-canvas-soft p-lg rounded-[12px] border border-hairline">
            <label className="block font-eyebrow text-eyebrow text-primary uppercase mb-sm tracking-wide">
              Số lượng từ muốn kiểm tra
            </label>
            <input
              type="number"
              min="1"
              max={topicWords.length}
              value={wordCount}
              onChange={(e) => setWordCount(parseInt(e.target.value) || 1)}
              className="w-full bg-surface border border-hairline rounded-[8px] p-sm font-title text-title text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
            />
          </div>

          <div className="flex gap-sm w-full">
            <button
              onClick={() => handleStart(false)}
              className="flex-1 bg-primary text-on-primary font-button text-button py-md rounded-full shadow-md hover:bg-primary-active hover:shadow-lg hover:-translate-y-0.5 transition-all active:translate-y-0 active:shadow-sm"
            >
              Bắt đầu kiểm tra
            </button>
            {wrongWordsInTopic.length > 0 && (
              <button
                onClick={() => handleStart(true)}
                className="flex-1 bg-error text-surface font-button text-button py-md rounded-full shadow-md hover:bg-error/90 hover:shadow-lg hover:-translate-y-0.5 transition-all active:translate-y-0 active:shadow-sm"
              >
                Ôn {wrongWordsInTopic.length} câu sai
              </button>
            )}
          </div>
        </div>
      )}

      {testState === 'playing' && (
        <div className="w-full max-w-2xl flex flex-col items-center">
          {/* Progress */}
          <div className="w-full mb-xxl">
            <div className="flex justify-between font-eyebrow text-eyebrow text-ink-muted uppercase mb-xs tracking-wide">
              <span>Tiến độ</span>
              <span>{currentIndex + 1} / {shuffledQuestions.length}</span>
            </div>
            <div className="h-3 w-full bg-hairline rounded-full overflow-hidden shadow-inner">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${((currentIndex) / shuffledQuestions.length) * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-surface border border-hairline rounded-[16px] p-[40px] shadow-sm w-full flex flex-col items-center relative overflow-hidden">
            <div className="absolute top-[-50px] right-[-50px] w-32 h-32 bg-accent-teal/5 rounded-full blur-2xl pointer-events-none"></div>

            <p className="font-title text-title text-ink-muted mb-lg text-center">
              Chọn từ thích hợp để điền vào chỗ trống
            </p>

            <div className="w-full bg-canvas-soft border-2 border-hairline rounded-[12px] p-lg font-heading-2 text-heading-2 text-ink text-center mb-xl shadow-inner">
              {shuffledQuestions[currentIndex].exampleWithBlank || "____"}
            </div>

            {showHint && (
              <div className="w-full text-left bg-surface-container-low border border-hairline rounded-[8px] p-md mb-xl animate-in fade-in duration-300">
                <p className="font-title text-title text-ink mb-xs">
                  <span className="font-bold">Nghĩa gợi ý:</span> {shuffledQuestions[currentIndex].word.meaning}
                </p>
              </div>
            )}

            {testMode === 'multiple_choice' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md w-full mb-lg">
                {shuffledQuestions[currentIndex].options.map((opt, i) => {
                  const isSelected = selectedOption && selectedOption.id === opt.id;
                  const isCorrectAnswer = opt.id === shuffledQuestions[currentIndex].word.id;
                  
                  let borderClass = "border-hairline hover:border-primary hover:bg-primary/5";
                  let bgClass = "bg-surface";
                  let textClass = "text-ink";
                  let badgeClass = "bg-surface-container-low text-primary group-hover:bg-primary group-hover:text-surface";
                  
                  if (selectedOption) {
                    if (isCorrectAnswer) {
                      borderClass = "border-accent-green";
                      bgClass = "bg-accent-green/10";
                      textClass = "text-accent-green";
                      badgeClass = "bg-accent-green text-surface";
                    } else if (isSelected) {
                      borderClass = "border-accent-orange";
                      bgClass = "bg-accent-orange/10";
                      textClass = "text-accent-orange";
                      badgeClass = "bg-accent-orange text-surface";
                    } else {
                      borderClass = "border-hairline opacity-50";
                      badgeClass = "bg-surface-container-low text-ink-muted";
                    }
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => handleSelectOption(opt)}
                      disabled={!!selectedOption}
                      className={`w-full border-2 rounded-[12px] p-md font-title text-title transition-colors active:scale-[0.98] shadow-sm text-left flex flex-col group ${borderClass} ${bgClass}`}
                    >
                      <div className="flex items-center">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mr-md shadow-sm transition-colors flex-shrink-0 ${badgeClass}`}>
                          {['A', 'B', 'C', 'D'][i]}
                        </span>
                        <span className={textClass}>{opt.word}</span>
                      </div>
                      
                      {selectedOption && (isCorrectAnswer || isSelected) && (
                        <div className={`mt-sm ml-[48px] text-body-sm font-body-sm ${textClass}`}>
                          {opt.meaning}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="w-full mb-lg flex flex-col gap-sm">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTypingSubmit();
                  }}
                  placeholder="Gõ từ vựng vào đây..."
                  className="w-full text-center bg-canvas-soft border-2 border-hairline rounded-[12px] py-lg px-xl font-display-2 text-display-2 text-ink focus:outline-none focus:border-primary focus:bg-surface transition-all placeholder:text-ink-faint"
                  autoComplete="off"
                  spellCheck="false"
                  autoFocus
                />
                <button
                  onClick={handleTypingSubmit}
                  disabled={!userInput.trim()}
                  className="w-full bg-primary text-on-primary rounded-full py-md px-lg font-title text-title hover:bg-primary-active transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-sm flex items-center justify-center gap-xs"
                >
                  Xác nhận
                </button>
              </div>
            )}

            <button
              onClick={() => setShowHint(true)}
              disabled={showHint}
              className="w-full bg-surface-container-high text-on-surface rounded-full py-md px-lg font-title text-title hover:bg-surface-container-highest transition-all active:scale-[0.98] shadow-sm disabled:opacity-50 disabled:pointer-events-none"
            >
              Gợi ý
            </button>
          </div>
        </div>
      )}

      {testState === 'results' && (
        <div className="bg-surface border border-hairline rounded-[16px] p-[40px] shadow-sm max-w-2xl w-full flex flex-col items-center">
          <div className="w-24 h-24 bg-accent-green/10 rounded-full flex items-center justify-center mb-xl shadow-inner border border-accent-green/20">
            <CheckCircle2 size={48} className="text-accent-green" />
          </div>

          <h2 className="font-display-2 text-display-2 text-ink mb-sm">Kết quả</h2>

          <div className="flex gap-lg mb-xxl">
            <div className="text-center">
              <div className="font-display-1 text-display-1 text-accent-green">
                {results.filter(r => r.isCorrect).length}
              </div>
              <div className="font-eyebrow text-eyebrow text-ink-muted uppercase">Chính xác</div>
            </div>
            <div className="w-px bg-hairline"></div>
            <div className="text-center">
              <div className="font-display-1 text-display-1 text-accent-orange">
                {results.filter(r => !r.isCorrect).length}
              </div>
              <div className="font-eyebrow text-eyebrow text-ink-muted uppercase">Sai</div>
            </div>
          </div>

          <div className="w-full space-y-sm mb-xxl">
            {results.map((r, i) => (
              <div key={i} className={`p-md rounded-[8px] flex items-center justify-between border ${r.isCorrect ? 'bg-accent-green/5 border-accent-green/20' : 'bg-accent-orange/5 border-accent-orange/20'}`}>
                <div className="flex-1 flex flex-col md:flex-row md:items-center justify-between gap-sm pr-lg">
                  <div>
                    <div className="font-title text-title text-ink">{r.word.word}</div>
                    <div className="font-body-sm text-body-sm text-ink-muted">{r.word.meaning}</div>
                  </div>
                  {testMode === 'typing' && (
                    <div className="text-right bg-surface px-md py-sm rounded-[8px] border border-hairline shadow-sm min-w-[120px]">
                      <div className="font-eyebrow text-eyebrow uppercase text-ink-faint mb-[4px]">Bạn đã nhập</div>
                      <div className={`font-title text-title ${r.isCorrect ? 'text-accent-green' : 'text-accent-orange line-through decoration-2'}`}>
                        {r.userAnswer || '(Bỏ trống)'}
                      </div>
                    </div>
                  )}
                </div>
                {r.isCorrect ? (
                  <CheckCircle2 className="text-accent-green flex-shrink-0" />
                ) : (
                  <XCircle className="text-accent-orange flex-shrink-0" />
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-sm w-full">
            <button
              onClick={() => setTestState('setup')}
              className="flex-1 bg-surface-container-high text-on-surface font-button text-button py-md rounded-full shadow-sm hover:bg-surface-container-highest transition-all active:translate-y-0"
            >
              Làm lại
            </button>
            {wrongWordsInTopic.length > 0 && (
              <button
                onClick={() => handleStart(true)}
                className="flex-1 bg-error text-surface font-button text-button py-md rounded-full shadow-sm hover:bg-error/90 transition-all active:translate-y-0"
              >
                Ôn {wrongWordsInTopic.length} câu sai
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
