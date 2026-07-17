import React, { useCallback, useState, useEffect } from 'react';
import { useRemoteStorage } from './hooks/useRemoteStorage';
import { useAuth } from './contexts/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { GEMINI_DEFAULT_KEY, GEMINI_DEFAULT_MODEL } from './services/api';
import { apiRequest } from './services/backendApi';

import { TopNavBar } from './components/TopNavBar';
import { Sidebar } from './components/Sidebar';
import { WordGrid } from './components/page/WordGrid';
import { TopicModal } from './components/Modals/TopicModal';
import { WordModal } from './components/Modals/WordModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { ListeningPractice } from './components/page/ListeningPractice';
import { ReadingPractice } from './components/page/ReadingPractice';
import { SpacedReview } from './components/page/SpacedReview';
import { SpeakingPractice } from './components/page/SpeakingPractice';
import { WritingPractice } from './components/page/WritingPractice';
import { ExamPage } from './components/page/ExamPage';
import { BilingualVideo } from './components/page/BilingualVideo';
import { VideoDetail } from './components/page/VideoDetail';

function LearningApp() {
  const [topics, setTopics, topicsMeta] = useRemoteStorage('minuslearn_topics', [
    { id: 'default', name: 'General', colorClass: 'bg-accent-sky' }
  ]);
  const [videoTopics, setVideoTopics] = useRemoteStorage('minuslearn_video_topics', [
    { id: 'default-video', name: 'General Video', colorClass: 'bg-accent-sky' }
  ]);
  const [words, setWords] = useRemoteStorage('minuslearn_words', []);
  const [videos, setVideos, videosMeta] = useRemoteStorage('minuslearn_videos', []);
  const [settings, setSettings] = useRemoteStorage('minuslearn_settings', {
    apiKey: GEMINI_DEFAULT_KEY,
    model: GEMINI_DEFAULT_MODEL,
    pixabayApiKey: '',
    unsplashApiKey: '',
    pexelsApiKey: '',
    fontSize: 'medium',
    fontStyle: 'inter',
    theme: 'current',
    speechVoiceURI: '',
    speakingAssessmentMode: 'web-speech'
  });
  const [srData, setSrData] = useRemoteStorage('minuslearn_sr_data', {});

  const [activeTopicId, setActiveTopicId] = useState('default');
  const [activePage, setActivePage] = useState('vocabulary');
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [mistakeFilter, setMistakeFilter] = useState('none');
  const [viewMode, setViewMode] = useRemoteStorage('minuslearn_view_mode', 'card');

  const handleVideoPlaybackUpdate = useCallback((videoId, changes, options = {}) => {
    videosMeta.updateLocalValue(currentVideos => currentVideos.map(video => (
      video.id === videoId ? { ...video, ...changes } : video
    )));

    return apiRequest(`/api/videos/${encodeURIComponent(videoId)}`, {
      method: 'PATCH',
      body: changes,
      keepalive: Boolean(options.keepalive)
    });
  }, [videosMeta.updateLocalValue]);

  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [topicToEdit, setTopicToEdit] = useState(null);

  const [isWordModalOpen, setIsWordModalOpen] = useState(false);
  const [wordToEdit, setWordToEdit] = useState(null);
  const [initialAiText, setInitialAiText] = useState('');

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const hasProcessedUrl = React.useRef(false);

  useEffect(() => {
    if (topicsMeta.loading || hasProcessedUrl.current) return;
    
    hasProcessedUrl.current = true;
    const params = new URLSearchParams(window.location.search);
    const bulkParam = params.get('bulk');
    const newTopicParam = params.get('newTopic');
    const topicIdParam = params.get('topicId');

    if (bulkParam) {
      if (newTopicParam) {
        const newTopic = {
          id: crypto.randomUUID(),
          name: newTopicParam,
          colorClass: ['bg-accent-sky', 'bg-accent-pink', 'bg-accent-green', 'bg-accent-orange'][Math.floor(Math.random() * 4)]
        };
        setTopics(prev => [...prev, newTopic]);
        setActiveTopicId(newTopic.id);
      } else if (topicIdParam) {
        setActiveTopicId(topicIdParam);
      }

      setInitialAiText(bulkParam);
      setIsWordModalOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [topicsMeta.loading, setTopics]);

  useEffect(() => {
    document.body.classList.remove('theme-white-blue', 'theme-tokyo');
    document.body.classList.remove('font-style-serif', 'font-style-monospace');
    document.body.classList.remove('size-small', 'size-large');

    if (settings.theme === 'white-blue') document.body.classList.add('theme-white-blue');
    if (settings.theme === 'tokyo') document.body.classList.add('theme-tokyo');

    if (settings.fontStyle === 'serif') document.body.classList.add('font-style-serif');
    if (settings.fontStyle === 'monospace') document.body.classList.add('font-style-monospace');

    if (settings.fontSize === 'small') document.body.classList.add('size-small');
    if (settings.fontSize === 'large') document.body.classList.add('size-large');
  }, [settings.theme, settings.fontStyle, settings.fontSize]);

  useEffect(() => {
    const syncTopics = () => {
      window.postMessage({
        type: 'MINUSLEARN_SYNC_TOPICS',
        topics
      }, '*');
    };

    syncTopics();

    const handleMessage = event => {
      if (event.source === window && event.data && event.data.type === 'MINUSLEARN_REQUEST_TOPICS') {
        syncTopics();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [topics]);

  const handleSaveTopic = name => {
    if (topicToEdit) {
      setTopics(topics.map(topic => topic.id === topicToEdit.id ? { ...topic, name } : topic));
    } else {
      const newTopic = {
        id: crypto.randomUUID(),
        name,
        colorClass: ['bg-accent-sky', 'bg-accent-pink', 'bg-accent-green', 'bg-accent-orange'][Math.floor(Math.random() * 4)]
      };
      setTopics([...topics, newTopic]);
      setActiveTopicId(newTopic.id);
    }
  };

  const handleDeleteTopic = id => {
    setTopics(topics.filter(topic => topic.id !== id));
    setWords(words.filter(word => word.topicId !== id));
    if (activeTopicId === id) setActiveTopicId(topics[0]?.id || null);
    setIsTopicModalOpen(false);
  };

  const handleSaveWord = wordData => {
    if (wordData.id && words.find(word => word.id === wordData.id)) {
      setWords(words.map(word => word.id === wordData.id ? wordData : word));
    } else {
      const newWord = {
        ...wordData,
        id: wordData.id || crypto.randomUUID(),
        createdAt: Date.now()
      };
      setWords(prev => [...prev, newWord]);
    }
  };

  const handleDeleteWord = id => {
    setWords(words.filter(word => word.id !== id));
    setIsWordModalOpen(false);
  };

  const handleSaveVideoVocabulary = useCallback((video, wordData) => {
    const sourceVideoTopicId = video.topicId || 'default-video';
    const vocabularyTopicId = `video-vocabulary-${sourceVideoTopicId}`;
    const sourceTopic = videoTopics.find(topic => topic.id === sourceVideoTopicId);
    setTopics(currentTopics => currentTopics.some(topic => topic.sourceVideoTopicId === sourceVideoTopicId || topic.id === vocabularyTopicId)
      ? currentTopics
      : [...currentTopics, {
          id: vocabularyTopicId,
          sourceVideoTopicId,
          name: `${sourceTopic?.name || 'Video'} · Từ vựng`,
          colorClass: sourceTopic?.colorClass || 'bg-accent-sky',
        }]);

    const normalizedText = String(wordData.word || '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalizedText) return Promise.resolve();
    return setWords(currentWords => {
      const existing = currentWords.find(word => word.topicId === vocabularyTopicId && (
        word.normalizedText === normalizedText
        || String(word.word || '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim() === normalizedText
      ));
      const occurrence = {
        sourceVideoId: video.id,
        sourceTitle: video.title,
        sourceLineIndex: wordData.sourceLineIndex,
        sourceStart: wordData.sourceStart,
        sourceEnd: wordData.sourceEnd,
        sentence: wordData.sourceSentence,
        translation: wordData.sourceTranslation,
        encounteredAt: Date.now(),
      };
      if (existing) {
        const occurrences = existing.sourceOccurrences || [];
        const isDuplicateOccurrence = occurrences.some(item => item.sourceVideoId === occurrence.sourceVideoId && item.sourceLineIndex === occurrence.sourceLineIndex);
        return currentWords.map(word => word.id === existing.id ? {
          ...word,
          ...wordData,
          id: word.id,
          topicId: vocabularyTopicId,
          normalizedText,
          sourceOccurrences: isDuplicateOccurrence ? occurrences : [...occurrences, occurrence],
          encounterCount: Number(word.encounterCount || 1) + (isDuplicateOccurrence ? 0 : 1),
          updatedAt: Date.now(),
        } : word);
      }
      return [...currentWords, {
        ...wordData,
        id: crypto.randomUUID(),
        topicId: vocabularyTopicId,
        sourceVideoTopicId,
        normalizedText,
        sourceOccurrences: [occurrence],
        encounterCount: 1,
        createdAt: Date.now(),
      }];
    });
  }, [setTopics, setWords, videoTopics]);

  const handleDeleteVideoVocabulary = useCallback(wordId => setWords(currentWords => currentWords.filter(word => word.id !== wordId)), [setWords]);

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      <TopNavBar
        wordCount={words.length}
        activePage={activePage}
        setActivePage={setActivePage}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {activePage !== 'bilingual-video' && activePage !== 'video-detail' && (
          <Sidebar
            isDrawerOpen={isDrawerOpen}
            setIsDrawerOpen={setIsDrawerOpen}
            topics={topics}
            activeTopicId={activeTopicId}
            setActiveTopicId={setActiveTopicId}
            onAddTopic={() => { setTopicToEdit(null); setIsTopicModalOpen(true); }}
            onEditTopic={id => { setTopicToEdit(topics.find(topic => topic.id === id)); setIsTopicModalOpen(true); }}
            onDeleteTopic={handleDeleteTopic}
            words={words}
            srData={srData}
          />
        )}

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-canvas">
          {activePage === 'vocabulary' ? (
            <>
              <div className="px-md md:px-xxl py-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-md border-b border-hairline bg-canvas shrink-0 fixed-top">
                <div className="flex items-center gap-sm w-full md:w-auto">
                  <div className="relative w-full md:w-96 flex-shrink-0">
                    <input
                      value={searchTerm}
                      onChange={event => setSearchTerm(event.target.value)}
                      className="w-full pl-xl pr-sm py-sm bg-surface-container-low border border-hairline rounded-[8px] font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
                      placeholder="Tìm từ vựng..."
                      type="text"
                    />
                  </div>
                  <select
                    value={mistakeFilter}
                    onChange={e => setMistakeFilter(e.target.value)}
                    className={`px-md py-sm rounded-[8px] border ${mistakeFilter !== 'none' ? 'bg-error text-white border-error' : 'bg-surface-container-low border-hairline text-on-surface-variant hover:bg-surface-container'} transition-colors font-button text-button whitespace-nowrap focus:outline-none`}
                  >
                    <option value="none" className="text-ink bg-surface">Tất cả từ vựng</option>
                    <option value="any" className="text-ink bg-surface">Sai bất kỳ</option>
                    <option value="listening" className="text-ink bg-surface">Sai luyện nghe</option>
                    <option value="reading" className="text-ink bg-surface">Sai đọc - hiểu</option>
                    <option value="both" className="text-ink bg-surface">Sai cả 2</option>
                  </select>
                </div>

                <div className="flex gap-sm w-full md:w-auto items-center">
                  <div className="flex bg-surface-container-low rounded-[8px] p-1 border border-hairline">
                    <button
                      onClick={() => setViewMode('card')}
                      className={`px-3 py-1.5 rounded-[6px] flex items-center justify-center transition-all ${viewMode === 'card' ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                      title="Card View"
                    >
                      <span className="material-symbols-outlined text-[18px]">grid_view</span>
                    </button>
                    <button
                      onClick={() => setViewMode('flashcard')}
                      className={`px-3 py-1.5 rounded-[6px] flex items-center justify-center transition-all ${viewMode === 'flashcard' ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                      title="Flashcard View"
                    >
                      <span className="material-symbols-outlined text-[18px]">style</span>
                    </button>
                  </div>

                  <button
                    onClick={() => { setWordToEdit(null); setInitialAiText(''); setIsWordModalOpen(true); }}
                    className="flex-1 md:flex-none bg-primary text-on-primary px-lg py-sm rounded-full font-button text-button hover:bg-primary-active transition-colors shadow-sm flex items-center justify-center gap-xs"
                  >
                    <span className="material-symbols-outlined text-[20px]">add</span>
                    Thêm từ vựng
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {activeTopicId ? (
                  <WordGrid
                    words={words}
                    activeTopicId={activeTopicId}
                    searchTerm={searchTerm}
                    viewMode={viewMode}
                    settings={settings}
                    mistakeFilter={mistakeFilter}
                    onAddWord={() => { setWordToEdit(null); setInitialAiText(''); setIsWordModalOpen(true); }}
                    onEditWord={id => { setWordToEdit(words.find(word => word.id === id)); setInitialAiText(''); setIsWordModalOpen(true); }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-on-surface-variant">
                    Select or create a topic first.
                  </div>
                )}
              </div>
            </>
          ) : activePage === 'listening' ? (
            <div className="flex-1 overflow-y-auto bg-canvas-soft">
              <ListeningPractice
                words={words}
                activeTopicId={activeTopicId}
                topics={topics}
                settings={settings}
                setSrData={setSrData}
              />
            </div>
          ) : activePage === 'reading' ? (
            <div className="flex-1 overflow-y-auto bg-canvas-soft">
              <ReadingPractice
                words={words}
                activeTopicId={activeTopicId}
                topics={topics}
                settings={settings}
                setSrData={setSrData}
              />
            </div>
          ) : activePage === 'speaking' ? (
            <div className="flex-1 overflow-y-auto bg-canvas-soft">
              <SpeakingPractice
                  words={words}
                  activeTopicId={activeTopicId}
                  topics={topics}
                  settings={settings}
                  onOpenSettings={() => setIsSettingsModalOpen(true)}
                  setSrData={setSrData}
                />
            </div>
          ) : activePage === 'writing' ? (
            <div className="flex-1 overflow-y-auto bg-canvas-soft">
              <WritingPractice
                words={words}
                topics={topics}
                activeTopicId={activeTopicId}
                settings={settings}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
              />
            </div>
          ) : activePage === 'exam' ? (
            <div className="flex-1 overflow-y-auto bg-canvas-soft">
              <ExamPage
                words={words}
                activeTopicId={activeTopicId}
                topics={topics}
                settings={settings}
                setSrData={setSrData}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
              />
            </div>
          ) : activePage === 'review' ? (
            <div className="flex-1 overflow-y-auto bg-canvas-soft">
              <SpacedReview
                words={words}
                activeTopicId={activeTopicId}
                topics={topics}
                srData={srData}
                setSrData={setSrData}
                settings={settings}
              />
            </div>
          ) : activePage === 'bilingual-video' ? (
            <div className="flex-1 overflow-y-auto bg-canvas-soft">
              <BilingualVideo
                videos={videos}
                setVideos={setVideos}
                topics={videoTopics}
                setTopics={setVideoTopics}
                settings={settings}
                onVideoSelect={(videoId) => {
                  setActiveVideoId(videoId);
                  setActivePage('video-detail');
                }}
              />
            </div>
          ) : activePage === 'video-detail' ? (
            <div className="flex-1 overflow-y-auto bg-canvas-soft">
              <VideoDetail
                videoId={activeVideoId}
                videos={videos}
                setVideos={setVideos}
                settings={settings}
                onVideoSelect={setActiveVideoId}
                onPlaybackUpdate={handleVideoPlaybackUpdate}
                videoTopic={videoTopics.find(topic => topic.id === videos.find(video => video.id === activeVideoId)?.topicId)}
                videoVocabulary={words.filter(word => word.sourceVideoId === activeVideoId || word.sourceOccurrences?.some(item => item.sourceVideoId === activeVideoId))}
                onSaveVocabulary={wordData => {
                  const activeVideo = videos.find(video => video.id === activeVideoId);
                  return activeVideo ? handleSaveVideoVocabulary(activeVideo, wordData) : Promise.resolve();
                }}
                onDeleteVocabulary={handleDeleteVideoVocabulary}
                onBack={() => {
                  setActiveVideoId(null);
                  setActivePage('bilingual-video');
                }}
              />
            </div>
          ) : null}
        </main>
      </div>

      <TopicModal
        isOpen={isTopicModalOpen}
        onClose={() => setIsTopicModalOpen(false)}
        topicToEdit={topicToEdit}
        onSave={handleSaveTopic}
        onDelete={handleDeleteTopic}
      />

      <WordModal
        isOpen={isWordModalOpen}
        onClose={() => {
          setIsWordModalOpen(false);
          setInitialAiText('');
        }}
        wordToEdit={wordToEdit}
        onSave={handleSaveWord}
        onDelete={handleDeleteWord}
        activeTopicId={activeTopicId}
        settings={settings}
        initialAiText={initialAiText}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSaveSettings={setSettings}
      />
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen bg-canvas flex items-center justify-center text-primary">Đang kết nối MinusLearn...</div>;
  }
  if (!user) return <AuthScreen />;
  return <LearningApp />;
}

export default App;
