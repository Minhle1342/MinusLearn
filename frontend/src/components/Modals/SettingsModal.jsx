import React, { useState, useEffect } from 'react';
import { X, Key, Bot, Palette } from 'lucide-react';
import { GEMINI_DEFAULT_KEY, GEMINI_DEFAULT_MODEL } from '../../services/api';

export function SettingsModal({ isOpen, onClose, settings, onSaveSettings }) {
  const [activeTab, setActiveTab] = useState('ai');
  const [localSettings, setLocalSettings] = useState({
    apiKey: GEMINI_DEFAULT_KEY,
    model: GEMINI_DEFAULT_MODEL,
    imageModel: 'openai/gpt-image-2',
    fontSize: 'medium',
    fontStyle: 'inter',
    theme: 'current'
  });

  useEffect(() => {
    if (isOpen && settings) {
      setLocalSettings(prev => ({
        ...prev,
        ...settings
      }));
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveSettings(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex justify-center items-center p-4 backdrop-blur-sm">
      <div className="bg-canvas w-full max-w-3xl h-[80vh] md:h-[600px] rounded-[16px] shadow-lg flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Sidebar */}
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
            <span className="font-body-md text-sm">Phong chữ và nền</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col bg-canvas-soft relative">
          <button className="absolute top-4 right-4 text-on-surface-variant hover:text-ink hidden md:block" onClick={onClose}>
            <X size={20} />
          </button>

          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {activeTab === 'ai' && (
              <div className="max-w-xl flex flex-col gap-8">
                <div>
                  <h3 className="text-heading-3 font-heading-3 text-on-surface mb-2">AI Configuration</h3>
                  <p className="text-body-sm text-on-surface-variant">Cấu hình kết nối với Google Gemini để sử dụng tính năng "Thêm bằng AI".</p>
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
                        onChange={e => setLocalSettings({...localSettings, apiKey: e.target.value})}
                        className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-mono text-sm"
                        placeholder="AIzaSy..."
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Gemini Model</label>
                    <select 
                      value={localSettings.model}
                      onChange={e => setLocalSettings({...localSettings, model: e.target.value})}
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
                      onChange={e => setLocalSettings({...localSettings, imageModel: e.target.value})}
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
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="max-w-xl flex flex-col gap-8">
                <div>
                  <h3 className="text-heading-3 font-heading-3 text-on-surface mb-2">Phong chữ và nền</h3>
                  <p className="text-body-sm text-on-surface-variant">Tuỳ chỉnh giao diện hiển thị của ứng dụng.</p>
                </div>
                
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-body-sm font-semibold text-on-surface">Thay đổi cỡ chữ</label>
                    <select 
                      value={localSettings.fontSize || 'medium'}
                      onChange={e => setLocalSettings({...localSettings, fontSize: e.target.value})}
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
                      onChange={e => setLocalSettings({...localSettings, fontStyle: e.target.value})}
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
                      onChange={e => setLocalSettings({...localSettings, theme: e.target.value})}
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
