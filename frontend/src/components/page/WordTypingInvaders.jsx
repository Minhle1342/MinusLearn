import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, Heart, Zap, ShieldAlert } from 'lucide-react';

export function WordTypingInvaders({ words, onAddWord }) {
  const canvasRef = useRef(null);
  const [gameState, setGameState] = useState('idle'); // idle, playing, gameover
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [inputValue, setInputValue] = useState('');
  
  const stateRef = useRef({
    fallingWords: [],
    lastSpawnTime: 0,
    spawnRate: 2000, // spawn every 2 seconds initially
    speedMultiplier: 1,
    score: 0,
    lives: 3,
    wordsPool: [],
    particles: []
  });

  const requestRef = useRef();

  // Initialize pool
  useEffect(() => {
    if (words && words.length > 0) {
      stateRef.current.wordsPool = [...words];
    }
  }, [words]);

  const spawnWord = (timestamp) => {
    const state = stateRef.current;
    if (state.wordsPool.length === 0) return;
    
    // Spawn rate decreases (gets faster) as score increases, cap at 600ms
    const currentSpawnRate = Math.max(600, 2000 - (state.score * 50));
    
    if (timestamp - state.lastSpawnTime > currentSpawnRate) {
      const randomWord = state.wordsPool[Math.floor(Math.random() * state.wordsPool.length)];
      const canvas = canvasRef.current;
      
      if (canvas) {
        // Base speed increases with score
        const baseSpeed = 0.5 + (state.score * 0.05);
        
        state.fallingWords.push({
          id: Math.random().toString(36).substr(2, 9),
          word: randomWord.word.toLowerCase(),
          meaning: randomWord.meaning,
          x: Math.random() * (canvas.width - 150) + 75,
          y: -30,
          speed: baseSpeed + Math.random() * 0.5,
          color: `hsl(${Math.random() * 360}, 70%, 60%)`
        });
        state.lastSpawnTime = timestamp;
      }
    }
  };

  const createExplosion = (x, y, color) => {
    const state = stateRef.current;
    for (let i = 0; i < 15; i++) {
      state.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1,
        color
      });
    }
  };

  const draw = useCallback((timestamp) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const state = stateRef.current;

    // Fix DPI scaling for sharp text
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'playing') {
      spawnWord(timestamp);

      // Draw and update falling words
      for (let i = state.fallingWords.length - 1; i >= 0; i--) {
        const fw = state.fallingWords[i];
        fw.y += fw.speed;

        // Draw meteor/word
        ctx.save();
        ctx.translate(fw.x, fw.y);
        
        // Aura
        ctx.shadowBlur = 15;
        ctx.shadowColor = fw.color;
        
        // Box
        ctx.fillStyle = 'rgba(30, 41, 59, 0.8)'; // slate-800
        ctx.strokeStyle = fw.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-75, -20, 150, 40, 8);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0; // reset
        
        // Text - Meaning
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Truncate meaning if too long, or let it overflow (canvas clips it manually if we want, but just draw it)
        let displayMeaning = fw.meaning;
        if (displayMeaning.length > 20) displayMeaning = displayMeaning.substring(0, 17) + '...';
        ctx.fillText(displayMeaning, 0, -5);
        
        // Text - Word length hint
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '11px "Inter", sans-serif';
        ctx.fillText(`${fw.word.length} letters`, 0, 12);

        ctx.restore();

        // Check floor collision
        if (fw.y > canvas.height + 20) {
          state.fallingWords.splice(i, 1);
          state.lives -= 1;
          setLives(state.lives);
          
          if (state.lives <= 0) {
            setGameState('gameover');
          }
        }
      }

      // Draw and update particles
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
        
        if (p.life <= 0) {
          state.particles.splice(i, 1);
        } else {
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    if (gameState === 'playing') {
      requestRef.current = requestAnimationFrame(draw);
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'playing') {
      requestRef.current = requestAnimationFrame(draw);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [gameState, draw]);

  const startGame = () => {
    stateRef.current.fallingWords = [];
    stateRef.current.particles = [];
    stateRef.current.score = 0;
    stateRef.current.lives = 3;
    stateRef.current.lastSpawnTime = performance.now();
    setScore(0);
    setLives(3);
    setInputValue('');
    setGameState('playing');
  };

  const handleInputChange = (e) => {
    const val = e.target.value.toLowerCase();
    setInputValue(val);

    if (gameState !== 'playing') return;

    const state = stateRef.current;
    const matchIndex = state.fallingWords.findIndex(fw => fw.word === val.trim());

    if (matchIndex !== -1) {
      // Destroy word!
      const fw = state.fallingWords[matchIndex];
      createExplosion(fw.x, fw.y, fw.color);
      state.fallingWords.splice(matchIndex, 1);
      
      state.score += 10;
      setScore(state.score);
      setInputValue(''); // auto clear on match
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      setInputValue(''); // Allow manual clear if they typo'd
    }
  };

  if (!words || words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-xxl">
        <ShieldAlert size={48} className="text-primary mb-md opacity-50" />
        <h3 className="font-heading-2 text-heading-2 text-on-surface mb-xs">Chưa có từ vựng</h3>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md mb-lg">
          Hãy thêm từ vựng vào chủ đề này để bắt đầu chơi Typing Invaders.
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

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto py-md h-[calc(100vh-200px)] min-h-[500px]">
      {/* Header Info */}
      <div className="w-full flex justify-between items-center mb-sm bg-surface-container p-md rounded-2xl shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-md">
          <div className="bg-primary/10 p-sm rounded-xl">
            <Zap className="text-primary" size={24} />
          </div>
          <div>
            <span className="font-label text-label text-on-surface-variant uppercase tracking-wider block">Điểm số</span>
            <span className="font-heading-2 text-heading-2 text-primary">{score}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-xs">
          {[...Array(3)].map((_, i) => (
            <Heart 
              key={i} 
              size={24} 
              className={i < lives ? "text-error fill-error animate-pulse" : "text-surface-container-highest"} 
            />
          ))}
        </div>
      </div>

      {/* Game Area */}
      <div className="relative w-full flex-1 bg-slate-900 rounded-t-2xl overflow-hidden border-2 border-slate-800 border-b-0 shadow-inner">
        {gameState === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 z-20 backdrop-blur-sm">
            <ShieldAlert size={64} className="text-primary mb-md" />
            <h2 className="font-heading-1 text-heading-1 text-white mb-sm">Typing Invaders</h2>
            <p className="font-body-md text-slate-300 mb-lg text-center max-w-sm">
              Bảo vệ căn cứ bằng cách gõ chính xác từ vựng tiếng Anh tương ứng với nghĩa tiếng Việt đang rơi xuống!
            </p>
            <button
              onClick={startGame}
              className="bg-primary text-on-primary px-xl py-md rounded-full font-button text-button hover:bg-primary-active transition-colors shadow-lg shadow-primary/30 flex items-center gap-sm text-lg"
            >
              <Play size={24} />
              Bắt đầu
            </button>
          </div>
        )}

        {gameState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-error/10 z-20 backdrop-blur-sm animate-in fade-in">
            <h2 className="font-heading-1 text-heading-1 text-error mb-sm text-shadow">GAME OVER</h2>
            <p className="font-body-lg text-slate-200 mb-xl">
              Bạn đạt được: <span className="font-bold text-white text-2xl">{score}</span> điểm
            </p>
            <button
              onClick={startGame}
              className="bg-error text-white px-xl py-md rounded-full font-button text-button hover:bg-red-600 transition-colors shadow-lg shadow-error/30 flex items-center gap-sm text-lg"
            >
              <RotateCcw size={24} />
              Chơi lại
            </button>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="block w-full h-full"
        />
      </div>

      {/* Input Area */}
      <div className="w-full bg-slate-800 p-md rounded-b-2xl border-2 border-t-0 border-slate-700 shadow-xl shrink-0 flex items-center gap-sm">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={gameState !== 'playing'}
          placeholder={gameState === 'playing' ? "Gõ từ tiếng Anh vào đây..." : "Nhấn Bắt đầu để chơi"}
          className="flex-1 bg-slate-900 text-white border-2 border-slate-600 rounded-xl px-lg py-md font-body-lg text-lg focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
          autoFocus={gameState === 'playing'}
          autoComplete="off"
          spellCheck="false"
        />
        <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center shrink-0">
          <span className="text-slate-400 font-bold tracking-widest text-sm">↵</span>
        </div>
      </div>
    </div>
  );
}
