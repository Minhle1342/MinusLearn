import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Play, RotateCcw, Check, X, CheckCircle2, XCircle, Loader2, BookOpen, Clock, FileText } from 'lucide-react';
import { useRemoteStorage } from '../../hooks/useRemoteStorage';
import { speakEnglishText } from '../../utils/speech';
import { generateIELTSListeningTest } from '../../services/api';
import { recordReview } from '../../utils/spacedRepetition';

export function ListeningPractice({ words, activeTopicId, topics, settings, setSrData }) {
  const [testState, setTestState] = useState('setup'); // 'setup', 'playing', 'results'
  const [testMode, setTestMode] = useState('typing'); // 'multiple_choice', 'typing'
  const [wordCount, setWordCount] = useState(10);
  const [shuffledWords, setShuffledWords] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [results, setResults] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);

  // IELTS State
  const [ieltsTest, setIeltsTest] = useState(null);
  const [isLoadingIelts, setIsLoadingIelts] = useState(false);
  const [timeLeft, setTimeLeft] = useState(2 * 60); // 2 minutes countdown
  const [ieltsAnswers, setIeltsAnswers] = useState({});
  const [difficulty, setDifficulty] = useState('Trung bình (Band 5.5 - 6.5)');
  const [ieltsExplanation, setIeltsExplanation] = useState({});
  const [isFetchingExplanation, setIsFetchingExplanation] = useState({});
  const [visibleHints, setVisibleHints] = useState({});
  const [highlightedSentence, setHighlightedSentence] = useState('');
  const [audioState, setAudioState] = useState('idle'); // 'idle', 'playing', 'finished'
  const [audioRate, setAudioRate] = useState(0.9); // NPC reading speed

  // Toast State: { message: string, type: 'success' | 'error' } | null
  const [toast, setToast] = useState(null);

  const [showHint, setShowHint] = useState(false);

  const [mistakes, setMistakes] = useRemoteStorage('minuslearn_mistakes', {});

  const inputRef = useRef(null);

  const topicWords = words.filter(w => w.topicId === activeTopicId);
  const currentTopic = topics.find(t => t.id === activeTopicId);

  // Sync wordCount max when topic changes
  useEffect(() => {
    setWordCount(topicWords.length);
    setTestState('setup');
    setResults([]);
  }, [activeTopicId, topicWords.length]);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 2500);
  };

  const handleStartIelts = async () => {
    if (topicWords.length === 0) return;
    setIsLoadingIelts(true);
    setTestState('setup');
    setIeltsAnswers({});
    setIeltsExplanation({});
    setIsFetchingExplanation({});
    setVisibleHints({});
    setHighlightedSentence('');
    setAudioState('idle');
    setTimeLeft(2 * 60);

    try {
      const apiKey = settings?.apiKey;
      const model = settings?.model || 'gemini-1.5-flash';
      if (!apiKey) throw new Error('Vui lòng thiết lập API Key trong Cài đặt');

      const test = await generateIELTSListeningTest(topicWords, difficulty, apiKey, model);
      if (!test || !test.questions) throw new Error('Dữ liệu bài thi không hợp lệ');

      setIeltsTest(test);
      setTestState('playing_ielts');
    } catch (err) {
      showToast(err.message || 'Lỗi khi tạo đề IELTS', 'error');
      setTestState('setup');
    } finally {
      setIsLoadingIelts(false);
    }
  };

  const speak = (text) => {
    speakEnglishText(text, settings?.speechVoiceURI, { rate: 0.9 });
  };

  const calculateBandScore = (correct, total) => {
    const percentage = correct / total;
    if (percentage >= 0.97) return '9.0';
    if (percentage >= 0.92) return '8.5';
    if (percentage >= 0.87) return '8.0';
    if (percentage >= 0.80) return '7.5';
    if (percentage >= 0.75) return '7.0';
    if (percentage >= 0.65) return '6.5';
    if (percentage >= 0.57) return '6.0';
    if (percentage >= 0.45) return '5.5';
    if (percentage >= 0.40) return '5.0';
    if (percentage >= 0.32) return '4.5';
    if (percentage >= 0.27) return '4.0';
    return '3.5';
  };

  const submitIeltsTest = () => {
    setTestState('results_ielts');
    window.speechSynthesis.cancel();
  };

  const handleExplainIelts = (idx, q) => {
    setIsFetchingExplanation(prev => ({ ...prev, [idx]: true }));
    setTimeout(() => {
      setIeltsExplanation(prev => ({ ...prev, [idx]: q.explanation }));
      setIsFetchingExplanation(prev => ({ ...prev, [idx]: false }));
    }, 500); // Simulate loading for better UX
  };

  // Timer Effect
  useEffect(() => {
    let timer;
    if (testState === 'playing_ielts' && audioState === 'finished' && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && testState === 'playing_ielts') {
      submitIeltsTest();
    }
    return () => clearInterval(timer);
  }, [testState, audioState, timeLeft]);

  // Clean up TTS when unmounting
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const playIeltsAudio = () => {
    if (audioState === 'playing' || audioState === 'finished') return;

    // Create new utterance
    const utterance = new SpeechSynthesisUtterance(ieltsTest.transcript);

    if (settings?.speechVoiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === settings.speechVoiceURI);
      if (voice) utterance.voice = voice;
    }

    utterance.rate = audioRate;
    utterance.onstart = () => setAudioState('playing');
    utterance.onend = () => setAudioState('finished');
    utterance.onerror = (e) => {
      console.error('TTS error:', e);
      setAudioState('finished');
    };

    window.speechSynthesis.speak(utterance);
  };

  const playAnswerSentence = (sentence) => {
    if (!sentence) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sentence);
    if (settings?.speechVoiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === settings.speechVoiceURI);
      if (voice) utterance.voice = voice;
    }
    utterance.rate = audioRate;
    window.speechSynthesis.speak(utterance);
  };

  const renderTranscript = () => {
    if (!ieltsTest?.transcript) return null;
    if (!highlightedSentence) return ieltsTest.transcript;
    
    const idx = ieltsTest.transcript.indexOf(highlightedSentence);
    if (idx === -1) return ieltsTest.transcript;

    const before = ieltsTest.transcript.slice(0, idx);
    const highlight = ieltsTest.transcript.slice(idx, idx + highlightedSentence.length);
    const after = ieltsTest.transcript.slice(idx + highlightedSentence.length);

    return (
      <>
        {before}
        <span id="highlighted-sentence" className="bg-accent-orange/30 font-bold px-1 rounded">{highlight}</span>
        {after}
      </>
    );
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

    // Shuffle and pick
    const shuffled = [...sourceWords].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, selectedCount);

    const questions = selected.map(word => {
      const otherWords = words.filter(w => w.id !== word.id).sort(() => 0.5 - Math.random()).slice(0, 3);
      const options = [word, ...otherWords].sort(() => 0.5 - Math.random());
      return { word, options };
    });

    setShuffledWords(questions);
    setCurrentIndex(0);
    setResults([]);
    setUserInput('');
    setSelectedOption(null);
    setTestState('playing');
    setToast(null);
    setShowHint(false);

    // Speak first word after a tiny delay to ensure UI updates
    setTimeout(() => {
      speak(questions[0].word.word);
      if (testMode === 'typing' && inputRef.current) inputRef.current.focus();
    }, 300);
  };

  const handleNext = () => {
    if (!userInput.trim()) return;

    const currentWord = shuffledWords[currentIndex].word;
    const isCorrect = userInput.trim().toLowerCase() === currentWord.word.toLowerCase();

    // Trigger feedback
    if (isCorrect) {
      showToast('Chính xác!', 'success');
      if (mistakes[currentWord.id]) {
        const newMistakes = { ...mistakes };
        delete newMistakes[currentWord.id];
        setMistakes(newMistakes);
      }
      if (window.confetti) {
        window.confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#1aae39', '#ff64c8', '#0075de', '#d6b6f6']
        });
      }
    } else {
      showToast(`Sai rồi! Đáp án: ${currentWord.word}`, 'error');
      setMistakes({ ...mistakes, [currentWord.id]: true });
    }

    const newResults = [...results, {
      word: currentWord,
      userAnswer: userInput.trim(),
      isCorrect
    }];

    setResults(newResults);
    setUserInput('');
    setShowHint(false);

    if (currentIndex + 1 < shuffledWords.length) {
      setCurrentIndex(currentIndex + 1);
      setTimeout(() => {
        speak(shuffledWords[currentIndex + 1].word.word);
        if (inputRef.current) inputRef.current.focus();
      }, 300);
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
  };

  const handleSelectOption = (selectedOpt) => {
    if (selectedOption) return;

    setSelectedOption(selectedOpt);

    const currentWord = shuffledWords[currentIndex].word;
    const isCorrect = selectedOpt.id === currentWord.id;

    if (isCorrect) {
      showToast('Chính xác!', 'success');
      if (mistakes[currentWord.id]) {
        const newMistakes = { ...mistakes };
        delete newMistakes[currentWord.id];
        setMistakes(newMistakes);
      }
      if (window.confetti) {
        window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#1aae39', '#ff64c8', '#0075de', '#d6b6f6'] });
      }
    } else {
      showToast(`Sai rồi! Đáp án: ${currentWord.word}`, 'error');
      setMistakes({ ...mistakes, [currentWord.id]: true });
    }

    const newResults = [...results, {
      word: currentWord,
      userAnswer: selectedOpt.word,
      isCorrect
    }];

    setResults(newResults);
    setShowHint(false);

    setTimeout(() => {
      setSelectedOption(null);
      if (currentIndex + 1 < shuffledWords.length) {
        setCurrentIndex(currentIndex + 1);
        setTimeout(() => {
          speak(shuffledWords[currentIndex + 1].word.word);
        }, 300);
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleNext();
    }
  };

  // --- RENDERS ---

  if (topicWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-xl text-center">
        <div className="w-24 h-24 mb-md rounded-full bg-surface-container-low flex items-center justify-center">
          <Volume2 size={48} className="text-primary" />
        </div>
        <h2 className="font-heading-2 text-heading-2 text-ink mb-sm">Chưa có từ vựng</h2>
        <p className="font-body-md text-body-md text-ink-muted max-w-md">
          Chủ đề này chưa có từ vựng nào. Hãy thêm từ vựng ở màn hình chính trước khi bắt đầu luyện nghe nhé.
        </p>
      </div>
    );
  }

  const wrongWordsInTopic = topicWords.filter(w => mistakes[w.id]);

  return (
    <div className={`relative min-h-full flex flex-col items-center p-xl ${testState !== 'results' ? 'justify-center' : 'justify-start'}`}>

      {/* Toast Notification */}
      {toast && (
        <div className={`absolute bottom-xl right-xl z-50 flex items-center gap-sm px-lg py-sm rounded-full shadow-soft font-body-md text-body-md transition-all animate-in slide-in-from-bottom-5 fade-in duration-300 ${toast.type === 'success' ? 'bg-accent-green text-surface' : 'bg-accent-orange text-surface'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          {toast.message}
        </div>
      )}

      {testState === 'setup' && (
        <div className="bg-surface border border-hairline rounded-[16px] p-[40px] shadow-sm max-w-lg w-full flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-accent-sky/10 rounded-full flex items-center justify-center mb-xl shadow-inner border border-accent-sky/20">
            <Volume2 size={48} className="text-accent-sky" />
          </div>

          <h2 className="font-display-2 text-display-2 text-ink mb-sm tracking-tight">Luyện nghe</h2>
          <p className="font-body-md text-body-md text-ink-muted mb-xl">
            Chủ đề <span className="font-bold text-ink px-1">{currentTopic?.name}</span> hiện có {topicWords.length} từ vựng. <br />Sẵn sàng kiểm tra đôi tai của bạn chưa?
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
                className={`flex-1 py-sm rounded-[8px] font-title text-title transition-all border flex items-center justify-center gap-xs ${testMode === 'ielts_academic' ? 'bg-accent-purple text-surface border-accent-purple shadow-sm' : 'bg-surface text-ink hover:bg-surface-container-low border-hairline'}`}
              >
                IELTS Academic
              </button>
            </div>
          </div>

          {testMode === 'ielts_academic' ? (
            <div className="w-full text-left mb-xxl bg-canvas-soft p-lg rounded-[12px] border border-hairline">
              <label className="block font-eyebrow text-eyebrow text-primary uppercase mb-sm tracking-wide">
                Độ khó (Sinh bởi AI)
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full bg-surface border border-hairline rounded-[8px] p-sm font-title text-title text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
              >
                <option value="Dễ (Band 4.0 - 5.0)">Dễ (Band 4.0 - 5.0)</option>
                <option value="Trung bình (Band 5.5 - 6.5)">Trung bình (Band 5.5 - 6.5)</option>
                <option value="Khó (Band 7.0 - 8.0)">Khó (Band 7.0 - 8.0)</option>
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
            <button
              onClick={() => {
                if (testMode === 'ielts_academic') {
                  handleStartIelts();
                } else {
                  handleStart(false);
                }
              }}
              disabled={isLoadingIelts}
              className="flex-1 bg-primary text-on-primary font-button text-button py-md rounded-full shadow-md hover:bg-primary-active hover:shadow-lg hover:-translate-y-0.5 transition-all active:translate-y-0 active:shadow-sm flex items-center justify-center gap-xs disabled:opacity-70"
            >
              {isLoadingIelts ? <Loader2 size={20} className="animate-spin" /> : null}
              {isLoadingIelts ? 'Đang tạo đề...' : testMode === 'ielts_academic' ? 'Bắt đầu bài thi (AI)' : 'Bắt đầu kiểm tra'}
            </button>
            {wrongWordsInTopic.length > 0 && testMode !== 'ielts_academic' && (
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
        <div className="w-full max-w-xl flex flex-col items-center">
          {/* Progress */}
          <div className="w-full mb-xxl">
            <div className="flex justify-between font-eyebrow text-eyebrow text-ink-muted uppercase mb-xs tracking-wide">
              <span>Tiến độ</span>
              <span>{currentIndex + 1} / {shuffledWords.length}</span>
            </div>
            <div className="h-3 w-full bg-hairline rounded-full overflow-hidden shadow-inner">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${((currentIndex) / shuffledWords.length) * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-surface border border-hairline rounded-[16px] p-[40px] shadow-sm w-full flex flex-col items-center relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-[-50px] right-[-50px] w-32 h-32 bg-accent-sky/5 rounded-full blur-2xl pointer-events-none"></div>
            <div className="absolute bottom-[-50px] left-[-50px] w-40 h-40 bg-accent-purple/5 rounded-full blur-2xl pointer-events-none"></div>

            <button
              onClick={() => speak(shuffledWords[currentIndex].word.word)}
              className="w-32 h-32 bg-primary/5 rounded-full flex items-center justify-center mb-xl hover:bg-primary/10 transition-colors active:scale-90 text-primary shadow-sm border border-primary/20 relative group"
            >
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <Volume2 size={64} className="relative z-10" />
            </button>

            <p className="font-title text-title text-ink-muted mb-lg text-center">
              Nghe và {testMode === 'multiple_choice' ? 'chọn từ thích hợp' : 'gõ lại từ vựng bạn vừa nghe được'}
            </p>

            {testMode === 'typing' ? (
              <>
                <input
                  ref={inputRef}
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Gõ từ vựng vào đây..."
                  className="w-full text-center bg-canvas-soft border-2 border-hairline rounded-[12px] py-lg px-xl font-display-2 text-display-2 text-ink focus:outline-none focus:border-primary focus:bg-surface transition-all mb-xl placeholder:text-ink-faint"
                  autoComplete="off"
                  spellCheck="false"
                />

                {showHint && (
                  <div className="w-full text-left bg-surface-container-low border border-hairline rounded-[8px] p-md mb-xl animate-in fade-in duration-300">
                    <p className="font-title text-title text-ink mb-xs">
                      <span className="font-bold">Nghĩa:</span> {shuffledWords[currentIndex].word.meaning}
                    </p>
                    {shuffledWords[currentIndex].word.exampleSentence && (
                      <p className="font-body-md text-body-md text-ink-muted">
                        <span className="font-bold">Ví dụ:</span> {shuffledWords[currentIndex].word.exampleSentence}
                      </p>
                    )}
                    {shuffledWords[currentIndex].word.exampleTranslation && (
                      <p className="font-body-md text-body-md text-ink-muted mt-xs">
                        <span className="font-bold">Dịch:</span> {shuffledWords[currentIndex].word.exampleTranslation}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-sm w-full">
                  <button
                    onClick={() => setShowHint(true)}
                    disabled={showHint}
                    className="w-1/3 bg-surface-container-high text-on-surface rounded-full py-md px-lg font-title text-title hover:bg-surface-container-highest transition-all active:scale-[0.98] shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Gợi ý
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={!userInput.trim()}
                    className="w-2/3 bg-primary text-on-primary rounded-full py-md px-lg font-title text-title hover:bg-primary-active transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-sm flex items-center justify-center gap-xs"
                  >
                    Tiếp tục
                  </button>
                </div>
              </>
            ) : (
              <>
                {showHint && (
                  <div className="w-full text-left bg-surface-container-low border border-hairline rounded-[8px] p-md mb-xl animate-in fade-in duration-300">
                    <p className="font-title text-title text-ink mb-xs">
                      <span className="font-bold">Nghĩa:</span> {shuffledWords[currentIndex].word.meaning}
                    </p>
                    {shuffledWords[currentIndex].word.exampleSentence && (
                      <p className="font-body-md text-body-md text-ink-muted">
                        <span className="font-bold">Ví dụ:</span> {shuffledWords[currentIndex].word.exampleSentence}
                      </p>
                    )}
                    {shuffledWords[currentIndex].word.exampleTranslation && (
                      <p className="font-body-md text-body-md text-ink-muted mt-xs">
                        <span className="font-bold">Dịch:</span> {shuffledWords[currentIndex].word.exampleTranslation}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-md w-full mb-lg">
                  {shuffledWords[currentIndex].options.map((opt, i) => {
                    const isSelected = selectedOption && selectedOption.id === opt.id;
                    const isCorrectAnswer = opt.id === shuffledWords[currentIndex].word.id;

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

                <button
                  onClick={() => setShowHint(true)}
                  disabled={showHint}
                  className="w-full bg-surface-container-high text-on-surface rounded-full py-md px-lg font-title text-title hover:bg-surface-container-highest transition-all active:scale-[0.98] shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                >
                  Gợi ý
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {testState === 'results' && (
        <div className="w-full max-w-3xl flex flex-col py-xl">
          <div className="w-full bg-surface border border-hairline rounded-[16px] p-xxl shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-accent-green via-accent-sky to-accent-purple"></div>

            <div className="flex flex-col md:flex-row items-center gap-xxl mb-xxl mt-md">
              {/* Pie Chart */}
              <div className="relative w-48 h-48 flex-shrink-0 shadow-soft rounded-full">
                <div
                  className="w-full h-full rounded-full"
                  style={{ background: `conic-gradient(#1aae39 ${Math.round((results.filter(r => r.isCorrect).length / results.length) * 100)}%, #f6f5f4 0)` }}
                ></div>
                <div className="absolute inset-3 bg-surface rounded-full flex flex-col items-center justify-center shadow-inner">
                  <span className="font-display-1 text-display-1 text-ink leading-none tracking-tight">{Math.round((results.filter(r => r.isCorrect).length / results.length) * 100)}%</span>
                </div>
              </div>

              <div className="flex-1 text-center md:text-left">
                <h2 className="font-display-2 text-display-2 text-ink mb-sm tracking-tight">Hoàn thành xuất sắc!</h2>
                <p className="font-title text-title text-ink-muted mb-xl leading-relaxed">
                  Bạn đã trả lời đúng <strong className="text-accent-green text-[1.2em]">{results.filter(r => r.isCorrect).length}</strong> trên tổng số <strong>{results.length}</strong> từ vựng.
                </p>
                <div className="flex flex-wrap gap-md justify-center md:justify-start">
                  <button
                    onClick={() => { setTestState('setup'); }}
                    className="bg-primary text-on-primary rounded-full py-sm px-xl font-button text-button hover:bg-primary-active transition-colors shadow-sm flex items-center gap-sm active:scale-95"
                  >
                    <RotateCcw size={20} /> Luyện tập lại
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t border-hairline pt-xl">
              <h3 className="font-heading-2 text-heading-2 text-ink mb-xl">Chi tiết đáp án</h3>
              <div className="flex flex-col gap-md">
                {results.map((item, idx) => (
                  <div key={idx} className={`flex items-center gap-lg p-lg rounded-[12px] border ${item.isCorrect ? 'border-accent-green/30 bg-accent-green/5' : 'border-accent-orange/30 bg-accent-orange/5'}`}>
                    <div className="flex-shrink-0">
                      {item.isCorrect ? (
                        <div className="w-12 h-12 rounded-full bg-accent-green flex items-center justify-center text-surface shadow-sm">
                          <Check size={24} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-accent-orange flex items-center justify-center text-surface shadow-sm">
                          <X size={24} strokeWidth={3} />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 flex flex-col md:flex-row md:items-center justify-between gap-sm">
                      <div>
                        <div className="font-heading-3 text-heading-3 text-ink flex items-center gap-xs">
                          {item.word.word}
                          {!item.isCorrect && (
                            <button onClick={() => speak(item.word.word)} className="text-primary hover:bg-primary/10 p-1 rounded-full transition-colors">
                              <Volume2 size={16} />
                            </button>
                          )}
                        </div>
                        <div className="font-body-md text-body-md text-ink-muted">{item.word.meaning}</div>
                      </div>

                      <div className="text-right bg-surface px-md py-sm rounded-[8px] border border-hairline shadow-sm min-w-[120px]">
                        <div className="font-eyebrow text-eyebrow uppercase text-ink-faint mb-[4px]">Bạn đã nhập</div>
                        <div className={`font-title text-title ${item.isCorrect ? 'text-accent-green' : 'text-accent-orange line-through decoration-2'}`}>
                          {item.userAnswer || '(Bỏ trống)'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {testState === 'playing_ielts' && ieltsTest && (
        <div className="w-full max-w-5xl flex flex-col md:flex-row gap-lg py-lg">

          <div className="md:w-1/3 flex flex-col gap-lg sticky top-lg h-fit">
            <div className="bg-surface border border-hairline rounded-[16px] p-xl shadow-sm text-center">
              <h3 className="font-heading-3 text-heading-3 text-ink mb-md">IELTS Listening (Mini Test)</h3>

              <div className="w-24 h-24 mx-auto bg-accent-purple/10 rounded-full flex items-center justify-center mb-lg shadow-inner border border-accent-purple/20">
                <Volume2 size={48} className="text-accent-purple" />
              </div>

              <p className="font-body-md text-body-md text-ink-muted mb-md">
                Hãy chuẩn bị sẵn sàng. Audio chỉ được nghe 1 lần duy nhất!
              </p>

              <div className="mb-lg flex flex-col items-center gap-xs w-full max-w-[200px] mx-auto">
                <label className="font-body-sm text-ink-muted flex justify-between w-full">
                  <span>Tốc độ đọc:</span>
                  <span className="font-bold text-ink">{audioRate}x</span>
                </label>
                <input 
                  type="range" 
                  min="0.5" 
                  max="1.5" 
                  step="0.1" 
                  value={audioRate} 
                  onChange={(e) => setAudioRate(parseFloat(e.target.value))}
                  disabled={audioState === 'playing'}
                  className="w-full accent-accent-purple"
                />
              </div>

              {audioState === 'idle' ? (
                <button
                  onClick={playIeltsAudio}
                  className="w-full bg-accent-purple text-surface font-button text-button py-md rounded-full shadow-md hover:bg-accent-purple/90 hover:-translate-y-0.5 transition-all flex justify-center items-center gap-xs"
                >
                  <Play size={20} fill="currentColor" /> Phát Audio
                </button>
              ) : audioState === 'playing' ? (
                <div className="w-full flex items-center justify-center gap-sm bg-accent-sky/10 text-accent-sky font-title text-title py-md rounded-full border border-accent-sky/20">
                  <span className="flex gap-[2px]">
                    <span className="w-1.5 h-4 bg-accent-sky rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-6 bg-accent-sky rounded-full animate-bounce" style={{ animationDelay: '100ms' }}></span>
                    <span className="w-1.5 h-4 bg-accent-sky rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></span>
                  </span>
                  Đang phát...
                </div>
              ) : (
                <div className="w-full bg-surface-container-low text-ink-muted font-title text-title py-md rounded-full border border-hairline flex flex-col items-center justify-center">
                  <span>Audio đã kết thúc.</span>
                </div>
              )}
            </div>

            {audioState === 'finished' && (
              <div className="bg-surface border border-hairline rounded-[16px] p-lg shadow-sm text-center flex flex-col items-center justify-center">
                <Clock size={32} className={`${timeLeft <= 30 ? 'text-accent-orange animate-pulse' : 'text-ink-muted'} mb-sm`} />
                <div className={`font-display-2 text-display-2 ${timeLeft <= 30 ? 'text-accent-orange' : 'text-ink'} mb-xs`}>
                  {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                </div>
                <div className="font-eyebrow text-eyebrow text-ink-muted uppercase mb-lg">Thời gian kiểm tra lại</div>

                <button
                  onClick={submitIeltsTest}
                  className="w-full bg-primary text-on-primary font-button text-button py-md rounded-full shadow-md hover:bg-primary-active hover:shadow-lg transition-all"
                >
                  Nộp bài ngay
                </button>
              </div>
            )}
          </div>

          <div className="md:w-2/3 space-y-xl">
            {ieltsTest.questions.map((q, idx) => (
              <div key={idx} className={`bg-canvas-soft p-md rounded-[12px] border ${audioState === 'idle' ? 'blur-sm pointer-events-none select-none opacity-50' : 'border-hairline'} transition-all duration-500`}>
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
                {audioState === 'finished' && (
                  <div className="mt-md flex flex-col gap-sm">
                    <div className="flex gap-md">
                      <button
                        onClick={() => playAnswerSentence(q.answerSentence)}
                        className="text-primary font-button text-button hover:underline flex items-center gap-xs"
                      >
                        <Volume2 size={16} />
                        Phát lại đoạn chứa câu trả lời
                      </button>
                      <button
                        onClick={() => setVisibleHints({ ...visibleHints, [idx]: !visibleHints[idx] })}
                        className="text-accent-sky font-button text-button hover:underline flex items-center gap-xs"
                      >
                        <BookOpen size={16} />
                        {visibleHints[idx] ? 'Ẩn gợi ý' : 'Gợi ý trả lời'}
                      </button>
                    </div>
                    {visibleHints[idx] && (
                      <div className="p-sm bg-accent-sky/10 border border-accent-sky/20 rounded-[8px] font-body-sm text-ink-muted">
                        <strong className="text-accent-sky">Gợi ý:</strong> {q.hint || 'Không có gợi ý cho câu này.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {testState === 'results_ielts' && ieltsTest && (
        <div className="w-full max-w-5xl flex flex-col md:flex-row gap-lg py-lg">
          <div className="md:w-1/3 flex flex-col gap-lg sticky top-lg h-fit">
            <div className="bg-surface border border-hairline rounded-[16px] p-xl shadow-sm">
              <h2 className="font-display-2 text-display-2 text-ink mb-sm text-center">Kết quả IELTS Listening</h2>
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

            <div className="bg-canvas-soft border border-hairline rounded-[16px] p-lg max-h-[500px] overflow-y-auto">
              <h3 className="font-heading-3 text-heading-3 text-ink mb-sm flex items-center gap-xs"><FileText size={20} /> Transcript (Kịch bản)</h3>
              <p className="font-body-sm text-body-sm text-ink leading-relaxed whitespace-pre-wrap">{renderTranscript()}</p>
            </div>

            <button
              onClick={() => { setTestState('setup'); }}
              className="w-full bg-surface-container-high text-on-surface font-button text-button py-md rounded-full hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-sm shadow-sm"
            >
              <RotateCcw size={20} /> Thi lại Mini Test khác
            </button>
          </div>

          <div className="md:w-2/3 space-y-lg mb-xl">
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
                  <button
                    onClick={() => {
                      playAnswerSentence(q.answerSentence);
                      setHighlightedSentence(q.answerSentence);
                      setTimeout(() => {
                        const el = document.getElementById('highlighted-sentence');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 100);
                    }}
                    className="mt-sm text-accent-purple font-button text-button hover:underline flex items-center gap-xs block"
                  >
                    <Volume2 size={16} />
                    Phát lại đoạn chứa câu trả lời
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
