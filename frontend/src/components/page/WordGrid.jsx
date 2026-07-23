import React, { useState, useEffect, useRef } from 'react';
import { WordCard } from './WordCard';
import { WordMatchingQuiz } from './WordMatchingQuiz';
import { WordGuessQuiz } from './WordGuessQuiz';
import { BookOpen, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRemoteStorage } from '../../hooks/useRemoteStorage';

const LazyWordCard = ({ word, onEditWord, viewMode, settings }) => {
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef();

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    
    const currentRef = domRef.current;
    if (currentRef) observer.observe(currentRef);
    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, []);

  return (
    <div
      ref={domRef}
      className={`transition-all duration-700 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <WordCard word={word} onEdit={onEditWord} viewMode={viewMode} settings={settings} />
    </div>
  );
};

export function WordGrid({ words, activeTopicId, onAddWord, onEditWord, searchTerm, viewMode, settings, mistakeFilter }) {
  const [listeningMistakes] = useRemoteStorage('minuslearn_mistakes', {});
  const [readingMistakes] = useRemoteStorage('minuslearn_reading_mistakes', {});
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTopicId, searchTerm, mistakeFilter]);

  const filteredWords = words.filter(w => {
    if (w.topicId !== activeTopicId) return false;

    if (mistakeFilter && mistakeFilter !== 'none') {
      const isListeningMistake = !!listeningMistakes[w.id];
      const isReadingMistake = !!readingMistakes[w.id];

      if (mistakeFilter === 'any' && !isListeningMistake && !isReadingMistake) return false;
      if (mistakeFilter === 'listening' && !isListeningMistake) return false;
      if (mistakeFilter === 'reading' && !isReadingMistake) return false;
      if (mistakeFilter === 'both' && !(isListeningMistake && isReadingMistake)) return false;
    }

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return w.word.toLowerCase().includes(term) || w.meaning.toLowerCase().includes(term);
  });

  if (viewMode === 'match') {
    return (
      <div className="p-md md:p-xxl flex-1">
        <WordMatchingQuiz
          words={filteredWords}
          settings={settings}
          onAddWord={onAddWord}
        />
      </div>
    );
  }

  if (viewMode === 'guess') {
    return (
      <div className="p-md md:p-xxl flex-1">
        <WordGuessQuiz
          words={filteredWords}
          allWords={words}
          settings={settings}
          onAddWord={onAddWord}
        />
      </div>
    );
  }

  const totalPages = Math.ceil(filteredWords.length / itemsPerPage);
  const currentWords = filteredWords.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="p-md md:p-xxl flex-1">
      {filteredWords.length === 0 ? (
        <div className="col-span-full flex flex-col items-center justify-center py-xxl text-center mt-12">
          <div className="w-24 h-24 mb-md rounded-full bg-surface-container-low flex items-center justify-center">
            <BookOpen size={48} className="text-primary" />
          </div>
          <h3 className="font-heading-1 text-heading-1 text-on-surface mb-xs">Chào mừng đến với MinusLearn</h3>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-md mb-lg">
            Hãy bắt đầu xây dựng bộ từ vựng cá nhân của bạn. Thêm từ mới, sắp xếp chúng theo chủ đề và chinh phục một ngôn ngữ mới.
          </p>
          <button
            onClick={onAddWord}
            className="bg-primary text-on-primary px-lg py-sm rounded-full font-button text-button hover:bg-primary-active transition-colors"
          >
            Thêm từ vựng đầu tiên
          </button>
        </div>
      ) : (
        <div className="flex flex-col min-h-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md md:gap-lg auto-rows-max mb-xl">
            {currentWords.map(word => (
              <LazyWordCard key={word.id} word={word} onEditWord={onEditWord} viewMode={viewMode} settings={settings} />
            ))}
          </div>
          
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-md mt-auto pb-lg">
              <button
                onClick={() => {
                  setCurrentPage(p => Math.max(1, p - 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={currentPage === 1}
                className="p-sm rounded-full bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
                title="Trang trước"
              >
                <ChevronLeft size={20} />
              </button>
              
              <div className="flex items-center gap-xs">
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const pageNumber = idx + 1;
                  // Hiển thị một số trang giới hạn nếu có quá nhiều trang (tùy chọn đơn giản)
                  if (totalPages > 7) {
                    if (pageNumber !== 1 && pageNumber !== totalPages && Math.abs(pageNumber - currentPage) > 1) {
                      if (pageNumber === 2 || pageNumber === totalPages - 1) return <span key={idx} className="text-on-surface-variant px-1">...</span>;
                      return null;
                    }
                  }
                  return (
                    <button
                      key={pageNumber}
                      onClick={() => {
                        setCurrentPage(pageNumber);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`w-10 h-10 rounded-full font-label text-label flex items-center justify-center transition-colors ${
                        currentPage === pageNumber
                          ? 'bg-primary text-on-primary'
                          : 'bg-transparent text-on-surface hover:bg-surface-container-low'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => {
                  setCurrentPage(p => Math.min(totalPages, p + 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={currentPage === totalPages}
                className="p-sm rounded-full bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
                title="Trang sau"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
