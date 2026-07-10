import React, { useState, useEffect } from 'react';
import { X, Key, Bot, Palette, Volume2 } from 'lucide-react';
import { GEMINI_DEFAULT_KEY, GEMINI_DEFAULT_MODEL } from '../../services/api';
import { getEnglishVoices, speakEnglishText } from '../../utils/speech';

const DEFAULT_SETTINGS = {
  apiKey: GEMINI_DEFAULT_KEY,
  model: GEMINI_DEFAULT_MODEL,
  pixabayApiKey: '',
  unsplashApiKey: '',
  pexelsApiKey: '',
  fontSize: 'medium',
  fontStyle: 'inter',
  theme: 'current',
  speechVoiceURI: '',
  speakingAssessmentMode: 'web-speech',
};

export function SettingsModal({ isOpen, onClose, settings, onSaveSettings }) {
  const [activeTab, setActiveTab] = useState('ai');
  const [englishVoices, setEnglishVoices] = useState([]);
  const [localSettings, setLocalSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    if (isOpen && settings) {
      setLocalSettings(prev => ({
        ...prev,
        ...settings,
      }));
    }
  }, [isOpen, settings]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || !window.speechSynthesis) {
      return undefined;
    }

    const loadVoices = () => {
      setEnglishVoices(getEnglishVoices());
    };

    loadVoices();
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isSpeechSupported = typeof window !== 'undefined' && Boolean(window.speechSynthesis);

  const handleSave = () => {
    onSaveSettings(localSettings);
    onClose();
  };

  const handlePreviewVoice = () => {
    speakEnglishText(
      "Hello, welcome to MinusLearn. Let's practice English together.",
      localSettings.speechVoiceURI,
      { rate: 0.9 }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex justify-center items-center p-4 backdrop-blur-sm">
      <div className="bg-canvas w-full max-w-3xl h-[80vh] md:h-[600px] rounded-[16px] shadow-lg flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="w-full md:w-[240px] border-b md:border-b-0 md:border-r border-hairline bg-surface flex flex-col p-4 gap-2">
          <div className="flex justify-between items-center mb-4 md:mb-6">
            <h2 className="text-title font-title text-on-surface">Cài đặt</h2>
            <button className="md:hidden text-on-surface-variant hover:text-ink" onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          <button
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${activeTab === 'ai' ? 'bg-primary/10 text-primary font-medium' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
            onClick={() => setActiveTab('ai')}
          >
            <Bot size={18} />
            <span className="font-body-md text-sm">AI & Gemini</span>
          </button>

          <button
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${activeTab === 'appearance' ? 'bg-primary/10 text-primary font-medium' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
            onClick={() => setActiveTab('appearance')}
          >
            <Palette size={18} />
            <span className="font-body-md text-sm">Giao diện</span>
          </button>

          <button
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${activeTab === 'voice' ? 'bg-primary/10 text-primary font-medium' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
            onClick={() => setActiveTab('voice')}
          >
            <Volume2 size={18} />
            <span className="font-body-md text-sm">Giọng đọc</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col bg-canvas-soft relative">
          <button className="absolute top-4 right-4 text-on-surface-variant hover:text-ink hidden md:block" onClick={onClose}>
            <X size={20} />
          </button>

          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {activeTab === 'ai' && (
              <div className="max-w-xl flex flex-col gap-8">
                <div>
                  <h3 className="text-heading-3 font-heading-3 text-on-surface mb-2">Cấu hình AI</h3>
                  <p className="text-body-sm text-on-surface-variant">
                    Cấu hình kết nối với Google Gemini để sử dụng tính năng sinh nội dung bằng AI.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Gemini API Key</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                        <Key size={16} />
                      </div>
                      <input
                        type="password"
                        value={localSettings.apiKey}
                        onChange={e => setLocalSettings({ ...localSettings, apiKey: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-mono text-sm"
                        placeholder="AIzaSy..."
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Gemini Model</label>
                    <select
                      value={localSettings.model}
                      onChange={e => setLocalSettings({ ...localSettings, model: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                    >
                      <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite Preview (Fastest)</option>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Best Quality)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Pixabay API Key (Tìm ảnh tự động)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                        <Key size={16} />
                      </div>
                      <input
                        type="password"
                        value={localSettings.pixabayApiKey || ''}
                        onChange={e => setLocalSettings({ ...localSettings, pixabayApiKey: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-mono text-sm"
                        placeholder="Nhập Pixabay API Key..."
                      />
                    </div>
                    <p className="text-xs text-on-surface-variant">Lấy key miễn phí tại <a href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer" className="text-primary hover:underline">Pixabay API</a></p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Unsplash API Key (Dự phòng 1)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                        <Key size={16} />
                      </div>
                      <input
                        type="password"
                        value={localSettings.unsplashApiKey || ''}
                        onChange={e => setLocalSettings({ ...localSettings, unsplashApiKey: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-mono text-sm"
                        placeholder="Nhập Unsplash Access Key..."
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Pexels API Key (Dự phòng 2)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                        <Key size={16} />
                      </div>
                      <input
                        type="password"
                        value={localSettings.pexelsApiKey || ''}
                        onChange={e => setLocalSettings({ ...localSettings, pexelsApiKey: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-mono text-sm"
                        placeholder="Nhập Pexels API Key..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="max-w-xl flex flex-col gap-8">
                <div>
                  <h3 className="text-heading-3 font-heading-3 text-on-surface mb-2">Phông chữ và nền</h3>
                  <p className="text-body-sm text-on-surface-variant">
                    Thay đổi giao diện hiển thị của ứng dụng.
                  </p>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Thay đổi cỡ chữ</label>
                    <select
                      value={localSettings.fontSize || 'medium'}
                      onChange={e => setLocalSettings({ ...localSettings, fontSize: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                    >
                      <option value="small">Nhỏ</option>
                      <option value="medium">Vừa (Mặc định)</option>
                      <option value="large">Lớn</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Thay đổi kiểu chữ</label>
                    <select
                      value={localSettings.fontStyle || 'inter'}
                      onChange={e => setLocalSettings({ ...localSettings, fontStyle: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                    >
                      <option value="inter">Inter (Mặc định)</option>
                      <option value="serif">Serif</option>
                      <option value="monospace">Monospace</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Thay đổi màu nền</label>
                    <select
                      value={localSettings.theme || 'current'}
                      onChange={e => setLocalSettings({ ...localSettings, theme: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                    >
                      <option value="current">Màu hiện tại</option>
                      <option value="white-blue">Trắng - xanh</option>
                      <option value="tokyo">Tokyo</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'voice' && (
              <div className="max-w-xl flex flex-col gap-8">
                <div>
                  <h3 className="text-heading-3 font-heading-3 text-on-surface mb-2">Giọng đọc tiếng Anh</h3>
                  <p className="text-body-sm text-on-surface-variant">
                    Thay đổi giọng đọc tiếng Anh mặc định hoặc chọn một giọng đọc cụ thể. Thanh dropdown chỉ hiển thị những giọng đọc dành cho tiếng Anh được Edge / Web Speech cung cấp.
                  </p>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Chọn giọng đọc</label>
                    <select
                      value={localSettings.speechVoiceURI || ''}
                      onChange={e => setLocalSettings({ ...localSettings, speechVoiceURI: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                    >
                      <option value="">Mặc định tiếng Anh của Edge / trình duyệt</option>
                      {englishVoices.map(voice => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name} ({voice.lang}){voice.default ? ' - Mặc định' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-body-sm text-on-surface-variant">
                      Nếu để mặc định, MinusLearn sẽ ưu tiên giọng tiếng Anh mặc định, đồng thời ưu tiên các giọng Microsoft / Edge nếu có sẵn.
                    </p>
                  </div>

                  <div className="rounded-xl border border-outline-variant bg-surface p-4 flex flex-col gap-3">
                    <div>
                      <h4 className="text-body-md font-semibold text-on-surface">Nghe thử giọng hiện tại</h4>
                      <p className="text-body-sm text-on-surface-variant">
                        Hello, welcome to MinusLearn. Let&apos;s practice English together.
                      </p>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handlePreviewVoice}
                        disabled={!isSpeechSupported}
                        className="px-4 py-2 bg-primary text-on-primary rounded-full font-button text-sm hover:bg-primary-active transition-colors shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                      >
                        Nghe thử
                      </button>
                    </div>
                  </div>

                  {!isSpeechSupported && (
                    <div className="rounded-xl border border-outline-variant bg-surface p-4 text-body-sm text-on-surface-variant">
                      Trình duyệt hiện tại không hỗ trợ Web Speech SpeechSynthesis. Hãy mở app bằng Microsoft Edge để dùng các giọng đọc tiếng Anh có sẵn.
                    </div>
                  )}

                  {isSpeechSupported && englishVoices.length === 0 && (
                    <div className="rounded-xl border border-outline-variant bg-surface p-4 text-body-sm text-on-surface-variant">
                      Chưa tìm thấy giọng đọc tiếng Anh. Thử mở lại bằng Microsoft Edge hoặc kiểm tra cài đặt text to speech của hệ thống.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 md:p-6 border-t border-hairline bg-canvas flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-outline-variant rounded-lg font-button text-sm hover:bg-surface-container-lowest transition-colors">
              Hủy
            </button>
            <button onClick={handleSave} className="px-6 py-2 bg-primary text-on-primary rounded-full font-button text-sm hover:bg-primary-active transition-colors shadow-sm">
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
