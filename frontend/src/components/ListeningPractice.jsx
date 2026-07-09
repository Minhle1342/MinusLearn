import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Play, RotateCcw, Check, X, CheckCircle2, XCircle } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export function ListeningPractice({ words, activeTopicId, topics }) {
  const [testState, setTestState] = useState('setup'); // 'setup', 'playing', 'results'
  const [wordCount, setWordCount] = useState(10);
  const [shuffledWords, setShuffledWords] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [results, setResults] = useState([]);
  
  // Toast State: { message: string, type: 'success' | 'error' } | null
  const [toast, setToast] = useState(null);
  
  const [showHint, setShowHint] = useState(false);
  
  const [mistakes, setMistakes] = useLocalStorage('minuslearn_mistakes', {});

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

  const speak = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
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
    
    setShuffledWords(selected);
    setCurrentIndex(0);
    setResults([]);
    setUserInput('');
    setTestState('playing');
    setToast(null);
    setShowHint(false);
    
    // Speak first word after a tiny delay to ensure UI updates
    setTimeout(() => {
      speak(selected[0].word);
      if (inputRef.current) inputRef.current.focus();
    }, 300);
  };

  const handleNext = () => {
    if (!userInput.trim()) return;

    const currentWord = shuffledWords[currentIndex];
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
        speak(shuffledWords[currentIndex + 1].word);
        if (inputRef.current) inputRef.current.focus();
      }, 300);
    } else {
      setTestState('results');
    }
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
        <div className="w-24 h-24 bg-surface rounded-full flex items-center justify-center shadow-sm mb-lg border border-hairline">
          <Volume2 size={40} className="text-on-surface-variant" />
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
          <p className="font-body-md text-body-md text-ink-muted mb-xxl">
            Chủ đề <span className="font-bold text-ink px-1">{currentTopic?.name}</span> hiện có {topicWords.length} từ vựng. <br/>Sẵn sàng kiểm tra đôi tai của bạn chưa?
          </p>

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
              onClick={() => speak(shuffledWords[currentIndex].word)}
              className="w-32 h-32 bg-primary/5 rounded-full flex items-center justify-center mb-xl hover:bg-primary/10 transition-colors active:scale-90 text-primary shadow-sm border border-primary/20 relative group"
            >
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <Volume2 size={64} className="relative z-10" />
            </button>

            <p className="font-title text-title text-ink-muted mb-lg text-center">
              Nghe và gõ lại từ vựng bạn vừa nghe được
            </p>

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
                  <span className="font-bold">Nghĩa:</span> {shuffledWords[currentIndex].meaning}
                </p>
                {shuffledWords[currentIndex].exampleSentence && (
                  <p className="font-body-md text-body-md text-ink-muted">
                    <span className="font-bold">Ví dụ:</span> {shuffledWords[currentIndex].exampleSentence}
                  </p>
                )}
                {shuffledWords[currentIndex].exampleTranslation && (
                  <p className="font-body-md text-body-md text-ink-muted mt-xs">
                    <span className="font-bold">Dịch:</span> {shuffledWords[currentIndex].exampleTranslation}
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
    </div>
  );
}
