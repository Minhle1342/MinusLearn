import React, { useState, useEffect } from 'react';
import { BookOpen, CheckCircle2, XCircle, Loader2, Clock, ChevronRight } from 'lucide-react';
import { useRemoteStorage } from '../../hooks/useRemoteStorage';
import { generateIELTSReadingTest, explainReadingAnswer, explainIeltsReadingAnswer } from '../../services/api';
import { recordReview } from '../../utils/spacedRepetition';

export function ReadingPractice({ words, activeTopicId, topics, settings, setSrData }) {
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

  // IELTS State
  const [ieltsTest, setIeltsTest] = useState(null);
  const [isLoadingIelts, setIsLoadingIelts] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20 * 60);
  const [ieltsAnswers, setIeltsAnswers] = useState({});
  const [difficulty, setDifficulty] = useState('Trung bình');
  const [ieltsExplanation, setIeltsExplanation] = useState({});
  const [isFetchingExplanation, setIsFetchingExplanation] = useState({});

  const [mistakes, setMistakes] = useRemoteStorage('minuslearn_reading_mistakes', {});

  const topicWords = words.filter(w => w.topicId === activeTopicId);
  const currentTopic = topics.find(t => t.id === activeTopicId);

  useEffect(() => {
    setWordCount(topicWords.length);
    setTestState('setup');
    setResults([]);
    setIeltsTest(null);
  }, [activeTopicId, topicWords.length]);

  useEffect(() => {
    let timer;
    if (testState === 'playing_ielts' && ieltsTest) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setTestState('results_ielts');
            showToast('Hết giờ! Bài thi đã tự động nộp.', 'error');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [testState, ieltsTest]);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleStartIelts = async () => {
    if (topicWords.length === 0) return;
    setIsLoadingIelts(true);
    setTestState('loading_ielts');
    
    try {
      const shuffled = [...topicWords].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 20);
      
      const test = await generateIELTSReadingTest(selected, difficulty, settings.apiKey, settings.model);
      setIeltsTest(test);
      setTimeLeft(20 * 60);
      setIeltsAnswers({});
      setTestState('playing_ielts');
    } catch (err) {
      showToast(err.message || 'Lỗi khi tạo đề IELTS', 'error');
      setTestState('setup');
    } finally {
      setIsLoadingIelts(false);
    }
  };

  const calculateBandScore = (correct, total) => {
    const scaledScore = (correct / total) * 40;
    if (scaledScore >= 39) return 9.0;
    if (scaledScore >= 37) return 8.5;
    if (scaledScore >= 35) return 8.0;
    if (scaledScore >= 33) return 7.5;
    if (scaledScore >= 30) return 7.0;
    if (scaledScore >= 27) return 6.5;
    if (scaledScore >= 23) return 6.0;
    if (scaledScore >= 19) return 5.5;
    if (scaledScore >= 15) return 5.0;
    if (scaledScore >= 13) return 4.5;
    if (scaledScore >= 10) return 4.0;
    return 'Dưới 4.0';
  };

  const handleExplainIelts = async (idx, questionObj) => {
    setIsFetchingExplanation(prev => ({ ...prev, [idx]: true }));
    try {
      const result = await explainIeltsReadingAnswer(
        ieltsTest.passage,
        questionObj.text || questionObj.question,
        questionObj.correctAnswer,
        settings.apiKey,
        settings.model
      );
      setIeltsExplanation(prev => ({ ...prev, [idx]: result }));
    } catch (err) {
      showToast(err.message || 'Lỗi khi lấy giải thích', 'error');
    } finally {
      setIsFetchingExplanation(prev => ({ ...prev, [idx]: false }));
    }
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
              next[r.word.id] = recordReview(
                next[r.word.id] || { interval: 0, ease: 2.5, step: 0 },
                { lastReviewDate: now }
              );
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
              next[r.word.id] = recordReview(
                next[r.word.id] || { interval: 0, ease: 2.5, step: 0 },
                { lastReviewDate: now }
              );
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
        <div className="w-24 h-24 mb-md rounded-full bg-surface-container-low flex items-center justify-center">
          <BookOpen size={48} className="text-primary" />
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
              <button 
                onClick={() => setTestMode('ielts_academic')}
                className={`flex-1 py-sm rounded-[8px] font-title text-title transition-all border ${testMode === 'ielts_academic' ? 'bg-primary text-surface border-primary shadow-sm' : 'bg-surface text-ink hover:bg-surface-container-low border-hairline'}`}
              >
                IELTS Academic
              </button>
            </div>
          </div>

          {testMode === 'ielts_academic' ? (
            <div className="w-full text-left mb-xxl bg-canvas-soft p-lg rounded-[12px] border border-hairline">
              <label className="block font-eyebrow text-eyebrow text-primary uppercase mb-sm tracking-wide">
                Độ khó (Mini Test 20 phút)
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full bg-surface border border-hairline rounded-[8px] p-sm font-title text-title text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
              >
                <option value="Dễ">Dễ (Band 4.0 - 5.0)</option>
                <option value="Trung bình">Trung bình (Band 5.5 - 6.5)</option>
                <option value="Khó">Khó (Band 7.0+)</option>
              </select>
            </div>
          ) : (
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
          )}

          <div className="flex gap-sm w-full">
            {testMode === 'ielts_academic' ? (
              <button
                onClick={handleStartIelts}
                className="flex-1 bg-primary text-on-primary font-button text-button py-md rounded-full shadow-md hover:bg-primary-active hover:shadow-lg hover:-translate-y-0.5 transition-all active:translate-y-0 active:shadow-sm"
              >
                Tạo đề & Bắt đầu
              </button>
            ) : (
              <>
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
              </>
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

      {testState === 'loading_ielts' && (
        <div className="w-full h-64 flex flex-col items-center justify-center">
          <Loader2 className="animate-spin text-primary mb-md" size={48} />
          <p className="font-title text-title text-ink-muted">Đang tạo đề thi IELTS... Vui lòng đợi.</p>
        </div>
      )}

      {testState === 'playing_ielts' && ieltsTest && (
        <div className="w-full flex flex-col lg:flex-row gap-lg items-start h-[calc(100vh-150px)]">
          {/* Passage Section */}
          <div className="w-full lg:w-1/2 bg-surface border border-hairline rounded-[16px] p-lg shadow-sm h-full overflow-y-auto custom-scrollbar">
            <h2 className="font-display-2 text-display-2 text-ink mb-md">{ieltsTest.title}</h2>
            <div className="font-body-md text-body-md text-ink leading-relaxed whitespace-pre-wrap">
              {ieltsTest.passage}
            </div>
          </div>

          {/* Questions Section */}
          <div className="w-full lg:w-1/2 bg-surface border border-hairline rounded-[16px] p-lg shadow-sm h-full overflow-y-auto custom-scrollbar flex flex-col">
            <div className="flex justify-between items-center mb-lg pb-md border-b border-hairline sticky top-0 bg-surface z-10 pt-sm">
              <h3 className="font-title text-title text-ink">Câu hỏi</h3>
              <div className="flex items-center gap-xs font-title text-title text-primary bg-primary/10 px-md py-xs rounded-full">
                <Clock size={18} />
                <span>{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
              </div>
            </div>

            <div className="flex-1 space-y-xl">
              {ieltsTest.questions.map((q, idx) => (
                <div key={idx} className="bg-canvas-soft p-md rounded-[12px] border border-hairline">
                  <p className="font-title text-title text-ink mb-md">{idx + 1}. {q.text}</p>
                  <div className="space-y-sm">
                    {q.type === 'gap_fill' || !q.options || q.options.length === 0 ? (
                      <input
                        type="text"
                        placeholder="Nhập câu trả lời..."
                        value={ieltsAnswers[idx] || ''}
                        onChange={(e) => setIeltsAnswers({ ...ieltsAnswers, [idx]: e.target.value })}
                        className="w-full bg-surface border border-hairline rounded-[8px] p-sm font-title text-title text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
                      />
                    ) : (
                      q.options.map((opt, optIdx) => (
                        <button
                          key={optIdx}
                          onClick={() => setIeltsAnswers({ ...ieltsAnswers, [idx]: opt })}
                          className={`w-full text-left p-sm rounded-[8px] border transition-all ${ieltsAnswers[idx] === opt ? 'bg-primary/10 border-primary text-primary font-bold' : 'bg-surface border-hairline text-ink hover:bg-surface-container-low'}`}
                        >
                          {opt}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-xl pt-md border-t border-hairline flex justify-end sticky bottom-0 bg-surface pb-sm">
              <button
                onClick={() => setTestState('results_ielts')}
                className="bg-primary text-on-primary font-button text-button py-sm px-xl rounded-full shadow-md hover:bg-primary-active transition-all"
              >
                Nộp bài
              </button>
            </div>
          </div>
        </div>
      )}

      {testState === 'results_ielts' && ieltsTest && (
        <div className="bg-surface border border-hairline rounded-[16px] p-[40px] shadow-sm max-w-4xl w-full mx-auto">
          <div className="text-center mb-xl">
            <div className="w-24 h-24 bg-accent-green/10 rounded-full flex items-center justify-center mx-auto mb-lg shadow-inner border border-accent-green/20">
              <CheckCircle2 size={48} className="text-accent-green" />
            </div>
            <h2 className="font-display-2 text-display-2 text-ink mb-sm">Kết quả IELTS Reading (Mini)</h2>
            <div className="flex justify-center gap-xl mt-lg">
              <div className="text-center">
                <div className="font-display-1 text-display-1 text-accent-green">
                  {ieltsTest.questions.filter((q, i) => ieltsAnswers[i]?.toString().trim().toLowerCase() === q.correctAnswer?.toString().trim().toLowerCase()).length} / {ieltsTest.questions.length}
                </div>
                <div className="font-eyebrow text-eyebrow text-ink-muted uppercase">Số câu đúng</div>
              </div>
              <div className="w-px bg-hairline"></div>
              <div className="text-center">
                <div className="font-display-1 text-display-1 text-primary">
                  {calculateBandScore(ieltsTest.questions.filter((q, i) => ieltsAnswers[i]?.toString().trim().toLowerCase() === q.correctAnswer?.toString().trim().toLowerCase()).length, ieltsTest.questions.length)}
                </div>
                <div className="font-eyebrow text-eyebrow text-ink-muted uppercase">Band điểm dự kiến</div>
              </div>
            </div>
          </div>

          <div className="space-y-lg mb-xl">
            {ieltsTest.questions.map((q, idx) => {
              const isCorrect = ieltsAnswers[idx]?.toString().trim().toLowerCase() === q.correctAnswer?.toString().trim().toLowerCase();
              return (
                <div key={idx} className={`p-lg rounded-[12px] border ${isCorrect ? 'bg-accent-green/5 border-accent-green/20' : 'bg-accent-orange/5 border-accent-orange/20'}`}>
                  <p className="font-title text-title text-ink mb-sm">{idx + 1}. {q.text}</p>
                  <p className="font-body-md text-body-md text-ink-muted mb-md">
                    Đáp án của bạn: <span className={isCorrect ? 'text-accent-green font-bold' : 'text-accent-orange font-bold line-through decoration-2'}>{ieltsAnswers[idx] || '(Chưa làm)'}</span>
                  </p>
                  {!isCorrect && (
                    <p className="font-body-md text-body-md text-accent-green mb-md font-bold">
                      Đáp án đúng: {q.correctAnswer}
                    </p>
                  )}
                  
                  {isFetchingExplanation[idx] ? (
                    <div className="flex items-center gap-xs text-primary font-body-sm mt-sm">
                      <Loader2 size={16} className="animate-spin" />
                      <span>Đang giải thích...</span>
                    </div>
                  ) : ieltsExplanation[idx] ? (
                    <div className="mt-md p-md bg-surface rounded-[8px] border border-hairline font-body-sm text-ink leading-relaxed">
                      <strong className="text-primary block mb-xs">Giải thích:</strong>
                      {ieltsExplanation[idx]}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleExplainIelts(idx, q)}
                      className="mt-sm text-primary font-button text-button hover:underline flex items-center gap-xs"
                    >
                      <BookOpen size={16} />
                      Tại sao lại chọn đáp án này?
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="flex justify-center">
            <button
              onClick={() => setTestState('setup')}
              className="bg-primary text-on-primary font-button text-button py-md px-xxl rounded-full shadow-md hover:bg-primary-active transition-all"
            >
              Làm lại
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
