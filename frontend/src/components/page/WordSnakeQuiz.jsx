import React, { useState, useEffect, useRef, useCallback } from 'react';
import { speakEnglishText } from '../../utils/speech';
import { RotateCcw, Trophy, Volume2, Sparkles, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Play, Pause, BookOpen, ShieldAlert, Heart, Zap } from 'lucide-react';

const GRID_COLS = 20;
const GRID_ROWS = 14;

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Smart Apple Spawning Algorithm for Snake Game
 * - Enforces minimum distance (>= 4 tiles) from Snake Head to give reaction time
 * - Enforces minimum spacing (>= 2 tiles) between apples to avoid text label overlap
 * - Prefers inner grid cells away from extreme edges
 * - Provides graceful fallback if space is tight
 */
function getSmartFreeCoordinates(snake, count = 5) {
  const head = snake[0] || { x: 5, y: 7 };
  const occupied = new Set();
  snake.forEach(seg => occupied.add(`${seg.x},${seg.y}`));

  const selectedCoords = [];
  const MIN_HEAD_DIST = 4; // Manhattan distance from head
  const MIN_APPLE_DIST = 2; // Chebyshev distance between apples

  const isValidCandidate = (x, y, candidates, minHeadDist, minAppleDist) => {
    if (occupied.has(`${x},${y}`)) return false;

    // Check distance from snake head
    const distToHead = Math.abs(x - head.x) + Math.abs(y - head.y);
    if (distToHead < minHeadDist) return false;

    // Check distance from existing selected apples
    for (const c of candidates) {
      const distToApple = Math.max(Math.abs(x - c.x), Math.abs(y - c.y));
      if (distToApple < minAppleDist) return false;
    }

    return true;
  };

  // Collect inner grid cells first (margin 1 tile from outer walls)
  const innerCells = [];
  for (let r = 1; r < GRID_ROWS - 1; r++) {
    for (let c = 1; c < GRID_COLS - 1; c++) {
      if (!occupied.has(`${c},${r}`)) {
        innerCells.push({ x: c, y: r });
      }
    }
  }

  const shuffledInner = shuffleArray(innerCells);

  // Pass 1: Strict constraints (minHeadDist=4, minAppleDist=2)
  for (const cell of shuffledInner) {
    if (selectedCoords.length >= count) break;
    if (isValidCandidate(cell.x, cell.y, selectedCoords, MIN_HEAD_DIST, MIN_APPLE_DIST)) {
      selectedCoords.push(cell);
    }
  }

  // Pass 2: Relax apple-to-apple spacing if not enough items found
  if (selectedCoords.length < count) {
    for (const cell of shuffledInner) {
      if (selectedCoords.length >= count) break;
      if (isValidCandidate(cell.x, cell.y, selectedCoords, 3, 1)) {
        selectedCoords.push(cell);
      }
    }
  }

  // Pass 3: Fallback including border cells if still needed
  if (selectedCoords.length < count) {
    const allCells = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!occupied.has(`${c},${r}`) && !selectedCoords.some(sc => sc.x === c && sc.y === r)) {
          allCells.push({ x: c, y: r });
        }
      }
    }
    const shuffledAll = shuffleArray(allCells);
    for (const cell of shuffledAll) {
      if (selectedCoords.length >= count) break;
      selectedCoords.push(cell);
    }
  }

  return selectedCoords;
}

export function WordSnakeQuiz({ words = [], allWords = [], settings, onAddWord }) {
  const [gameState, setGameState] = useState('IDLE'); // 'IDLE' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'VICTORY'
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameFeedback, setGameFeedback] = useState('');
  const [gameOverReason, setGameOverReason] = useState('');
  const [speedLevel, setSpeedLevel] = useState('medium'); // 'slow' | 'medium' | 'fast'
  
  // Game session data
  const [wordQueue, setWordQueue] = useState([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [targetWord, setTargetWord] = useState(null);
  const [apples, setApples] = useState([]);
  
  // Snake state
  const [snake, setSnake] = useState([
    { x: 5, y: 7 },
    { x: 4, y: 7 },
    { x: 3, y: 7 }
  ]);

  // Directions
  const directionRef = useRef({ x: 1, y: 0 });
  const nextDirectionRef = useRef({ x: 1, y: 0 });
  const feedbackTimeoutRef = useRef(null);
  const canvasRef = useRef(null);
  const tickCountRef = useRef(0);

  const getSpeedMs = (level) => {
    if (level === 'slow') return 240;
    if (level === 'fast') return 130;
    return 185;
  };

  const showFeedback = (msg) => {
    setGameFeedback(msg);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setGameFeedback(''), 2500);
  };

  // Render Realistic Canvas Snake
  const renderSnakeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!snake || snake.length === 0) {
      ctx.restore();
      return;
    }

    const cellW = width / GRID_COLS;
    const cellH = height / GRID_ROWS;

    const points = snake.map(seg => ({
      x: (seg.x + 0.5) * cellW,
      y: (seg.y + 0.5) * cellH,
    }));

    // 1. Draw Underbody Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.shadowOffsetX = 3;

    // Connect body segments with smooth thick line for base body
    if (points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = cellW * 0.72;
      ctx.strokeStyle = '#022c22';
      ctx.stroke();
    }
    ctx.restore();

    // 2. Draw Realistic Snake Body Segments (Tail to Head)
    for (let i = points.length - 1; i >= 0; i--) {
      const pt = points[i];
      const isHead = i === 0;
      const progress = i / (points.length - 1 || 1); // 0 at head, 1 at tail

      // Radius tapers smoothly from head (0.45 cellW) to tail (0.2 cellW)
      const radius = Math.max((cellW * 0.45) * (1 - progress * 0.55), cellW * 0.18);

      ctx.save();
      ctx.translate(pt.x, pt.y);

      if (isHead) {
        // Calculate head orientation
        const dir = directionRef.current;
        let angle = 0;
        if (dir.x === 1) angle = 0;
        else if (dir.x === -1) angle = Math.PI;
        else if (dir.y === -1) angle = -Math.PI / 2;
        else if (dir.y === 1) angle = Math.PI / 2;

        ctx.rotate(angle);

        // --- Viper Head Silhouette ---
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.35, radius * 1.05, 0, 0, Math.PI * 2);
        const headGrad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 2, 0, 0, radius * 1.4);
        headGrad.addColorStop(0, '#34d399'); // Emerald glow
        headGrad.addColorStop(0.5, '#059669'); // Deep emerald scale
        headGrad.addColorStop(1, '#022c22'); // Dark viper border
        ctx.fillStyle = headGrad;
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = '#6ee7b7';
        ctx.stroke();

        // Crown Diamond Scale Motif on Head
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.moveTo(radius * 0.2, -radius * 0.5);
        ctx.lineTo(radius * 0.6, 0);
        ctx.lineTo(radius * 0.2, radius * 0.5);
        ctx.lineTo(-radius * 0.3, 0);
        ctx.closePath();
        ctx.fill();

        // Serpent Eyes (Gold Iris + Vertical Slit Pupil)
        const eyeX = radius * 0.45;
        const eyeY = radius * 0.55;

        [-1, 1].forEach(side => {
          const ey = side * eyeY;
          // Outer Socket
          ctx.fillStyle = '#022c22';
          ctx.beginPath();
          ctx.arc(eyeX, ey, radius * 0.36, 0, Math.PI * 2);
          ctx.fill();

          // Gold Iris
          const eyeGrad = ctx.createRadialGradient(eyeX, ey, 1, eyeX, ey, radius * 0.35);
          eyeGrad.addColorStop(0, '#fef08a');
          eyeGrad.addColorStop(0.7, '#eab308');
          eyeGrad.addColorStop(1, '#854d0e');
          ctx.fillStyle = eyeGrad;
          ctx.beginPath();
          ctx.arc(eyeX, ey, radius * 0.28, 0, Math.PI * 2);
          ctx.fill();

          // Black Vertical Slit Pupil
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.ellipse(eyeX, ey, radius * 0.08, radius * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();

          // Eye Glint
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(eyeX + 1.2, ey - 2, 1.2, 0, Math.PI * 2);
          ctx.fill();
        });

        // Animated Red Fork Tongue
        const isFlicking = Math.sin(tickCountRef.current * 0.35) > 0.3;
        if (isFlicking) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(radius * 1.3, 0);
          ctx.lineTo(radius * 1.85, 0);
          ctx.lineTo(radius * 2.15, -radius * 0.35);
          ctx.moveTo(radius * 1.85, 0);
          ctx.lineTo(radius * 2.15, radius * 0.35);
          ctx.stroke();
        }

      } else {
        // --- Body Scale Segment ---
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);

        // Scales Gradient alternating colors
        const segGrad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 1, 0, 0, radius);
        if (i % 2 === 0) {
          segGrad.addColorStop(0, '#10b981');
          segGrad.addColorStop(0.7, '#047857');
          segGrad.addColorStop(1, '#064e3b');
        } else {
          segGrad.addColorStop(0, '#34d399');
          segGrad.addColorStop(0.7, '#059669');
          segGrad.addColorStop(1, '#022c22');
        }
        ctx.fillStyle = segGrad;
        ctx.fill();

        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.4)';
        ctx.stroke();

        // Scale shine highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(-radius * 0.2, -radius * 0.2, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.restore();
  }, [snake]);

  useEffect(() => {
    renderSnakeCanvas();
  }, [renderSnakeCanvas]);

  // Window resize handler for canvas
  useEffect(() => {
    const handleResize = () => renderSnakeCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderSnakeCanvas]);

  // Initialize new game session
  const initGame = useCallback(() => {
    if (!words || words.length === 0) return;

    const shuffled = shuffleArray(words);
    const initialSnake = [
      { x: 5, y: 7 },
      { x: 4, y: 7 },
      { x: 3, y: 7 }
    ];

    directionRef.current = { x: 1, y: 0 };
    nextDirectionRef.current = { x: 1, y: 0 };
    tickCountRef.current = 0;
    setSnake(initialSnake);
    setWordQueue(shuffled);
    setCurrentWordIndex(0);
    setScore(0);
    setLives(3);
    setGameOverReason('');
    setGameFeedback('');

    const firstWord = shuffled[0];
    setTargetWord(firstWord);

    // Generate 5 apples (1 correct, 4 distractors)
    const pool = (allWords && allWords.length >= 5 ? allWords : words).filter(w => w.id !== firstWord.id);
    const distractors = shuffleArray(pool).slice(0, 4);

    while (distractors.length < 4) {
      distractors.push({
        id: `dummy-${distractors.length}`,
        word: `Word ${distractors.length + 1}`,
        meaning: `Nghĩa phụ ${distractors.length + 1}`
      });
    }

    const roundApplesData = shuffleArray([
      { id: firstWord.id, meaning: firstWord.meaning, isCorrect: true },
      ...distractors.map(d => ({ id: d.id, meaning: d.meaning, isCorrect: false }))
    ]);

    const coords = getSmartFreeCoordinates(initialSnake, 5);
    const positionedApples = roundApplesData.map((item, idx) => ({
      ...item,
      x: coords[idx]?.x ?? 0,
      y: coords[idx]?.y ?? 0
    }));

    setApples(positionedApples);
    setGameState('PLAYING');

    if (firstWord.word) {
      speakEnglishText(firstWord.word, settings?.speechVoiceURI);
    }
  }, [words, allWords, settings?.speechVoiceURI]);

  // Setup apples for a new target word
  const setupNextRound = useCallback((nextWord, currentSnake) => {
    setTargetWord(nextWord);
    
    const pool = (allWords && allWords.length >= 5 ? allWords : words).filter(w => w.id !== nextWord.id);
    const distractors = shuffleArray(pool).slice(0, 4);

    while (distractors.length < 4) {
      distractors.push({
        id: `dummy-${distractors.length}`,
        word: `Word ${distractors.length + 1}`,
        meaning: `Nghĩa phụ ${distractors.length + 1}`
      });
    }

    const roundApplesData = shuffleArray([
      { id: nextWord.id, meaning: nextWord.meaning, isCorrect: true },
      ...distractors.map(d => ({ id: d.id, meaning: d.meaning, isCorrect: false }))
    ]);

    const coords = getSmartFreeCoordinates(currentSnake, 5);
    const positionedApples = roundApplesData.map((item, idx) => ({
      ...item,
      x: coords[idx]?.x ?? 0,
      y: coords[idx]?.y ?? 0
    }));

    setApples(positionedApples);

    if (nextWord.word) {
      speakEnglishText(nextWord.word, settings?.speechVoiceURI);
    }
  }, [words, allWords, settings?.speechVoiceURI]);

  // Keyboard navigation handler (WASD + Arrow keys)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState !== 'PLAYING') return;

      const key = e.key.toLowerCase();
      const currentDir = directionRef.current;

      if ((key === 'w' || e.key === 'ArrowUp') && currentDir.y === 0) {
        nextDirectionRef.current = { x: 0, y: -1 };
        e.preventDefault();
      } else if ((key === 's' || e.key === 'ArrowDown') && currentDir.y === 0) {
        nextDirectionRef.current = { x: 0, y: 1 };
        e.preventDefault();
      } else if ((key === 'a' || e.key === 'ArrowLeft') && currentDir.x === 0) {
        nextDirectionRef.current = { x: -1, y: 0 };
        e.preventDefault();
      } else if ((key === 'd' || e.key === 'ArrowRight') && currentDir.x === 0) {
        nextDirectionRef.current = { x: 1, y: 0 };
        e.preventDefault();
      } else if (key === ' ') {
        setGameState(prev => prev === 'PLAYING' ? 'PAUSED' : prev === 'PAUSED' ? 'PLAYING' : prev);
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  // Main game tick loop
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const tick = () => {
      tickCountRef.current++;
      directionRef.current = nextDirectionRef.current;
      const dir = directionRef.current;

      setSnake(prevSnake => {
        const head = prevSnake[0];
        const newHead = { x: head.x + dir.x, y: head.y + dir.y };

        // 1. Check Wall Collision
        if (newHead.x < 0 || newHead.x >= GRID_COLS || newHead.y < 0 || newHead.y >= GRID_ROWS) {
          if (lives <= 1) {
            setLives(0);
            setGameState('GAME_OVER');
            setGameOverReason('Rắn đã đâm vào tường!');
            return prevSnake;
          } else {
            setLives(l => l - 1);
            showFeedback('⚠️ 💥 Đâm vào tường! (-1 Mạng)');
            const resetSnake = [
              { x: 5, y: 7 },
              { x: 4, y: 7 },
              { x: 3, y: 7 }
            ];
            directionRef.current = { x: 1, y: 0 };
            nextDirectionRef.current = { x: 1, y: 0 };
            return resetSnake;
          }
        }

        // 2. Check Self Collision
        if (prevSnake.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
          if (lives <= 1) {
            setLives(0);
            setGameState('GAME_OVER');
            setGameOverReason('Rắn đã tự đâm vào thân!');
            return prevSnake;
          } else {
            setLives(l => l - 1);
            showFeedback('⚠️ 🌀 Tự đâm vào thân! (-1 Mạng)');
            const resetSnake = [
              { x: 5, y: 7 },
              { x: 4, y: 7 },
              { x: 3, y: 7 }
            ];
            directionRef.current = { x: 1, y: 0 };
            nextDirectionRef.current = { x: 1, y: 0 };
            return resetSnake;
          }
        }

        // 3. Check Apple Collision
        const hitAppleIndex = apples.findIndex(app => app.x === newHead.x && app.y === newHead.y);

        if (hitAppleIndex !== -1) {
          const hitApple = apples[hitAppleIndex];

          if (hitApple.isCorrect) {
            // Correct Apple eaten!
            const newScore = score + 1;
            setScore(newScore);
            setHighScore(prev => Math.max(prev, newScore));
            showFeedback(`✨ Chính xác! "${targetWord?.word}" = "${targetWord?.meaning}"`);

            const newSnake = [newHead, ...prevSnake]; // Snake grows!
            const nextIdx = currentWordIndex + 1;

            if (nextIdx >= wordQueue.length) {
              setGameState('VICTORY');
            } else {
              setCurrentWordIndex(nextIdx);
              setupNextRound(wordQueue[nextIdx], newSnake);
            }

            return newSnake;
          } else {
            // Incorrect Apple eaten!
            if (lives <= 1) {
              setLives(0);
              setGameState('GAME_OVER');
              setGameOverReason(`Ăn nhầm bản dịch sai: "${hitApple.meaning}" (Đúng: "${targetWord?.meaning}")`);
              return prevSnake;
            } else {
              setLives(l => l - 1);
              showFeedback(`❌ Nhầm rồi! "${hitApple.meaning}" (-1 Mạng)`);
              setApples(prev => prev.filter((_, idx) => idx !== hitAppleIndex));
              return [newHead, ...prevSnake.slice(0, -1)];
            }
          }
        }

        // 4. Normal Move (Add new head, remove tail)
        return [newHead, ...prevSnake.slice(0, -1)];
      });
    };

    const interval = setInterval(tick, getSpeedMs(speedLevel));
    return () => clearInterval(interval);
  }, [gameState, apples, score, currentWordIndex, wordQueue, targetWord, setupNextRound, speedLevel, lives]);

  // Touch control helper
  const handleTouchDir = (dir) => {
    if (gameState !== 'PLAYING') return;
    const currentDir = directionRef.current;
    if (dir === 'UP' && currentDir.y === 0) nextDirectionRef.current = { x: 0, y: -1 };
    if (dir === 'DOWN' && currentDir.y === 0) nextDirectionRef.current = { x: 0, y: 1 };
    if (dir === 'LEFT' && currentDir.x === 0) nextDirectionRef.current = { x: -1, y: 0 };
    if (dir === 'RIGHT' && currentDir.x === 0) nextDirectionRef.current = { x: 1, y: 0 };
  };

  if (!words || words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-xxl text-center">
        <div className="w-20 h-20 mb-md rounded-full bg-surface-container-low flex items-center justify-center text-primary">
          <BookOpen size={40} />
        </div>
        <h3 className="font-heading-1 text-heading-1 text-on-surface mb-xs">Chưa có từ vựng nào</h3>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md mb-lg">
          Hãy thêm từ vựng vào chủ đề này để tham gia trò chơi Rắn săn mồi học từ vựng!
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

  return (
    <div className="max-w-4xl mx-auto flex flex-col items-center gap-md select-none pb-xl">
      {/* Top Banner HUD */}
      <div className="w-full bg-surface-container-low border border-hairline rounded-2xl p-md flex flex-wrap items-center justify-between gap-md shadow-sm">
        {/* Target Word Display */}
        <div className="flex items-center gap-md">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xl shadow-inner">
            🐍
          </div>
          <div>
            <div className="text-xs font-label text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
              Từ vựng cần săn 🎯
              <span className="text-xs text-primary font-bold">({currentWordIndex + 1}/{wordQueue.length || words.length})</span>
            </div>
            <div className="flex items-center gap-xs">
              <span className="font-heading-1 text-heading-1 text-primary">
                {targetWord?.word || '---'}
              </span>
              {targetWord?.phonetic && (
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {targetWord.phonetic}
                </span>
              )}
              {targetWord?.word && (
                <button
                  onClick={() => speakEnglishText(targetWord.word, settings?.speechVoiceURI)}
                  className="p-1.5 rounded-full hover:bg-surface-container text-primary transition-colors ml-1"
                  title="Phát âm"
                >
                  <Volume2 size={18} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lives, Speed & Stats */}
        <div className="flex items-center flex-wrap gap-sm">
          {/* Lives Indicator */}
          <div className="flex items-center gap-1 px-md py-sm bg-surface rounded-xl border border-hairline">
            {Array.from({ length: 3 }).map((_, idx) => (
              <Heart
                key={idx}
                size={18}
                className={idx < lives ? 'text-rose-500 fill-rose-500' : 'text-slate-400 opacity-40'}
              />
            ))}
          </div>

          {/* Speed Selector */}
          <div className="flex bg-surface rounded-xl p-1 border border-hairline items-center text-xs">
            <Zap size={14} className="text-amber-500 ml-1.5 mr-1" />
            <button
              onClick={() => setSpeedLevel('slow')}
              className={`px-2 py-1 rounded-lg transition-colors ${speedLevel === 'slow' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
              title="Chậm (Dễ đọc)"
            >
              Chậm
            </button>
            <button
              onClick={() => setSpeedLevel('medium')}
              className={`px-2 py-1 rounded-lg transition-colors ${speedLevel === 'medium' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
              title="Vừa"
            >
              Vừa
            </button>
            <button
              onClick={() => setSpeedLevel('fast')}
              className={`px-2 py-1 rounded-lg transition-colors ${speedLevel === 'fast' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
              title="Nhanh"
            >
              Nhanh
            </button>
          </div>

          <div className="flex items-center gap-2 px-md py-sm bg-surface rounded-xl border border-hairline">
            <Trophy size={18} className="text-amber-500" />
            <div className="flex flex-col">
              <span className="text-[10px] text-on-surface-variant font-label uppercase leading-none">Điểm</span>
              <span className="font-bold text-on-surface text-base leading-tight">{score}</span>
            </div>
          </div>

          {gameState === 'PLAYING' && (
            <button
              onClick={() => setGameState('PAUSED')}
              className="p-sm rounded-xl bg-surface hover:bg-surface-container-high border border-hairline text-on-surface transition-colors"
              title="Tạm dừng (Phím Space)"
            >
              <Pause size={18} />
            </button>
          )}

          {gameState === 'PAUSED' && (
            <button
              onClick={() => setGameState('PLAYING')}
              className="p-sm rounded-xl bg-primary text-on-primary hover:bg-primary-active transition-colors"
              title="Tiếp tục"
            >
              <Play size={18} />
            </button>
          )}

          <button
            onClick={initGame}
            className="p-sm rounded-xl bg-surface hover:bg-surface-container-high border border-hairline text-on-surface transition-colors"
            title="Chơi lại từ đầu"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {/* WASD & Gameplay Banner */}
      <div className="w-full flex flex-wrap items-center justify-between gap-sm text-xs text-on-surface-variant px-sm">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-surface-container-high border border-hairline font-mono font-bold text-on-surface">W A S D</span>
          <span>hoặc Phím Mũi Tên để điều khiển con rắn tới quả táo có nghĩa đúng!</span>
        </div>
        {gameFeedback && (
          <div className="text-amber-400 font-bold bg-amber-950/40 px-md py-0.5 rounded-full border border-amber-500/30 animate-pulse ml-auto">
            {gameFeedback}
          </div>
        )}
      </div>

      {/* Game Field Grid */}
      <div className="relative w-full aspect-[20/14] bg-slate-950 rounded-2xl border-2 border-primary/30 shadow-2xl overflow-hidden flex flex-col justify-between">
        {/* Grid Container */}
        <div 
          className="w-full h-full grid relative" 
          style={{ 
            gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
            gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)` 
          }}
        >
          {/* Subtle Grid Lines Background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:5%_7.14%] opacity-40 pointer-events-none" />

          {/* Hyper-Realistic Canvas Snake Renderer */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full z-20 pointer-events-none"
          />

          {/* Render Apples (5 apples with smart spacing) */}
          {apples.map((apple, index) => {
            const leftPercent = (apple.x / GRID_COLS) * 100;
            const topPercent = (apple.y / GRID_ROWS) * 100;
            const cellWidthPercent = (1 / GRID_COLS) * 100;
            const cellHeightPercent = (1 / GRID_ROWS) * 100;
            const isNearBottom = apple.y >= GRID_ROWS - 2;

            return (
              <div
                key={`${apple.id}-${index}`}
                className="absolute z-10 flex items-center justify-center transition-all duration-300"
                style={{
                  left: `${leftPercent}%`,
                  top: `${topPercent}%`,
                  width: `${cellWidthPercent}%`,
                  height: `${cellHeightPercent}%`,
                }}
              >
                {/* Apple Icon Cell */}
                <div 
                  className={`w-full h-full rounded-lg flex items-center justify-center shadow-lg border backdrop-blur-md transition-all relative ${
                    apple.isCorrect 
                      ? 'bg-emerald-950/90 border-emerald-400 text-emerald-100 ring-2 ring-emerald-400/50 animate-pulse' 
                      : 'bg-rose-950/80 border-rose-700/80 text-rose-200'
                  }`}
                >
                  <span className="text-base sm:text-lg select-none drop-shadow">🍎</span>

                  {/* Translation Label positioned below (or above if near bottom) */}
                  <div 
                    className={`absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none whitespace-nowrap px-2.5 py-0.5 rounded-md text-[10px] sm:text-xs font-semibold shadow-xl border backdrop-blur-md transition-all ${
                      isNearBottom ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                    } ${
                      apple.isCorrect
                        ? 'bg-emerald-900/95 text-emerald-100 border-emerald-400 ring-1 ring-emerald-400/40'
                        : 'bg-slate-900/95 text-slate-100 border-slate-700'
                    }`}
                  >
                    {apple.meaning}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Overlay screens */}
        {gameState === 'IDLE' && (
          <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-md text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary text-3xl mb-md shadow-xl">
              🐍
            </div>
            <h2 className="text-2xl font-bold text-white mb-xs">Mini Game: Rắn Săn Mồi Từ Vựng</h2>
            <p className="text-sm text-slate-300 max-w-md mb-lg">
              Điều khiển con rắn bằng phím <span className="text-sky-400 font-bold">W A S D</span> hoặc các phím mũi tên để ăn quả táo có bản dịch chính xác của từ vựng <span className="text-sky-400 font-bold">"{targetWord?.word}"</span>!
            </p>
            <button
              onClick={initGame}
              className="bg-primary text-on-primary px-xl py-md rounded-full font-bold text-lg hover:bg-primary-active transition-all shadow-lg hover:scale-105 flex items-center gap-2"
            >
              <Play size={24} /> Bắt đầu chơi ngay
            </button>
          </div>
        )}

        {gameState === 'PAUSED' && (
          <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-md text-center">
            <h2 className="text-3xl font-bold text-white mb-md">Đã Tạm Dừng ⏸️</h2>
            <button
              onClick={() => setGameState('PLAYING')}
              className="bg-primary text-on-primary px-xl py-md rounded-full font-bold text-lg hover:bg-primary-active transition-all shadow-lg flex items-center gap-2"
            >
              <Play size={20} /> Tiếp tục chơi
            </button>
          </div>
        )}

        {gameState === 'GAME_OVER' && (
          <div className="absolute inset-0 z-30 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-md text-center">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 text-3xl mb-sm animate-bounce">
              <ShieldAlert size={36} />
            </div>
            <h2 className="text-2xl font-bold text-rose-400 mb-xs">Hết Mạng! (Game Over)</h2>
            <p className="text-sm text-slate-300 max-w-md mb-md">
              {gameOverReason}
            </p>
            <div className="flex items-center gap-lg bg-slate-900 border border-slate-800 rounded-xl px-lg py-md mb-lg">
              <div className="text-center">
                <span className="text-xs text-slate-400 block">Số từ đã săn</span>
                <span className="text-xl font-bold text-sky-400">{score}</span>
              </div>
              <div className="w-px h-8 bg-slate-800" />
              <div className="text-center">
                <span className="text-xs text-slate-400 block">Điểm kỷ lục</span>
                <span className="text-xl font-bold text-amber-400">{highScore}</span>
              </div>
            </div>
            <button
              onClick={initGame}
              className="bg-primary text-on-primary px-xl py-md rounded-full font-bold text-base hover:bg-primary-active transition-all shadow-lg flex items-center gap-2"
            >
              <RotateCcw size={20} /> Chơi lại lần nữa
            </button>
          </div>
        )}

        {gameState === 'VICTORY' && (
          <div className="absolute inset-0 z-30 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-md text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 text-3xl mb-sm">
              🏆
            </div>
            <h2 className="text-3xl font-bold text-amber-400 mb-xs">Chiến Thắng Rực Rỡ!</h2>
            <p className="text-sm text-slate-300 max-w-md mb-md">
              Bạn đã xuất sắc săn đúng tất cả các từ vựng trong bộ từ này!
            </p>
            <div className="flex items-center gap-lg bg-slate-900 border border-slate-800 rounded-xl px-lg py-md mb-lg">
              <div className="text-center">
                <span className="text-xs text-slate-400 block">Tổng điểm</span>
                <span className="text-2xl font-bold text-emerald-400">{score}</span>
              </div>
            </div>
            <button
              onClick={initGame}
              className="bg-primary text-on-primary px-xl py-md rounded-full font-bold text-base hover:bg-primary-active transition-all shadow-lg flex items-center gap-2"
            >
              <RotateCcw size={20} /> Chơi lại bộ từ vựng
            </button>
          </div>
        )}
      </div>

      {/* On-Screen D-Pad for Mobile & Touch Screen */}
      <div className="w-full flex justify-center items-center gap-md mt-sm md:hidden">
        <div className="grid grid-cols-3 gap-2 w-44 h-44 bg-surface-container-low p-2 rounded-2xl border border-hairline">
          <div />
          <button
            onClick={() => handleTouchDir('UP')}
            className="bg-surface border border-hairline rounded-xl flex items-center justify-center text-on-surface active:bg-primary active:text-on-primary transition-colors"
          >
            <ArrowUp size={24} />
          </button>
          <div />
          <button
            onClick={() => handleTouchDir('LEFT')}
            className="bg-surface border border-hairline rounded-xl flex items-center justify-center text-on-surface active:bg-primary active:text-on-primary transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex items-center justify-center text-xs font-mono font-bold text-on-surface-variant">
            WASD
          </div>
          <button
            onClick={() => handleTouchDir('RIGHT')}
            className="bg-surface border border-hairline rounded-xl flex items-center justify-center text-on-surface active:bg-primary active:text-on-primary transition-colors"
          >
            <ArrowRight size={24} />
          </button>
          <div />
          <button
            onClick={() => handleTouchDir('DOWN')}
            className="bg-surface border border-hairline rounded-xl flex items-center justify-center text-on-surface active:bg-primary active:text-on-primary transition-colors"
          >
            <ArrowDown size={24} />
          </button>
          <div />
        </div>
      </div>
    </div>
  );
}
