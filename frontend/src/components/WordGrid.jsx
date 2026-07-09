import React from 'react';
import { WordCard } from './WordCard';
import { BookOpen, Plus } from 'lucide-react';

export function WordGrid({ words, activeTopicId, onAddWord, onEditWord, searchTerm, viewMode }) {
  const filteredWords = words.filter(w => {
    if (w.topicId !== activeTopicId) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return w.word.toLowerCase().includes(term) || w.meaning.toLowerCase().includes(term);
  });

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md md:gap-lg auto-rows-max">
          {filteredWords.map(word => (
            <WordCard key={word.id} word={word} onEdit={onEditWord} viewMode={viewMode} />
          ))}
        </div>
      )}
    </div>
  );
}
