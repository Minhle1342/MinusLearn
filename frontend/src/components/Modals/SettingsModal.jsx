import React, { useState, useEffect, useRef } from 'react';
import { X, Key, Bot, Palette, Volume2, Download, Upload, DatabaseBackup, LogOut, Sparkles, Square, Trash2, Wifi, WifiOff } from 'lucide-react';
import { GEMINI_DEFAULT_KEY, GEMINI_DEFAULT_MODEL } from '../../services/api';
import { apiRequest } from '../../services/backendApi';
import { saveDeviceCredentials } from '../../services/deviceCredentials';
import { getEnglishVoices, speakEnglishText } from '../../utils/speech';
import { getMascotSpeech } from '../../services/mascotApi';
import { useAuth } from '../../contexts/AuthContext';

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
  mascotEnabled: true,
  mascotProactivity: 'timed',
  mascotAutoSpeak: true,
  mascotVietnameseVoiceURI: '',
};

const BACKUP_VERSION = 1;
const STORAGE_PREFIX = 'minuslearn_';
const SENSITIVE_SETTING_KEYS = new Set([
  'apiKey',
  'pixabayApiKey',
  'unsplashApiKey',
  'pexelsApiKey',
]);

function parseStoredValue(value) {
  try {
    return { value: JSON.parse(value) };
  } catch {
    return { error: 'invalid_json' };
  }
}

function removeSensitiveSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !SENSITIVE_SETTING_KEYS.has(key))
  );
}

export function SettingsModal({ isOpen, onClose, settings, onSaveSettings }) {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState('ai');
  const [englishVoices, setEnglishVoices] = useState([]);
  const [mascotHealth, setMascotHealth] = useState(null);
  const [mascotVoicePreview, setMascotVoicePreview] = useState('idle');
  const [localSettings, setLocalSettings] = useState(DEFAULT_SETTINGS);
  const [backupStatus, setBackupStatus] = useState(null);
  const [restoreReady, setRestoreReady] = useState(false);
  const [migrationComplete, setMigrationComplete] = useState(false);
  const [dataBusy, setDataBusy] = useState(false);
  const restoreInputRef = useRef(null);
  const migrationInputRef = useRef(null);
  const mascotPreviewAudioRef = useRef(null);
  const mascotPreviewUrlRef = useRef(null);
  const mascotPreviewRequestRef = useRef(0);

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

  useEffect(() => () => {
    mascotPreviewRequestRef.current += 1;
    mascotPreviewAudioRef.current?.pause();
    mascotPreviewAudioRef.current = null;
    if (mascotPreviewUrlRef.current) URL.revokeObjectURL(mascotPreviewUrlRef.current);
    mascotPreviewUrlRef.current = null;
  }, []);

  useEffect(() => {
    if (!isOpen || activeTab !== 'mino') return;
    let cancelled = false;
    apiRequest('/api/mascot/health')
      .then(result => { if (!cancelled) setMascotHealth(result); })
      .catch(() => { if (!cancelled) setMascotHealth({ online: false, modelAvailable: false }); });
    return () => { cancelled = true; };
  }, [activeTab, isOpen]);

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

  const handlePreviewMascotVoice = async () => {
    if (['loading', 'playing'].includes(mascotVoicePreview)) {
      mascotPreviewRequestRef.current += 1;
      mascotPreviewAudioRef.current?.pause();
      mascotPreviewAudioRef.current = null;
      if (mascotPreviewUrlRef.current) URL.revokeObjectURL(mascotPreviewUrlRef.current);
      mascotPreviewUrlRef.current = null;
      setMascotVoicePreview('idle');
      return;
    }
    const requestId = ++mascotPreviewRequestRef.current;
    setMascotVoicePreview('loading');
    try {
      const audioBlob = await getMascotSpeech(
        'Xin chào, mình là Mino. Đây là giọng Nam Minh của mình.',
      );
      if (requestId !== mascotPreviewRequestRef.current) return;
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      mascotPreviewAudioRef.current = audio;
      mascotPreviewUrlRef.current = audioUrl;
      const release = state => {
        if (mascotPreviewAudioRef.current !== audio) return;
        mascotPreviewAudioRef.current = null;
        mascotPreviewUrlRef.current = null;
        URL.revokeObjectURL(audioUrl);
        setMascotVoicePreview(state);
      };
      audio.onplay = () => setMascotVoicePreview('playing');
      audio.onended = () => release('idle');
      audio.onerror = () => release('error');
      await audio.play();
    } catch {
      if (requestId === mascotPreviewRequestRef.current) {
        mascotPreviewAudioRef.current?.pause();
        mascotPreviewAudioRef.current = null;
        if (mascotPreviewUrlRef.current) URL.revokeObjectURL(mascotPreviewUrlRef.current);
        mascotPreviewUrlRef.current = null;
        setMascotVoicePreview('error');
      }
    }
  };

  const handleClearMascotHistory = async () => {
    if (!window.confirm('Xóa toàn bộ lịch sử trò chuyện với Mino?')) return;
    await apiRequest('/api/mascot/history', { method: 'DELETE' });
  };

  const downloadJson = (backup, prefix = 'minuslearn-backup') => {
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = `${prefix}-${(backup.exportedAt || new Date().toISOString()).replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleBackup = async () => {
    setDataBusy(true);
    try {
      const backup = await apiRequest('/api/backups/export');
      downloadJson(backup);

      setBackupStatus({
        type: 'success',
        message: `Đã tải backup MongoDB gồm ${Object.keys(backup.data || {}).length} nhóm dữ liệu.`,
      });
      setRestoreReady(false);
      setMigrationComplete(false);
    } catch (error) {
      console.error('Không thể sao lưu dữ liệu MinusLearn:', error);
      setBackupStatus({ type: 'error', message: 'Không thể tạo file backup từ MongoDB. Vui lòng thử lại.' });
    } finally {
      setDataBusy(false);
    }
  };

  const handleRestoreFile = async event => {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (!file) return;

    setDataBusy(true);
    try {
      const backup = JSON.parse(await file.text());
      if (
        backup?.format !== 'minuslearn-local-storage-backup'
        || backup?.version !== BACKUP_VERSION
        || !backup.data
        || typeof backup.data !== 'object'
        || Array.isArray(backup.data)
      ) {
        throw new Error('invalid_backup');
      }
      if (!window.confirm(`Khôi phục dữ liệu MongoDB từ "${file.name}"? Toàn bộ dữ liệu học trên tài khoản hiện tại sẽ được thay thế.`)) {
        return;
      }
      const result = await apiRequest('/api/backups/restore?replace=true', { method: 'POST', body: backup });

      setRestoreReady(true);
      setMigrationComplete(false);
      setBackupStatus({
        type: 'success',
        message: `Đã khôi phục dữ liệu MongoDB (${Object.values(result.counts || {}).reduce((sum, count) => sum + count, 0)} bản ghi). Tải lại trang để áp dụng.`,
      });
    } catch (error) {
      console.error('Không thể khôi phục dữ liệu MinusLearn:', error);
      setRestoreReady(false);
      setBackupStatus({
        type: 'error',
        message: 'File backup không hợp lệ hoặc không thể khôi phục dữ liệu.',
      });
    } finally {
      setDataBusy(false);
    }
  };

  const handleMigrationFile = async event => {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (!file) return;

    setDataBusy(true);
    setMigrationComplete(false);
    try {
      const backup = JSON.parse(await file.text());
      const preview = await apiRequest('/api/migrations/local-storage/preview', { method: 'POST', body: backup });
      const total = Object.values(preview.counts || {}).reduce((sum, count) => sum + count, 0);
      if (!window.confirm(`Nhập ${total} bản ghi từ "${file.name}" vào tài khoản MongoDB trống?`)) return;
      const result = await apiRequest('/api/migrations/local-storage/import', { method: 'POST', body: backup });
      setRestoreReady(true);
      setMigrationComplete(true);
      setBackupStatus({
        type: 'success',
        message: result.status === 'already_imported'
          ? 'File backup này đã được nhập trước đó. Dữ liệu MongoDB vẫn nguyên vẹn.'
          : `Đã nhập ${total} bản ghi LocalStorage vào MongoDB.`,
      });
    } catch (error) {
      console.error('Không thể nhập LocalStorage vào MongoDB:', error);
      setBackupStatus({ type: 'error', message: error.message || 'Không thể nhập file backup vào MongoDB.' });
    } finally {
      setDataBusy(false);
    }
  };

  const handleLegacyBackup = () => {
    const data = {};
    const invalidKeys = [];
    Object.keys(window.localStorage)
      .filter(key => key.startsWith(STORAGE_PREFIX) && key !== 'minuslearn_device_credentials')
      .sort()
      .forEach(key => {
        const parsed = parseStoredValue(window.localStorage.getItem(key));
        if (parsed.error) invalidKeys.push(key);
        else data[key] = key === 'minuslearn_settings' ? removeSensitiveSettings(parsed.value) : parsed.value;
      });
    const backup = {
      format: 'minuslearn-local-storage-backup',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data,
      metadata: { source: 'localStorage', entryCount: Object.keys(data).length, invalidKeys },
    };
    downloadJson(backup, 'minuslearn-localstorage-backup');
    setBackupStatus({ type: 'success', message: `Đã tải ${Object.keys(data).length} nhóm dữ liệu LocalStorage cũ.` });
  };

  const handleClearLegacyData = () => {
    const keys = Object.keys(window.localStorage)
      .filter(key => key.startsWith(STORAGE_PREFIX) && key !== 'minuslearn_device_credentials');
    if (!window.confirm(`Xóa ${keys.length} mục LocalStorage cũ? File backup và dữ liệu MongoDB sẽ không bị ảnh hưởng.`)) return;
    saveDeviceCredentials(localSettings);
    keys.forEach(key => window.localStorage.removeItem(key));
    setMigrationComplete(false);
    setBackupStatus({ type: 'success', message: 'Đã xóa dữ liệu LocalStorage cũ. API key theo thiết bị vẫn được giữ lại.' });
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

          <button
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${activeTab === 'mino' ? 'bg-primary/10 text-primary font-medium' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
            onClick={() => setActiveTab('mino')}
          >
            <Sparkles size={18} />
            <span className="font-body-md text-sm">Mino</span>
          </button>

          <button
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${activeTab === 'data' ? 'bg-primary/10 text-primary font-medium' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
            onClick={() => setActiveTab('data')}
          >
            <DatabaseBackup size={18} />
            <span className="font-body-md text-sm">Dữ liệu</span>
          </button>

          <div className="mt-auto pt-4 hidden md:block" />
          <button
            className="flex items-center gap-3 px-3 py-2 mt-4 md:mt-0 rounded-lg text-left text-error hover:bg-error/10 transition-colors"
            onClick={async () => { await logout(); onClose(); }}
          >
            <LogOut size={18} />
            <span className="font-body-md text-sm">Đăng xuất</span>
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

            {activeTab === 'mino' && (
              <div className="max-w-xl flex flex-col gap-6">
                <div>
                  <h3 className="text-heading-3 font-heading-3 text-on-surface mb-2">Bạn học Mino</h3>
                  <p className="text-body-sm text-on-surface-variant">
                    Mino dùng Qwen local để trò chuyện, gợi ý ôn tập và đồng hành trong các bài luyện.
                  </p>
                </div>

                <div className={`flex items-center gap-sm rounded-[8px] border p-sm text-body-sm ${mascotHealth?.online && mascotHealth?.modelAvailable ? 'border-accent-green/40 bg-accent-green/10 text-accent-green' : 'border-hairline bg-surface text-on-surface-variant'}`}>
                  {mascotHealth?.online && mascotHealth?.modelAvailable ? <Wifi size={18} /> : <WifiOff size={18} />}
                  <span className="flex flex-col gap-1">
                    <span>{mascotHealth?.online && mascotHealth?.modelAvailable
                      ? `Qwen local đã sẵn sàng (${mascotHealth.model})`
                      : 'Chưa tìm thấy Ollama hoặc model qwen2.5:1.5b'}</span>
                    <span>{mascotHealth?.speechVoice
                      ? `Giọng Nam Minh sẵn sàng (${mascotHealth.speechVoice})`
                      : 'Backend chưa cung cấp dịch vụ giọng nói'}</span>
                  </span>
                </div>

                <label className="flex items-center justify-between gap-md rounded-[8px] border border-hairline bg-surface p-md">
                  <span>
                    <span className="block text-body-md font-semibold text-on-surface">Hiển thị Mino</span>
                    <span className="block text-body-sm text-on-surface-variant">Cho phép mascot xuất hiện trên các màn học.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={localSettings.mascotEnabled !== false}
                    onChange={event => setLocalSettings({ ...localSettings, mascotEnabled: event.target.checked })}
                    className="h-5 w-5 accent-primary"
                  />
                </label>

                <div>
                  <label className="mb-xs block text-body-sm font-semibold text-on-surface">Mức chủ động</label>
                  <div className="grid grid-cols-2 overflow-hidden rounded-[8px] border border-hairline bg-surface">
                    <button
                      type="button"
                      onClick={() => setLocalSettings({ ...localSettings, mascotProactivity: 'timed' })}
                      className={`px-md py-sm text-body-sm ${localSettings.mascotProactivity !== 'event' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
                    >
                      Theo thời gian
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocalSettings({ ...localSettings, mascotProactivity: 'event' })}
                      className={`border-l border-hairline px-md py-sm text-body-sm ${localSettings.mascotProactivity === 'event' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
                    >
                      Theo sự kiện
                    </button>
                  </div>
                </div>

                <label className="flex items-center justify-between gap-md rounded-[8px] border border-hairline bg-surface p-md">
                  <span>
                    <span className="block text-body-md font-semibold text-on-surface">Tự động đọc thành tiếng</span>
                    <span className="block text-body-sm text-on-surface-variant">Mino sẽ chờ khi bài học đang dùng âm thanh.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={localSettings.mascotAutoSpeak !== false}
                    onChange={event => setLocalSettings({ ...localSettings, mascotAutoSpeak: event.target.checked })}
                    className="h-5 w-5 accent-primary"
                  />
                </label>

                <div className="flex flex-col gap-xs">
                  <label className="text-body-sm font-semibold text-on-surface">Giọng tiếng Việt của Mino</label>
                  <div className="flex items-center gap-xs">
                    <div className="min-w-0 flex-1 rounded-[8px] border border-outline-variant bg-surface-container-lowest px-sm py-sm text-body-sm text-on-surface">
                      Microsoft Nam Minh - nam Việt Nam
                    </div>
                    <button
                      type="button"
                      onClick={handlePreviewMascotVoice}
                      className="mino-icon-button border border-hairline bg-surface"
                      title={['loading', 'playing'].includes(mascotVoicePreview) ? 'Dừng giọng Nam Minh' : 'Nghe thử giọng Nam Minh'}
                    >
                      {['loading', 'playing'].includes(mascotVoicePreview) ? <Square size={17} /> : <Volume2 size={18} />}
                    </button>
                  </div>
                  <p className="text-xs text-on-surface-variant">Edge TTS không cần API key. Web Speech sẽ tự động đọc dự phòng nếu không lấy được MP3.</p>
                  {mascotVoicePreview === 'loading' && <p className="text-xs text-on-surface-variant">Đang tạo giọng Nam Minh...</p>}
                  {mascotVoicePreview === 'error' && <p className="text-xs text-error">Không thể phát giọng Nam Minh. Hãy kiểm tra kết nối mạng và backend.</p>}
                </div>

                <div className="flex justify-end border-t border-hairline pt-md">
                  <button type="button" onClick={handleClearMascotHistory} className="flex items-center gap-xs rounded-[8px] border border-error/40 px-md py-sm text-body-sm text-error hover:bg-error/10">
                    <Trash2 size={16} /> Xóa lịch sử trò chuyện
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="max-w-xl flex flex-col gap-8">
                <div>
                  <h3 className="text-heading-3 font-heading-3 text-on-surface mb-2">Sao lưu dữ liệu</h3>
                  <p className="text-body-sm text-on-surface-variant">
                    Sao lưu, khôi phục dữ liệu MongoDB hoặc nhập file backup LocalStorage cũ vào tài khoản này.
                  </p>
                </div>

                <div className="rounded-xl border border-outline-variant bg-surface p-4 flex flex-col gap-3">
                  <p className="text-body-sm text-on-surface-variant">
                    File backup bao gồm từ vựng, chủ đề, tiến độ, lỗi luyện tập, dữ liệu viết và lịch sử thi. Các API key của bạn sẽ không được đưa vào file.
                  </p>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleBackup}
                      disabled={dataBusy}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-full font-button text-sm hover:bg-primary-active transition-colors shadow-sm disabled:opacity-50"
                    >
                      <Download size={16} />
                      Backup MongoDB
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-outline-variant bg-surface p-4 flex flex-col gap-3">
                  <div>
                    <h4 className="text-body-md font-semibold text-on-surface">Khôi phục từ backup</h4>
                    <p className="text-body-sm text-on-surface-variant mt-1">
                      Chọn file JSON đã tải từ MinusLearn. Toàn bộ dữ liệu MongoDB của tài khoản hiện tại sẽ bị thay thế sau khi xác nhận.
                    </p>
                  </div>
                  <input
                    ref={restoreInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={handleRestoreFile}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => restoreInputRef.current?.click()}
                      disabled={dataBusy}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-full font-button text-sm hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                      <Upload size={16} />
                      Chọn file để khôi phục
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-outline-variant bg-surface p-4 flex flex-col gap-3">
                  <div>
                    <h4 className="text-body-md font-semibold text-on-surface">Nhập LocalStorage vào MongoDB</h4>
                    <p className="text-body-sm text-on-surface-variant mt-1">
                      Chỉ dùng cho tài khoản chưa có dữ liệu học. File được kiểm tra và nhập một lần, không bao gồm API key.
                    </p>
                  </div>
                  <input
                    ref={migrationInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={handleMigrationFile}
                  />
                  <div className="flex flex-wrap justify-end gap-sm">
                    <button
                      type="button"
                      onClick={handleLegacyBackup}
                      disabled={dataBusy}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-outline-variant text-on-surface rounded-full font-button text-sm hover:bg-canvas-soft transition-colors disabled:opacity-50"
                    >
                      <Download size={16} />
                      Xuất LocalStorage cũ
                    </button>
                    <button
                      type="button"
                      onClick={() => migrationInputRef.current?.click()}
                      disabled={dataBusy}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-full font-button text-sm hover:bg-primary-active transition-colors disabled:opacity-50"
                    >
                      <Upload size={16} />
                      Nhập vào MongoDB
                    </button>
                  </div>
                </div>

                {backupStatus && (
                  <div className={`rounded-xl border p-4 text-body-sm ${backupStatus.type === 'error'
                    ? 'border-error/30 bg-error/10 text-on-error-container'
                    : backupStatus.type === 'warning'
                      ? 'border-accent-orange/30 bg-accent-orange/10 text-on-surface'
                      : 'border-accent-green/30 bg-accent-green/10 text-on-surface'
                    }`}>
                    {backupStatus.message}
                    {restoreReady && (
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="mt-3 block rounded-full border border-current px-3 py-1 font-button text-sm hover:bg-black/5"
                      >
                        Tải lại ngay
                      </button>
                    )}
                    {migrationComplete && (
                      <button
                        type="button"
                        onClick={handleClearLegacyData}
                        className="mt-2 block rounded-full border border-current px-3 py-1 font-button text-sm hover:bg-black/5"
                      >
                        Xóa LocalStorage cũ
                      </button>
                    )}
                  </div>
                )}

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
