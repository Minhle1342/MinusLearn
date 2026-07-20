import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Image as ImageIcon, UploadCloud, FileText } from 'lucide-react';
import { generateWordsFromText, generateImageForWord } from '../../services/api';
import { downloadExternalImage } from '../../services/backendApi';

const SUPPORTED_TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'tsv', 'json', 'html', 'htm', 'rtf'];
const FILE_ACCEPT_TYPES = [
  '.pdf',
  '.docx',
  '.txt',
  '.md',
  '.csv',
  '.tsv',
  '.json',
  '.html',
  '.htm',
  '.rtf',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/*'
].join(',');

let pdfJsModulePromise;
let mammothModulePromise;

async function loadPdfJs() {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.mjs?url')
    ]).then(([pdfjsLib, workerModule]) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfjsLib;
    });
  }

  return pdfJsModulePromise;
}

async function loadMammoth() {
  if (!mammothModulePromise) {
    mammothModulePromise = import('mammoth').then(module => module.default || module);
  }

  return mammothModulePromise;
}

function normalizeDocumentText(text) {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripRtfToText(text) {
  return text
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (pageText) pages.push(pageText);
  }

  return pages.join('\n\n');
}

async function extractDocxText(file) {
  const mammoth = await loadMammoth();
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractReadableFileText(file) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (extension === 'pdf' || file.type === 'application/pdf') {
    return extractPdfText(file);
  }

  if (extension === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractDocxText(file);
  }

  if (SUPPORTED_TEXT_EXTENSIONS.includes(extension) || file.type.startsWith('text/')) {
    const text = await file.text();

    if (extension === 'html' || extension === 'htm' || file.type === 'text/html') {
      return new DOMParser().parseFromString(text, 'text/html').body.textContent || '';
    }

    if (extension === 'rtf') {
      return stripRtfToText(text);
    }

    return text;
  }

  throw new Error('Định dạng này chưa được hỗ trợ. Hiện có thể đọc PDF, DOCX và các file văn bản như TXT/MD/CSV/HTML/RTF.');
}

export function WordModal({ isOpen, onClose, wordToEdit, onSave, onDelete, activeTopicId, settings, initialAiText }) {
  const [activeTab, setActiveTab] = useState('manual');
  const documentPreviewRef = useRef(null);

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
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFileText, setUploadedFileText] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [fileReadError, setFileReadError] = useState('');
  const [lastHighlightedText, setLastHighlightedText] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (wordToEdit) {
        setFormData({ ...wordToEdit });
        setActiveTab('manual');
      } else {
        setFormData({ word: '', phonetic: '', meaning: '', example: '', imageUrl: '' });
        setImageApiIndex(0);
        setUploadedFileName('');
        setUploadedFileText('');
        setFileReadError('');
        setLastHighlightedText('');
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

  const appendHighlightedTextToAiList = (text) => {
    const selectedItems = text
      .split(/\r?\n/)
      .map(item => item.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    if (selectedItems.length === 0) return;

    setAiText(prev => {
      const existingItems = new Set(
        prev
          .split(/\r?\n|,/)
          .map(item => item.trim().toLowerCase())
          .filter(Boolean)
      );
      const nextItems = selectedItems.filter(item => !existingItems.has(item.toLowerCase()));

      if (nextItems.length === 0) return prev;

      return prev.trim() ? `${prev.trimEnd()}\n${nextItems.join('\n')}` : nextItems.join('\n');
    });

    setLastHighlightedText(selectedItems.join(', '));
  };

  const handleDocumentSelection = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (!selectedText || !documentPreviewRef.current) return;
    if (!documentPreviewRef.current.contains(selection.anchorNode) || !documentPreviewRef.current.contains(selection.focusNode)) return;

    appendHighlightedTextToAiList(selectedText);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setActiveTab('ai');
    setIsReadingFile(true);
    setUploadedFileName(file.name);
    setUploadedFileText('');
    setFileReadError('');
    setLastHighlightedText('');

    try {
      const text = normalizeDocumentText(await extractReadableFileText(file));
      if (!text) throw new Error('Không tìm thấy text có thể highlight trong file này.');
      setUploadedFileText(text);
    } catch (error) {
      setFileReadError(error.message || 'Không thể đọc file này.');
    } finally {
      setIsReadingFile(false);
      event.target.value = '';
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (formData.word.trim()) {
      setIsGeneratingImage(true);
      let localImageUrl = formData.localImageUrl || null;
      if (formData.imageUrl && formData.imageUrl.startsWith('http') && !localImageUrl) {
        localImageUrl = await downloadExternalImage(formData.imageUrl);
      }
      onSave({ ...formData, topicId: activeTopicId, localImageUrl });
      setIsGeneratingImage(false);
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
        let localImageUrl = null;
        try {
          imageUrl = await generateImageForWord(w.word, { 
            pixabayApiKey: settings.pixabayApiKey, 
            unsplashApiKey: settings.unsplashApiKey, 
            pexelsApiKey: settings.pexelsApiKey 
          });
          if (imageUrl) {
            localImageUrl = await downloadExternalImage(imageUrl);
          }
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
          localImageUrl,
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
      setFormData({ ...formData, imageUrl: url, localImageUrl: null });
      setImageApiIndex(prev => prev + 1);
    } catch (e) {
      alert("Không thể tạo ảnh: " + e.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className={`bg-surface rounded-[12px] shadow-lg w-full overflow-hidden flex flex-col transition-all ${activeTab === 'ai' && uploadedFileText ? 'max-w-6xl max-h-[95vh]' : 'max-w-2xl max-h-[90vh]'}`}>
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
                  <input type="url" value={formData.imageUrl} onChange={e => setFormData({ ...formData, imageUrl: e.target.value, localImageUrl: null })} className="flex-1 px-sm py-xs bg-surface-container-lowest border border-hairline rounded-[4px] font-body-md focus:ring-2 focus:ring-primary outline-none" placeholder="https://..." />
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
                Dán danh sách từ vựng hoặc tải file PDF/DOCX/TXT... Sau khi file được đọc, modal sẽ tự phóng to để bạn bôi đen từ/cụm từ và tự thêm vào textarea bên dưới.
              </p>
              <div className="rounded-lg border border-dashed border-hairline bg-surface-container-lowest p-md">
                <label className="flex cursor-pointer flex-col items-center justify-center gap-xs text-center text-on-surface-variant hover:text-primary">
                  <UploadCloud size={24} />
                  <span className="font-button text-sm">
                    {isReadingFile ? 'Đang đọc file...' : 'Tải file tài liệu để highlight từ vựng'}
                  </span>
                  <span className="text-xs">Hỗ trợ PDF, DOCX, TXT, MD, CSV, HTML, RTF</span>
                  <input
                    type="file"
                    accept={FILE_ACCEPT_TYPES}
                    onChange={handleFileUpload}
                    disabled={isReadingFile}
                    className="hidden"
                  />
                </label>
                {uploadedFileName && (
                  <div className="mt-sm flex items-center justify-center gap-xs text-xs text-on-surface-variant">
                    <FileText size={14} />
                    <span className="truncate">{uploadedFileName}</span>
                  </div>
                )}
                {fileReadError && (
                  <p className="mt-sm rounded-md bg-error/10 p-xs text-xs text-error">{fileReadError}</p>
                )}
              </div>
              {uploadedFileText && (
                <div className="flex flex-col gap-xs">
                  <div className="flex flex-wrap items-center justify-between gap-xs">
                    <label className="font-body-sm text-body-sm font-semibold text-on-surface-variant">
                      Tài liệu đã phóng to — bôi đen từ cần thêm
                    </label>
                    {lastHighlightedText && (
                      <span className="rounded-full bg-primary/10 px-sm py-1 text-xs text-primary">
                        Đã thêm: {lastHighlightedText}
                      </span>
                    )}
                  </div>
                  <div
                    ref={documentPreviewRef}
                    onMouseUp={handleDocumentSelection}
                    className="max-h-[420px] min-h-[320px] select-text overflow-y-auto whitespace-pre-wrap rounded-lg border border-hairline bg-white p-md text-lg leading-8 text-ink shadow-inner"
                    title="Bôi đen một từ hoặc cụm từ để tự thêm vào danh sách bên dưới"
                  >
                    {uploadedFileText}
                  </div>
                </div>
              )}
              <label className="font-body-sm text-body-sm font-semibold text-on-surface-variant">
                Danh sách từ vựng sẽ gửi cho AI
              </label>
              <textarea
                value={aiText}
                onChange={e => setAiText(e.target.value)}
                className={`${uploadedFileText ? 'min-h-[140px]' : 'min-h-[200px]'} flex-1 p-sm bg-surface-container-lowest border border-hairline rounded-lg resize-y focus:ring-2 focus:ring-primary outline-none`}
                placeholder="VD: Apple, Banana, Orange... hoặc bôi đen từ trong tài liệu phía trên"
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
