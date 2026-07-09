import React, { useState } from 'react';
import { Volume2, Edit2 } from 'lucide-react';

export function WordCard({ word, onEdit, viewMode = 'card' }) {
  const [isFlipped, setIsFlipped] = useState(false);

  const speak = (e) => {
    e.stopPropagation();
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const handleEditClick = (e) => {
    e.stopPropagation();
    onEdit(word.id);
  };

  if (viewMode === 'flashcard') {
    return (
      <div 
        className="group relative bg-transparent h-72 [perspective:1000px] cursor-pointer"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div className={`relative w-full h-full transition-all duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
          
          {/* Front Face */}
          <div className="absolute inset-0 [backface-visibility:hidden] bg-surface border border-hairline rounded-[12px] shadow-sm flex flex-col items-center justify-center p-xl hover:shadow-md transition-shadow">
            <h3 className="font-title text-[36px] text-on-surface text-center mb-lg leading-tight">{word.word}</h3>
            
            <button 
              onClick={speak}
              className="w-12 h-12 bg-surface-container-lowest border border-hairline rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors shadow-sm"
            >
              <Volume2 size={24} />
            </button>
            
            <div className="absolute top-sm right-sm opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={handleEditClick} className="w-8 h-8 bg-surface-container-low rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container">
                <Edit2 size={14} />
              </button>
            </div>
          </div>

          {/* Back Face */}
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-surface border border-hairline rounded-[12px] shadow-sm overflow-hidden flex flex-col justify-center p-lg">
            {/* Background Image if exists */}
            {word.imageUrl ? (
              <>
                <div className="absolute inset-0 bg-black/70 z-10 backdrop-blur-sm"></div>
                <img src={word.imageUrl} alt={word.word} className="absolute inset-0 w-full h-full object-cover z-0" />
              </>
            ) : (
              <div className="absolute inset-0 bg-surface z-0"></div>
            )}
            
            <div className={`relative z-20 flex flex-col gap-sm items-center text-center ${word.imageUrl ? 'text-white' : 'text-on-surface'}`}>
              <div className="flex flex-col items-center gap-1">
                <h3 className={`font-title text-title ${word.imageUrl ? 'text-white' : 'text-on-surface'}`}>{word.word}</h3>
                {word.phonetic && (
                  <span className={`font-mono text-sm px-2 py-0.5 rounded-md ${word.imageUrl ? 'bg-white/20 text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                    {word.phonetic}
                  </span>
                )}
              </div>
              
              <p className={`font-body-lg text-lg line-clamp-4 mt-2 ${word.imageUrl ? 'text-white/90' : 'text-on-surface-variant'}`}>
                {word.meaning}
              </p>

              {word.example && (
                <div className={`mt-2 pt-3 border-t w-full border-dashed ${word.imageUrl ? 'border-white/30 text-white/80' : 'border-hairline text-on-surface-variant'}`}>
                  <p className="font-body-sm text-sm italic line-clamp-3">
                    "{word.example}"
                  </p>
                </div>
              )}
            </div>

            <div className="absolute top-sm right-sm opacity-0 group-hover:opacity-100 transition-opacity z-30">
              <button onClick={handleEditClick} className="w-8 h-8 bg-surface/90 backdrop-blur-sm rounded-full shadow-sm flex items-center justify-center text-on-surface-variant hover:text-primary">
                <Edit2 size={14} />
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // DEFAULT: Card View
  return (
    <div 
      className="group relative bg-canvas border border-hairline rounded-[12px] overflow-hidden hover:shadow-md transition-all duration-300 ease-in-out hover:-translate-y-1 flex flex-col"
    >
      <div className="h-40 w-full overflow-hidden bg-surface-container-lowest relative cursor-pointer" onClick={handleEditClick}>
        {word.imageUrl ? (
          <img src={word.imageUrl} alt={word.word} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-on-surface-variant bg-surface-container">
            <span className="text-sm">No image</span>
          </div>
        )}
        
        <button 
          onClick={speak}
          className="absolute bottom-sm right-sm w-8 h-8 bg-surface/80 backdrop-blur-md rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface transition-colors shadow-sm opacity-0 group-hover:opacity-100 z-10"
        >
          <Volume2 size={16} />
        </button>
      </div>

      <div className="p-md flex flex-col gap-xs flex-1 cursor-pointer" onClick={handleEditClick}>
        <div className="flex items-center gap-xs">
          <h3 className="font-title text-title text-on-surface">{word.word}</h3>
          <span className="font-caption text-caption text-on-surface-variant font-mono bg-surface-container px-2 py-0.5 rounded-md">
            {word.phonetic}
          </span>
        </div>
        
        <p className="font-body-md text-body-md text-on-surface-variant line-clamp-2">
          {word.meaning}
        </p>

        {word.example && (
          <div className="mt-auto pt-sm border-t border-hairline border-dashed">
            <p className="font-body-sm text-body-sm text-on-surface-variant italic">
              "{word.example}"
            </p>
          </div>
        )}
      </div>

      <div className="absolute top-sm right-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
        <div className="w-8 h-8 bg-surface/90 backdrop-blur-sm rounded-full shadow-sm flex items-center justify-center text-on-surface-variant">
          <Edit2 size={14} />
        </div>
      </div>
    </div>
  );
}
