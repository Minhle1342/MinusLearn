import React, { useState, useEffect } from 'react';
import { X, Sparkles, Image as ImageIcon } from 'lucide-react';
import { generateWordsFromText, generateImageForWord } from '../../services/api';

export function WordModal({ isOpen, onClose, wordToEdit, onSave, onDelete, activeTopicId, settings, initialAiText }) {
  const [activeTab, setActiveTab] = useState('manual');

  // Manual form state
  const [formData, setFormData] = useState({
    word: '',
    phonetic: '',
    meaning: '',
    example: '',
    imageUrl: ''
  });
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageApiIndex, setImageApiIndex] = useState(0);

  // AI form state
  const [aiText, setAiText] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (wordToEdit) {
        setFormData({ ...wordToEdit });
        setActiveTab('manual');
      } else {
        setFormData({ word: '', phonetic: '', meaning: '', example: '', imageUrl: '' });
        setImageApiIndex(0);
        if (initialAiText) {
          setAiText(initialAiText);
          setActiveTab('ai');
        } else {
          setAiText('');
        }
      }
    }
  }, [isOpen, wordToEdit, initialAiText]);

  if (!isOpen) return null;

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (formData.word.trim()) {
      onSave({ ...formData, topicId: activeTopicId });
      onClose();
    }
  };

  const handleAiSubmit = async () => {
    if (!aiText.trim()) return;
    setIsGeneratingAi(true);
    try {
      const words = await generateWordsFromText(aiText, settings.apiKey, settings.model);

      for (const w of words) {
        let imageUrl = '';
        try {
          imageUrl = await generateImageForWord(w.word, { 
            pixabayApiKey: settings.pixabayApiKey, 
            unsplashApiKey: settings.unsplashApiKey, 
            pexelsApiKey: settings.pexelsApiKey 
          });
        } catch (e) {
          console.error("Image generation failed:", e);
        }

        onSave({
          id: crypto.randomUUID(),
          topicId: activeTopicId,
          word: w.word,
          phonetic: w.phonetic,
          meaning: w.meaning,
          example: w.example,
          imageUrl,
          createdAt: Date.now()
        }, false); // pass false if we don't want to close immediately, but we need to handle that in App
      }
      onClose();
    } catch (error) {
      alert("Lỗi: " + error.message);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!formData.word) return;
    setIsGeneratingImage(true);
    try {
      const url = await generateImageForWord(formData.word, { 
        pixabayApiKey: settings.pixabayApiKey, 
        unsplashApiKey: settings.unsplashApiKey, 
        pexelsApiKey: settings.pexelsApiKey 
      }, imageApiIndex);
      setFormData({ ...formData, imageUrl: url });
      setImageApiIndex(prev => prev + 1);
    } catch (e) {
      alert("Không thể tạo ảnh: " + e.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-surface rounded-[12px] shadow-lg w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-lg border-b border-hairline flex justify-between items-center">
          <h3 className="font-heading-2 text-heading-2 text-on-surface">
            {wordToEdit ? 'Sửa từ vựng' : 'Thêm từ vựng mới'}
          </h3>
          <button className="text-on-surface-variant hover:text-ink transition-colors" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {!wordToEdit && (
          <div className="flex border-b border-hairline px-lg pt-sm">
            <button
              className={`px-md py-sm font-button text-button border-b-2 transition-colors ${activeTab === 'manual' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
              onClick={() => setActiveTab('manual')}
            >
              Nhập thủ công
            </button>
            <button
              className={`px-md py-sm font-button text-button border-b-2 transition-colors flex items-center gap-xs ${activeTab === 'ai' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
              onClick={() => setActiveTab('ai')}
            >
              <Sparkles size={16} /> Thêm hàng loạt bằng AI
            </button>
          </div>
        )}

        <div className="overflow-y-auto p-lg flex-1">
          {activeTab === 'manual' ? (
            <form id="word-form" onSubmit={handleManualSubmit} className="flex flex-col gap-md">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <div className="flex flex-col gap-xs">
                  <label className="font-body-sm text-body-sm font-semibold text-on-surface-variant">Từ vựng *</label>
                  <input type="text" required value={formData.word} onChange={e => setFormData({ ...formData, word: e.target.value })} className="w-full px-sm py-xs bg-surface-container-lowest border border-hairline rounded-[4px] font-body-md focus:ring-2 focus:ring-primary outline-none" />
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-body-sm text-body-sm font-semibold text-on-surface-variant">Phiên âm</label>
                  <input type="text" value={formData.phonetic} onChange={e => setFormData({ ...formData, phonetic: e.target.value })} className="w-full px-sm py-xs bg-surface-container-lowest border border-hairline rounded-[4px] font-body-md focus:ring-2 focus:ring-primary outline-none" />
                </div>
              </div>
              <div className="flex flex-col gap-xs">
                <label className="font-body-sm text-body-sm font-semibold text-on-surface-variant">Nghĩa của từ *</label>
                <textarea required value={formData.meaning} onChange={e => setFormData({ ...formData, meaning: e.target.value })} className="w-full px-sm py-xs bg-surface-container-lowest border border-hairline rounded-[4px] font-body-md focus:ring-2 focus:ring-primary outline-none min-h-[80px]"></textarea>
              </div>
              <div className="flex flex-col gap-xs">
                <label className="font-body-sm text-body-sm font-semibold text-on-surface-variant">Câu ví dụ</label>
                <textarea value={formData.example} onChange={e => setFormData({ ...formData, example: e.target.value })} className="w-full px-sm py-xs bg-surface-container-lowest border border-hairline rounded-[4px] font-body-md focus:ring-2 focus:ring-primary outline-none min-h-[80px]"></textarea>
              </div>

              <div className="flex flex-col gap-xs">
                <label className="font-body-sm text-body-sm font-semibold text-on-surface-variant">Link ảnh minh họa</label>
                <div className="flex gap-2">
                  <input type="url" value={formData.imageUrl} onChange={e => setFormData({ ...formData, imageUrl: e.target.value })} className="flex-1 px-sm py-xs bg-surface-container-lowest border border-hairline rounded-[4px] font-body-md focus:ring-2 focus:ring-primary outline-none" placeholder="https://..." />
                  <button
                    type="button"
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage || !formData.word}
                    className="px-sm py-xs border border-hairline rounded-[8px] bg-surface flex items-center gap-2 hover:bg-surface-container disabled:opacity-50"
                  >
                    <ImageIcon size={16} />
                    {isGeneratingImage ? 'Đang tạo...' : (formData.imageUrl ? 'Tạo ảnh khác' : 'Tạo tự động')}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-md h-full">
              <p className="text-sm text-on-surface-variant bg-surface-container p-sm rounded-lg border border-hairline">
                Dán danh sách từ vựng vào đây. AI sẽ tự động phân tích và tạo card từ vựng cho từng từ (bao gồm cả việc tự động sinh ảnh).
              </p>
              <textarea
                value={aiText}
                onChange={e => setAiText(e.target.value)}
                className="flex-1 min-h-[200px] p-sm bg-surface-container-lowest border border-hairline rounded-lg resize-none focus:ring-2 focus:ring-primary outline-none"
                placeholder="VD: Apple, Banana, Orange..."
              ></textarea>
            </div>
          )}
        </div>

        <div className="p-lg border-t border-hairline bg-canvas flex justify-between items-center">
          {wordToEdit && activeTab === 'manual' ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Xóa từ này?")) onDelete(wordToEdit.id);
              }}
              className="text-error font-button text-sm hover:underline"
            >
              Xóa từ
            </button>
          ) : <div></div>}

          <div className="flex gap-sm">
            <button onClick={onClose} className="px-md py-xs border border-hairline rounded-[8px] font-button text-on-surface hover:bg-surface-container-lowest">
              Hủy
            </button>
            {activeTab === 'manual' ? (
              <button type="submit" form="word-form" className="px-md py-xs bg-primary text-on-primary rounded-full font-button hover:bg-primary-active">
                Lưu từ
              </button>
            ) : (
              <button
                onClick={handleAiSubmit}
                disabled={isGeneratingAi || !aiText.trim()}
                className="px-md py-xs bg-primary text-on-primary rounded-full font-button hover:bg-primary-active disabled:opacity-50 flex items-center gap-2"
              >
                {isGeneratingAi ? 'Đang xử lý...' : 'Tạo bằng AI'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
