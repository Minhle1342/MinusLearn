import React, { useState, useEffect } from 'react';
import { X, Key, Bot, Palette, Volume2 } from 'lucide-react';
import { GEMINI_DEFAULT_KEY, GEMINI_DEFAULT_MODEL } from '../../services/api';
import { getEnglishVoices, speakEnglishText } from '../../utils/speech';

const DEFAULT_SETTINGS = {
  apiKey: GEMINI_DEFAULT_KEY,
  model: GEMINI_DEFAULT_MODEL,
  imageModel: 'openai/gpt-image-2',
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
            <h2 className="text-title font-title text-on-surface">Settings</h2>
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
            <span className="font-body-md text-sm">Giao dien</span>
          </button>

          <button
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${activeTab === 'voice' ? 'bg-primary/10 text-primary font-medium' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
            onClick={() => setActiveTab('voice')}
          >
            <Volume2 size={18} />
            <span className="font-body-md text-sm">Giong doc</span>
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
                  <h3 className="text-heading-3 font-heading-3 text-on-surface mb-2">AI Configuration</h3>
                  <p className="text-body-sm text-on-surface-variant">
                    Cau hinh ket noi voi Google Gemini de su dung tinh nang them tu bang AI.
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
                    <label className="text-body-sm font-semibold text-on-surface">Puter Image Model</label>
                    <select
                      value={localSettings.imageModel || 'openai/gpt-image-2'}
                      onChange={e => setLocalSettings({ ...localSettings, imageModel: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                    >
                      <option value="x-ai/grok-imagine-image-quality">x-ai/grok-imagine-image-quality</option>
                      <option value="x-ai/grok-imagine-image">x-ai/grok-imagine-image</option>
                      <option value="openai/gpt-image-2">openai/gpt-image-2</option>
                      <option value="qwen/qwen-image-2.0-pro">qwen/qwen-image-2.0-pro</option>
                      <option value="qwen/qwen-image-2.0">qwen/qwen-image-2.0</option>
                      <option value="google/gemini-3.1-flash-image-preview">google/gemini-3.1-flash-image-preview</option>
                      <option value="black-forest-labs/flux-2-klein-9b-base">black-forest-labs/flux-2-klein-9b-base</option>
                      <option value="black-forest-labs/flux-2-klein-4b">black-forest-labs/flux-2-klein-4b</option>
                      <option value="wan-ai/wan2.6-image">wan-ai/wan2.6-image</option>
                      <option value="google/gemini-3-pro-image-preview">google/gemini-3-pro-image-preview</option>
                      <option value="openai/gpt-image-1.5">openai/gpt-image-1.5</option>
                      <option value="openai/gpt-image-1-mini">openai/gpt-image-1-mini</option>
                      <option value="bytedance-seed/seedream-4.0">bytedance-seed/seedream-4.0</option>
                      <option value="google/imagen-4.0-ultra">google/imagen-4.0-ultra</option>
                      <option value="google/imagen-4.0-fast">google/imagen-4.0-fast</option>
                      <option value="google/imagen-4.0">google/imagen-4.0</option>
                      <option value="leonardoai/lucid-origin">leonardoai/lucid-origin</option>
                      <option value="qwen/qwen-image">qwen/qwen-image</option>
                      <option value="black-forest-labs/flux.1-kontext-pro">black-forest-labs/flux.1-kontext-pro</option>
                      <option value="black-forest-labs/flux.1-kontext-max">black-forest-labs/flux.1-kontext-max</option>
                      <option value="black-forest-labs/flux.2-max">black-forest-labs/flux.2-max</option>
                      <option value="black-forest-labs/flux.2-flex">black-forest-labs/flux.2-flex</option>
                      <option value="black-forest-labs/flux-2-pro">black-forest-labs/flux-2-pro</option>
                      <option value="black-forest-labs/flux-2-dev">black-forest-labs/flux-2-dev</option>
                      <option value="google/imagen-4.0-preview">google/imagen-4.0-preview</option>
                      <option value="bytedance-seed/seedream-3.0">bytedance-seed/seedream-3.0</option>
                      <option value="openai/gpt-image-1">openai/gpt-image-1</option>
                      <option value="google/gemini-2.5-flash-image">google/gemini-2.5-flash-image</option>
                      <option value="hidream-ai/hidream-i1-full">hidream-ai/hidream-i1-full</option>
                      <option value="hidream-ai/hidream-i1-fast">hidream-ai/hidream-i1-fast</option>
                      <option value="hidream-ai/hidream-i1-dev">hidream-ai/hidream-i1-dev</option>
                      <option value="ideogram/ideogram-3.0">ideogram/ideogram-3.0</option>
                      <option value="leonardoai/phoenix-1.0">leonardoai/phoenix-1.0</option>
                      <option value="rundiffusion/juggernaut-pro-flux">rundiffusion/juggernaut-pro-flux</option>
                      <option value="rundiffusion/juggernaut-lightning-flux">rundiffusion/juggernaut-lightning-flux</option>
                      <option value="black-forest-labs/flux-1.1-pro">black-forest-labs/flux-1.1-pro</option>
                      <option value="black-forest-labs/flux.1-krea-dev">black-forest-labs/flux.1-krea-dev</option>
                      <option value="black-forest-labs/flux-schnell">black-forest-labs/flux-schnell</option>
                      <option value="stabilityai/stable-diffusion-3-medium">stabilityai/stable-diffusion-3-medium</option>
                      <option value="stabilityai/stable-diffusion-xl-base-1.0">stabilityai/stable-diffusion-xl-base-1.0</option>
                      <option value="lykon/dreamshaper">lykon/dreamshaper</option>
                    </select>
                  </div>

                  <div className="border-t border-hairline pt-4 mt-2 flex flex-col gap-4">
                    <div>
                      <h4 className="text-body-md font-semibold text-on-surface">Speech Recognition</h4>
                      <p className="text-body-sm text-on-surface-variant">
                        Luyen noi hien dung Web Speech API cua trinh duyet de bo qua toan bo buoc lay API key va region.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-body-sm font-semibold text-on-surface">Speaking Assessment Mode</label>
                      <select
                        value={localSettings.speakingAssessmentMode || 'web-speech'}
                        onChange={e => setLocalSettings({ ...localSettings, speakingAssessmentMode: e.target.value })}
                        className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                      >
                        <option value="web-speech">Web Speech API (No API key)</option>
                      </select>
                    </div>

                    <div className="rounded-xl border border-outline-variant bg-surface p-4 text-body-sm text-on-surface-variant">
                      Chi can mo MinusLearn bang Chrome hoac Edge, cho phep microphone, roi bam ghi am trong trang Luyen noi.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="max-w-xl flex flex-col gap-8">
                <div>
                  <h3 className="text-heading-3 font-heading-3 text-on-surface mb-2">Phong chu va nen</h3>
                  <p className="text-body-sm text-on-surface-variant">
                    Thay doi giao dien hien thi cua ung dung.
                  </p>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Thay doi co chu</label>
                    <select
                      value={localSettings.fontSize || 'medium'}
                      onChange={e => setLocalSettings({ ...localSettings, fontSize: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                    >
                      <option value="small">Nho</option>
                      <option value="medium">Vua (Mac dinh)</option>
                      <option value="large">Lon</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Thay doi kieu chu</label>
                    <select
                      value={localSettings.fontStyle || 'inter'}
                      onChange={e => setLocalSettings({ ...localSettings, fontStyle: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                    >
                      <option value="inter">Inter (Mac dinh)</option>
                      <option value="serif">Serif</option>
                      <option value="monospace">Monospace</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Thay doi mau nen</label>
                    <select
                      value={localSettings.theme || 'current'}
                      onChange={e => setLocalSettings({ ...localSettings, theme: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                    >
                      <option value="current">Mau hien tai</option>
                      <option value="white-blue">Trang - xanh</option>
                      <option value="tokyo">Tokyo</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'voice' && (
              <div className="max-w-xl flex flex-col gap-8">
                <div>
                  <h3 className="text-heading-3 font-heading-3 text-on-surface mb-2">Giong doc tieng Anh</h3>
                  <p className="text-body-sm text-on-surface-variant">
                    Thay doi giong doc tieng Anh mac dinh hoac chon mot giong doc cu the. Thanh dropdown chi hien thi nhung giong doc danh cho tieng Anh duoc Edge / Web Speech cung cap.
                  </p>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Chon giong doc</label>
                    <select
                      value={localSettings.speechVoiceURI || ''}
                      onChange={e => setLocalSettings({ ...localSettings, speechVoiceURI: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                    >
                      <option value="">Mac dinh tieng Anh cua Edge / trinh duyet</option>
                      {englishVoices.map(voice => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name} ({voice.lang}){voice.default ? ' - Default' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-body-sm text-on-surface-variant">
                      Neu de mac dinh, MinusLearn se uu tien giong tieng Anh mac dinh, dong thoi uu tien cac giong Microsoft / Edge neu co san.
                    </p>
                  </div>

                  <div className="rounded-xl border border-outline-variant bg-surface p-4 flex flex-col gap-3">
                    <div>
                      <h4 className="text-body-md font-semibold text-on-surface">Nghe thu giong hien tai</h4>
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
                        Nghe thu
                      </button>
                    </div>
                  </div>

                  {!isSpeechSupported && (
                    <div className="rounded-xl border border-outline-variant bg-surface p-4 text-body-sm text-on-surface-variant">
                      Trinh duyet hien tai khong ho tro Web Speech SpeechSynthesis. Hay mo app bang Microsoft Edge de dung cac giong doc tieng Anh co san.
                    </div>
                  )}

                  {isSpeechSupported && englishVoices.length === 0 && (
                    <div className="rounded-xl border border-outline-variant bg-surface p-4 text-body-sm text-on-surface-variant">
                      Chua tim thay giong doc tieng Anh. Thu mo lai bang Microsoft Edge hoac kiem tra cai dat text to speech cua he thong.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 md:p-6 border-t border-hairline bg-canvas flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-outline-variant rounded-lg font-button text-sm hover:bg-surface-container-lowest transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} className="px-6 py-2 bg-primary text-on-primary rounded-full font-button text-sm hover:bg-primary-active transition-colors shadow-sm">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
