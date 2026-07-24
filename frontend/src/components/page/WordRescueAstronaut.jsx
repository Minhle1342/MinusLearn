import React, { useState, useEffect, useCallback } from 'react';
import { Rocket, RotateCcw, AlertTriangle, ShieldAlert, CheckCircle2, User, HelpCircle, HeartPulse, Cable } from 'lucide-react';

export function WordRescueAstronaut({ words, onAddWord }) {
  const [currentWord, setCurrentWord] = useState(null);
  const [guessedLetters, setGuessedLetters] = useState(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [gameState, setGameState] = useState('playing'); // playing, won, lost
  const [showHint, setShowHint] = useState(false);
  const maxMistakes = 6;

  const initGame = useCallback(() => {
    if (!words || words.length === 0) return;
    
    // Pick random word
    const randomWord = words[Math.floor(Math.random() * words.length)];
    // Sanitize word: keep only alphabet letters, convert to uppercase for guessing logic
    const sanitized = randomWord.word.toUpperCase().replace(/[^A-Z]/g, '');
    
    if (sanitized.length === 0) {
      // Fallback if word contains no letters
      setCurrentWord({ ...randomWord, normalized: 'WORD' });
    } else {
      setCurrentWord({ ...randomWord, normalized: sanitized });
    }
    
    setGuessedLetters(new Set());
    setMistakes(0);
    setGameState('playing');
    setShowHint(false);
  }, [words]);

  useEffect(() => {
    initGame();
  }, [initGame]);

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
      }
    } else {
      // Check win
      const hasWon = currentWord.normalized.split('').every(char => newGuessed.has(char));
      if (hasWon) {
        setGameState('won');
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState !== 'playing') return;
      const key = e.key.toUpperCase();
      if (/^[A-Z]$/.test(key)) {
        handleGuess(key);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [guessedLetters, gameState, currentWord]);

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
            <div className="flex items-center gap-2">
              <span className="font-heading-2 text-heading-2 text-white">
                {gameState === 'playing' ? 'Đang gặp nguy' : gameState === 'won' ? 'Đã giải cứu!' : 'Mất tích!'}
              </span>
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
                <HelpCircle size={16} /> Nhận tín hiệu giải cứu (Gợi ý)
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
                <p className="font-body-lg text-slate-300 mb-xl text-center max-w-sm">
                  Bạn đã giải cứu thành công. Từ vựng là: <br/>
                  <span className="text-primary font-bold text-2xl uppercase tracking-widest mt-2 block">{currentWord.word}</span>
                </p>
              </>
            ) : (
              <>
                <div className="w-24 h-24 bg-error/20 rounded-full flex items-center justify-center mb-md">
                  <ShieldAlert size={64} className="text-error" />
                </div>
                <h2 className="font-heading-1 text-heading-1 text-white mb-sm">Nhiệm vụ thất bại!</h2>
                <p className="font-body-lg text-slate-300 mb-xl text-center max-w-sm">
                  Tín hiệu đã mất. Từ vựng chính xác là: <br/>
                  <span className="text-error font-bold text-2xl uppercase tracking-widest mt-2 block">{currentWord.word}</span>
                </p>
              </>
            )}
            <button
              onClick={initGame}
              className="bg-primary text-on-primary px-xl py-md rounded-full font-button text-button hover:bg-primary-active transition-colors shadow-lg flex items-center gap-sm text-lg"
            >
              Tiếp tục giải cứu
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
