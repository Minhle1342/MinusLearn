import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Trophy, Brain } from 'lucide-react';

export function WordMemoryMatch({ words, onAddWord }) {
  const [cards, setCards] = useState([]);
  const [flippedIndices, setFlippedIndices] = useState([]);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [moves, setMoves] = useState(0);
  const [isGameWon, setIsGameWon] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Initialize game
  const initGame = useCallback(() => {
    if (!words || words.length === 0) return;

    // Select up to 8 random words for a 4x4 grid (16 cards total)
    const shuffledWords = [...words].sort(() => 0.5 - Math.random());
    const selectedWords = shuffledWords.slice(0, 8);

    // Create 2 cards per word (English and Vietnamese)
    const initialCards = [];
    selectedWords.forEach((word) => {
      initialCards.push({
        id: `${word.id}-en`,
        wordId: word.id,
        type: 'en',
        content: word.word,
        isMatched: false
      });
      initialCards.push({
        id: `${word.id}-vi`,
        wordId: word.id,
        type: 'vi',
        content: word.meaning,
        isMatched: false
      });
    });

    // Shuffle the cards
    const shuffledCards = initialCards.sort(() => 0.5 - Math.random());
    
    setCards(shuffledCards);
    setFlippedIndices([]);
    setMatchedPairs(0);
    setMoves(0);
    setIsGameWon(false);
    setIsChecking(false);
  }, [words]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  const handleCardClick = (index) => {
    // Prevent clicking if checking, already flipped, or matched
    if (
      isChecking ||
      flippedIndices.includes(index) ||
      cards[index].isMatched
    ) {
      return;
    }

    const newFlippedIndices = [...flippedIndices, index];
    setFlippedIndices(newFlippedIndices);

    if (newFlippedIndices.length === 2) {
      setIsChecking(true);
      setMoves(m => m + 1);

      const [firstIndex, secondIndex] = newFlippedIndices;
      const firstCard = cards[firstIndex];
      const secondCard = cards[secondIndex];

      if (firstCard.wordId === secondCard.wordId && firstCard.type !== secondCard.type) {
        // Match found
        setTimeout(() => {
          setCards(prevCards => {
            const newCards = [...prevCards];
            newCards[firstIndex].isMatched = true;
            newCards[secondIndex].isMatched = true;
            return newCards;
          });
          setFlippedIndices([]);
          setIsChecking(false);
          setMatchedPairs(prev => {
            const newMatched = prev + 1;
            if (newMatched === cards.length / 2) {
              setIsGameWon(true);
            }
            return newMatched;
          });
        }, 500);
      } else {
        // No match
        setTimeout(() => {
          setFlippedIndices([]);
          setIsChecking(false);
        }, 1000);
      }
    }
  };

  if (!words || words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-xxl">
        <Brain size={48} className="text-primary mb-md opacity-50" />
        <h3 className="font-heading-2 text-heading-2 text-on-surface mb-xs">Chưa có từ vựng</h3>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md mb-lg">
          Hãy thêm từ vựng vào chủ đề này để bắt đầu chơi Memory Match.
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
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto py-md">
      <div className="w-full flex justify-between items-center mb-lg bg-surface-container p-md rounded-2xl shadow-sm">
        <div className="flex flex-col">
          <span className="font-label text-label text-on-surface-variant uppercase tracking-wider">Memory Match</span>
          <span className="font-heading-2 text-heading-2 text-primary">{matchedPairs} / {cards.length / 2} Cặp</span>
        </div>
        <div className="flex items-center gap-md">
          <div className="text-right">
            <span className="font-label text-label text-on-surface-variant uppercase tracking-wider block">Lượt lật</span>
            <span className="font-heading-2 text-heading-2 text-on-surface">{moves}</span>
          </div>
          <button
            onClick={initGame}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-on-primary transition-colors"
            title="Chơi lại"
          >
            <RotateCcw size={24} />
          </button>
        </div>
      </div>

      {isGameWon ? (
        <div className="flex flex-col items-center justify-center py-xxl text-center bg-surface-container rounded-3xl p-xl shadow-sm w-full animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-accent-yellow/20 rounded-full flex items-center justify-center mb-md animate-bounce">
            <Trophy size={48} className="text-accent-yellow" />
          </div>
          <h2 className="font-heading-1 text-heading-1 text-on-surface mb-sm">Xuất sắc!</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mb-xl">
            Bạn đã hoàn thành với {moves} lượt lật.
          </p>
          <button
            onClick={initGame}
            className="bg-primary text-on-primary px-xl py-md rounded-full font-button text-button hover:bg-primary-active transition-colors shadow-md hover:shadow-lg flex items-center gap-sm text-lg"
          >
            <RotateCcw size={24} />
            Chơi ván mới
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-sm md:gap-md w-full">
          {cards.map((card, index) => {
            const isFlipped = flippedIndices.includes(index);
            const isMatched = card.isMatched;
            
            return (
              <div 
                key={index} 
                className="relative w-full aspect-[4/3] [perspective:1000px] cursor-pointer group"
                onClick={() => handleCardClick(index)}
              >
                <div 
                  className={`w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${
                    isFlipped || isMatched ? '[transform:rotateY(180deg)]' : ''
                  }`}
                >
                  {/* Front (Hidden state) */}
                  <div className="absolute inset-0 [backface-visibility:hidden] bg-surface shadow-sm rounded-xl flex items-center justify-center border-2 border-transparent group-hover:border-primary/30 transition-colors">
                    <Brain size={32} className="text-primary/40" />
                  </div>
                  
                  {/* Back (Revealed state) */}
                  <div className={`absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-xl flex items-center justify-center p-sm text-center shadow-md ${
                    isMatched ? 'bg-accent-green/10 border-2 border-accent-green' : 'bg-primary border-2 border-primary'
                  }`}>
                    <span className={`font-body-md md:font-body-lg leading-tight line-clamp-3 font-semibold ${
                      isMatched ? 'text-accent-green' : 'text-on-primary'
                    }`}>
                      {card.content}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
