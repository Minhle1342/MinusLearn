import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Rocket, RotateCcw, AlertTriangle, ShieldAlert, CheckCircle2, User, HelpCircle, Cable, Flame, RefreshCw, Volume2 } from 'lucide-react';
import { speakEnglishText } from '../../utils/speech';

export function WordRescueAstronaut({ words, settings, onAddWord }) {
  const [currentWord, setCurrentWord] = useState(null);
  const [guessedLetters, setGuessedLetters] = useState(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [gameState, setGameState] = useState('playing'); // playing, won, lost
  const [showHint, setShowHint] = useState(false);
  const [isWrongReview, setIsWrongReview] = useState(false);

  // Spaced repetition & frequency decay tracking states
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [wrongWordIds, setWrongWordIds] = useState(new Set());
  const [recentHistory, setRecentHistory] = useState([]);
  const [playCounts, setPlayCounts] = useState({});

  // Refs for tracking values inside callbacks without stale closures or re-render loops
  const consecutiveCorrectRef = useRef(0);
  const wrongWordIdsRef = useRef(new Set());
  const recentHistoryRef = useRef([]);
  const playCountsRef = useRef({});

  const maxMistakes = 6;

  // Auto pronounce word upon completing a question (won or lost)
  useEffect(() => {
    if ((gameState === 'won' || gameState === 'lost') && currentWord?.word) {
      speakEnglishText(currentWord.word, settings?.speechVoiceURI);
    }
  }, [gameState, currentWord, settings?.speechVoiceURI]);

  // Sync refs when state changes manually (e.g. topic switch)
  useEffect(() => {
    consecutiveCorrectRef.current = consecutiveCorrect;
  }, [consecutiveCorrect]);

  useEffect(() => {
    wrongWordIdsRef.current = wrongWordIds;
  }, [wrongWordIds]);

  useEffect(() => {
    recentHistoryRef.current = recentHistory;
  }, [recentHistory]);

  useEffect(() => {
    playCountsRef.current = playCounts;
  }, [playCounts]);

  // Select next word based on 2-round cool-down, wrong question priority (after 3 wins), and frequency decay
  const selectNextWord = useCallback((wordList) => {
    if (!wordList || wordList.length === 0) return null;
    if (wordList.length === 1) return { selected: wordList[0], isPriorityWrong: false };

    const history = recentHistoryRef.current;
    const wrongIds = wrongWordIdsRef.current;
    const streak = consecutiveCorrectRef.current;
    const counts = playCountsRef.current;

    // 1. Exclude words played in the last 2 rounds (cool-down buffer)
    const recent2 = history.slice(-2);
    let candidates = wordList.filter(w => !recent2.includes(w.id));

    // Fallback if filtering eliminates all words (e.g. total words <= 2)
    if (candidates.length === 0) {
      const lastWordId = history[history.length - 1];
      candidates = wordList.filter(w => w.id !== lastWordId);
      if (candidates.length === 0) candidates = wordList;
    }

    // 2. Prioritize wrong questions after 3 consecutive correct answers
    if (streak >= 3 && wrongIds.size > 0) {
      const wrongCandidates = candidates.filter(w => wrongIds.has(w.id));
      if (wrongCandidates.length > 0) {
        // Pick one of the wrong candidate words
        const chosenWrong = wrongCandidates[Math.floor(Math.random() * wrongCandidates.length)];
        return { selected: chosenWrong, isPriorityWrong: true };
      }
    }

    // 3. Frequency Decay Selection (Weighted Random)
    // Weight = 1 / ((playCount || 0) + 1)
    const weights = candidates.map(w => {
      const count = counts[w.id] || 0;
      return 1 / (count + 1);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let randomNum = Math.random() * totalWeight;

    for (let i = 0; i < candidates.length; i++) {
      if (randomNum < weights[i]) {
        return { selected: candidates[i], isPriorityWrong: false };
      }
      randomNum -= weights[i];
    }

    return { selected: candidates[0], isPriorityWrong: false };
  }, []);

  const initGame = useCallback(() => {
    if (!words || words.length === 0) return;
    
    const result = selectNextWord(words);
    if (!result || !result.selected) return;

    const chosen = result.selected;
    
    // If this was a priority wrong question display, reset streak
    if (result.isPriorityWrong) {
      consecutiveCorrectRef.current = 0;
      setConsecutiveCorrect(0);
      setIsWrongReview(true);
    } else {
      setIsWrongReview(false);
    }

    // Record history & play count
    const updatedHistory = [...recentHistoryRef.current, chosen.id];
    recentHistoryRef.current = updatedHistory;
    setRecentHistory(updatedHistory);

    const updatedCounts = {
      ...playCountsRef.current,
      [chosen.id]: (playCountsRef.current[chosen.id] || 0) + 1
    };
    playCountsRef.current = updatedCounts;
    setPlayCounts(updatedCounts);

    // Sanitize word: keep only alphabet letters, convert to uppercase for guessing logic
    const sanitized = chosen.word.toUpperCase().replace(/[^A-Z]/g, '');
    
    if (sanitized.length === 0) {
      setCurrentWord({ ...chosen, normalized: 'WORD' });
    } else {
      setCurrentWord({ ...chosen, normalized: sanitized });
    }
    
    setGuessedLetters(new Set());
    setMistakes(0);
    setGameState('playing');
    setShowHint(false);
  }, [words, selectNextWord]);

  // Reset tracking stats when topic words change completely
  useEffect(() => {
    consecutiveCorrectRef.current = 0;
    setConsecutiveCorrect(0);
    wrongWordIdsRef.current = new Set();
    setWrongWordIds(new Set());
    recentHistoryRef.current = [];
    setRecentHistory([]);
    playCountsRef.current = {};
    setPlayCounts({});
    
    initGame();
  }, [words]);

  const handleGuess = (letter) => {
    if (gameState !== 'playing' || guessedLetters.has(letter)) return;

    const newGuessed = new Set(guessedLetters);
    newGuessed.add(letter);
    setGuessedLetters(newGuessed);

    if (!currentWord.normalized.includes(letter)) {
      const newMistakes = mistakes + 1;
      setMistakes(newMistakes);
      if (newMistakes >= maxMistakes) {
        setGameState('lost');

        // Reset consecutive streak and record word as wrong
        consecutiveCorrectRef.current = 0;
        setConsecutiveCorrect(0);

        const newWrongSet = new Set(wrongWordIdsRef.current);
        newWrongSet.add(currentWord.id);
        wrongWordIdsRef.current = newWrongSet;
        setWrongWordIds(newWrongSet);
      }
    } else {
      // Check win
      const hasWon = currentWord.normalized.split('').every(char => newGuessed.has(char));
      if (hasWon) {
        setGameState('won');

        // Increase consecutive correct streak
        const newStreak = consecutiveCorrectRef.current + 1;
        consecutiveCorrectRef.current = newStreak;
        setConsecutiveCorrect(newStreak);

        // If this word was previously wrong, remove it from wrong set upon master
        if (wrongWordIdsRef.current.has(currentWord.id)) {
          const newWrongSet = new Set(wrongWordIdsRef.current);
          newWrongSet.delete(currentWord.id);
          wrongWordIdsRef.current = newWrongSet;
          setWrongWordIds(newWrongSet);
        }
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState !== 'playing') {
        if (e.key === 'Enter') {
          e.preventDefault();
          initGame();
        }
        return;
      }
      const key = e.key.toUpperCase();
      if (key === 'H') {
        setShowHint(true);
      }
      if (/^[A-Z]$/.test(key)) {
        handleGuess(key);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [guessedLetters, gameState, currentWord, initGame]);

  if (!words || words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-xxl">
        <Rocket size={48} className="text-primary mb-md opacity-50" />
        <h3 className="font-heading-2 text-heading-2 text-on-surface mb-xs">Chưa có từ vựng</h3>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md mb-lg">
          Hãy thêm từ vựng vào chủ đề này để tham gia giải cứu phi hành gia.
        </p>
        <button
          onClick={onAddWord}
          className="bg-primary text-on-primary px-lg py-sm rounded-full font-button text-button hover:bg-primary-active transition-colors"
        >
          Thêm từ vựng mới
        </button>
      </div>
    );
  }

  if (!currentWord) return null;

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
  
  // Visual representation calculation
  // mistakes: 0 -> safe (tether 100%, O2 100%)
  // mistakes: 6 -> lost (tether broken, O2 0%)
  const tetherHealth = Math.max(0, 100 - (mistakes * (100 / maxMistakes)));
  
  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto py-md h-[calc(100vh-200px)] min-h-[600px]">
      
      {/* Game Area Header */}
      <div className="w-full flex justify-between items-center mb-md bg-slate-900 text-slate-200 p-md rounded-2xl shadow-lg border border-slate-700 z-10">
        <div className="flex items-center gap-md">
          <div className={`p-sm rounded-xl transition-colors ${mistakes >= maxMistakes ? 'bg-error/20 text-error' : 'bg-accent-sky/20 text-accent-sky'}`}>
            <User size={24} />
          </div>
          <div>
            <span className="font-label text-[10px] text-slate-400 uppercase tracking-widest block">Trạng thái phi hành gia</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-heading-2 text-heading-2 text-white">
                {gameState === 'playing' ? 'Đang gặp nguy' : gameState === 'won' ? 'Đã giải cứu!' : 'Mất tích!'}
              </span>
              {consecutiveCorrect > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/20">
                  <Flame size={14} className="text-amber-400" />
                  Chuỗi đúng: {consecutiveCorrect}
                </span>
              )}
              {isWrongReview && (
                <span className="flex items-center gap-1 text-xs font-bold text-rose-400 bg-rose-400/10 px-2.5 py-1 rounded-full border border-rose-400/20">
                  <RefreshCw size={13} className="text-rose-400 animate-spin" />
                  Ôn lại câu sai
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-md">
          <div className="flex flex-col items-end mr-md">
            <div className="flex items-center gap-xs text-xs text-slate-400 mb-1">
              <Cable size={14} /> Dây cáp
            </div>
            <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${tetherHealth > 50 ? 'bg-accent-green' : tetherHealth > 20 ? 'bg-accent-yellow' : 'bg-error'}`}
                style={{ width: `${tetherHealth}%` }}
              ></div>
            </div>
          </div>
          <button
            onClick={initGame}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-primary hover:text-on-primary transition-colors border border-slate-600"
            title="Bỏ qua / Chơi từ khác"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>

      {/* Main Game Screen (Space visual) */}
      <div className="relative w-full flex-1 bg-slate-950 rounded-2xl overflow-hidden shadow-inner flex flex-col items-center justify-center mb-md border-2 border-slate-800">
        {/* Simple star background effect */}
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
        
        {/* Astronaut Visual */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[150px] mb-lg">
          <div className={`relative transition-all duration-700 ${gameState === 'lost' ? 'scale-50 opacity-0 rotate-180 translate-y-32' : 'scale-100 opacity-100'}`}>
            <User size={64} className={`
              ${mistakes === 0 ? 'text-white' : ''}
              ${mistakes === 1 ? 'text-slate-200' : ''}
              ${mistakes === 2 ? 'text-accent-yellow' : ''}
              ${mistakes === 3 ? 'text-orange-400' : ''}
              ${mistakes >= 4 ? 'text-error animate-pulse' : ''}
            `} />
            
            {/* Warning symbols based on mistakes */}
            {mistakes > 1 && (
              <AlertTriangle size={24} className="absolute -top-4 -right-4 text-accent-yellow animate-bounce" />
            )}
            {mistakes > 3 && (
              <ShieldAlert size={24} className="absolute -bottom-4 -left-4 text-error animate-ping" />
            )}
          </div>
        </div>

        {/* Word Display */}
        <div className="z-10 flex flex-col items-center mb-xl w-full px-md">
          <div className="flex flex-wrap justify-center gap-xs md:gap-sm mb-lg">
            {currentWord.normalized.split('').map((char, index) => {
              const isRevealed = guessedLetters.has(char) || gameState === 'lost';
              const isMissed = gameState === 'lost' && !guessedLetters.has(char);
              
              return (
                <div 
                  key={index}
                  className={`w-10 h-14 sm:w-12 sm:h-16 border-b-4 flex items-center justify-center text-3xl font-bold transition-all
                    ${isRevealed ? 'border-primary' : 'border-slate-600'}
                    ${isMissed ? 'text-error' : 'text-white'}
                  `}
                >
                  {isRevealed ? char : ''}
                </div>
              );
            })}
          </div>
          
          {/* Hint Section */}
          <div className="text-center min-h-[60px]">
            {!showHint ? (
              <button 
                onClick={() => setShowHint(true)}
                className="flex items-center gap-xs px-md py-sm bg-slate-800 text-slate-300 rounded-full hover:bg-slate-700 transition-colors text-sm"
              >
                <HelpCircle size={16} />
                <span>Nhận tín hiệu giải cứu (Gợi ý)</span>
                <span className="text-xs bg-slate-700 px-1.5 py-0.5 rounded text-slate-300 font-mono">H</span>
              </button>
            ) : (
              <div className="bg-slate-800/80 backdrop-blur-sm border border-primary/30 px-lg py-md rounded-xl max-w-md animate-in fade-in zoom-in">
                <span className="text-xs text-primary uppercase tracking-widest block mb-1">Tín hiệu nhận được:</span>
                <span className="text-white font-body-lg text-lg leading-snug">{currentWord.meaning}</span>
              </div>
            )}
          </div>
        </div>

        {/* Game Over / Win Overlay */}
        {gameState !== 'playing' && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-in fade-in">
            {gameState === 'won' ? (
              <>
                <div className="w-24 h-24 bg-accent-green/20 rounded-full flex items-center justify-center mb-md animate-bounce">
                  <CheckCircle2 size={64} className="text-accent-green" />
                </div>
                <h2 className="font-heading-1 text-heading-1 text-white mb-sm">Nhiệm vụ hoàn thành!</h2>
                <div className="font-body-lg text-slate-300 mb-xl text-center max-w-sm flex flex-col items-center">
                  <span>Bạn đã giải cứu thành công. Từ vựng là:</span>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-primary font-bold text-2xl uppercase tracking-widest">{currentWord.word}</span>
                    <button
                      onClick={() => speakEnglishText(currentWord.word, settings?.speechVoiceURI)}
                      className="p-2 rounded-full bg-slate-800 text-slate-300 hover:bg-primary hover:text-on-primary transition-colors border border-slate-700"
                      title="Phát âm"
                    >
                      <Volume2 size={20} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="w-24 h-24 bg-error/20 rounded-full flex items-center justify-center mb-md">
                  <ShieldAlert size={64} className="text-error" />
                </div>
                <h2 className="font-heading-1 text-heading-1 text-white mb-sm">Nhiệm vụ thất bại!</h2>
                <div className="font-body-lg text-slate-300 mb-xl text-center max-w-sm flex flex-col items-center">
                  <span>Tín hiệu đã mất. Từ vựng chính xác là:</span>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-error font-bold text-2xl uppercase tracking-widest">{currentWord.word}</span>
                    <button
                      onClick={() => speakEnglishText(currentWord.word, settings?.speechVoiceURI)}
                      className="p-2 rounded-full bg-slate-800 text-slate-300 hover:bg-primary hover:text-on-primary transition-colors border border-slate-700"
                      title="Phát âm"
                    >
                      <Volume2 size={20} />
                    </button>
                  </div>
                </div>
              </>
            )}
            <button
              onClick={initGame}
              className="bg-primary text-on-primary px-xl py-md rounded-full font-button text-button hover:bg-primary-active transition-colors shadow-lg flex items-center gap-sm text-lg"
            >
              <span>Tiếp tục giải cứu</span>
              <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full text-on-primary/80 font-mono">Enter ↵</span>
            </button>
          </div>
        )}
      </div>

      {/* Keyboard Area */}
      <div className="w-full shrink-0">
        <div className="flex flex-wrap justify-center gap-1 sm:gap-2 max-w-3xl mx-auto">
          {alphabet.map(letter => {
            const isGuessed = guessedLetters.has(letter);
            const isCorrect = isGuessed && currentWord.normalized.includes(letter);
            const isWrong = isGuessed && !currentWord.normalized.includes(letter);
            
            return (
              <button
                key={letter}
                onClick={() => handleGuess(letter)}
                disabled={isGuessed || gameState !== 'playing'}
                className={`
                  w-10 h-12 sm:w-12 sm:h-14 rounded-lg font-bold text-lg sm:text-xl flex items-center justify-center transition-all
                  ${!isGuessed ? 'bg-surface hover:bg-surface-container-highest text-on-surface border border-hairline shadow-sm hover:shadow active:scale-95 cursor-pointer' : ''}
                  ${isCorrect ? 'bg-accent-green text-white border-transparent' : ''}
                  ${isWrong ? 'bg-slate-200 text-slate-400 border-transparent opacity-50' : ''}
                `}
              >
                {letter}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

