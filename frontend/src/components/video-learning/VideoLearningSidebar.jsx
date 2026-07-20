import React, { useEffect, useMemo, useState } from 'react';
import { generateVideoLearningPack } from '../../services/api';
import { getAdaptiveDifficulty, learningPackCacheKey, validateLearningPack } from '../../utils/videoLearning';
import { InteractiveTranscript } from './InteractiveTranscript';
import { VideoPracticePanel } from './VideoPracticePanel';
import { VideoProgressPanel } from './VideoProgressPanel';
import { VideoVocabularyPanel } from './VideoVocabularyPanel';

const tabs = [
  ['transcript', 'Transcript', 'subtitles'],
  ['vocabulary', 'Từ vựng', 'dictionary'],
  ['practice', 'Luyện tập', 'fitness_center'],
  ['progress', 'Tiến độ', 'monitoring'],
];

export function VideoLearningSidebar({
  video,
  activeLineIndex,
  lineRefs,
  panelRef,
  settings,
  learning,
  videoVocabulary,
  onSaveVocabulary,
  onDeleteVocabulary,
  onSeekLine,
  onSeekTime,
  onPlayLine,
  onPause,
  onLoopLine,
  practiceShortcut,
}) {
  const [activeTab, setActiveTab] = useState('transcript');
  const [practiceRequest, setPracticeRequest] = useState({ activity: 'dictation', lineIndex: 0, nonce: 0 });
  const [generatingPack, setGeneratingPack] = useState(false);
  const [packError, setPackError] = useState('');
  const { state, attempts, updateState, updatePreferences, addAttempt, reset } = learning;
  const resolvedDifficulty = state.preferences.difficulty === 'auto' ? getAdaptiveDifficulty(attempts) : state.preferences.difficulty;
  const cacheKey = learningPackCacheKey(video.transcript, settings.model, resolvedDifficulty);
  const learningPack = useMemo(() => {
    const entry = state.learningPackCache?.[cacheKey];
    return validateLearningPack(entry?.pack) ? entry.pack : null;
  }, [cacheKey, state.learningPackCache]);

  useEffect(() => {
    if (!practiceShortcut?.activity) return;
    setPracticeRequest({
      activity: practiceShortcut.activity,
      lineIndex: Math.max(0, practiceShortcut.lineIndex),
      nonce: practiceShortcut.nonce,
    });
    setActiveTab('practice');
  }, [practiceShortcut]);

  const toggleBookmark = index => updateState(current => ({
    ...current,
    bookmarks: current.bookmarks.includes(index) ? current.bookmarks.filter(item => item !== index) : [...current.bookmarks, index].sort((a, b) => a - b),
  }));
  const saveNote = (index, note) => updateState(current => ({ ...current, notes: { ...current.notes, [index]: note.slice(0, 1000) } }));
  const toggleKnown = phrase => {
    const normalized = phrase.toLowerCase();
    return updateState(current => ({ ...current, knownTokens: current.knownTokens.includes(normalized) ? current.knownTokens.filter(item => item !== normalized) : [...current.knownTokens, normalized] }));
  };
  const cacheDictionary = (phrase, details) => updateState(current => {
    const entries = Object.entries({ ...current.dictionaryCache, [phrase]: details }).slice(-500);
    return { ...current, dictionaryCache: Object.fromEntries(entries) };
  });
  const savePhrase = async selected => {
    const line = video.transcript[selected.lineIndex];
    await onSaveVocabulary({
      word: selected.phrase,
      phonetic: selected.details?.ipa || '',
      meaning: selected.details?.meaning || line?.text_vi || '',
      example: selected.details?.example || line?.text || '',
      partOfSpeech: selected.details?.partOfSpeech || '',
      collocations: selected.details?.collocations || [],
      kind: selected.phrase.trim().includes(' ') ? 'phrase' : 'word',
      sourceVideoId: video.id,
      sourceTitle: video.title,
      sourceLineIndex: selected.lineIndex,
      sourceStart: Number(line?.start || 0),
      sourceEnd: Number(line?.start || 0) + Number(line?.duration || 0),
      sourceSentence: line?.text || '',
      sourceTranslation: line?.text_vi || '',
    });
    updateState(current => ({ ...current, aggregateStats: { ...current.aggregateStats, savedWords: Number(current.aggregateStats?.savedWords || 0) + 1 } }));
    setActiveTab('vocabulary');
  };
  const openPractice = (activity, lineIndex) => {
    setPracticeRequest(current => ({ activity, lineIndex, nonce: current.nonce + 1 }));
    setActiveTab('practice');
  };

  const generatePack = async () => {
    setGeneratingPack(true); setPackError('');
    try {
      const pack = await generateVideoLearningPack(video.transcript, resolvedDifficulty, settings.apiKey, settings.model);
      if (!validateLearningPack(pack)) throw new Error('Dữ liệu AI không hợp lệ.');
      await updateState(current => ({
        ...current,
        learningPackCache: {
          ...current.learningPackCache,
          [cacheKey]: { pack, createdAt: Date.now(), model: settings.model, difficulty: resolvedDifficulty, schemaVersion: 1 },
        },
      }));
    } catch (error) {
      setPackError(error.message);
    } finally {
      setGeneratingPack(false);
    }
  };

  return (
    <aside className="relative flex h-full min-h-0 w-full flex-col bg-surface" aria-label="English Video Learning Studio">
      <div className="grid shrink-0 grid-cols-4 border-b border-hairline bg-surface" role="tablist">
        {tabs.map(([value, label, icon]) => <button key={value} type="button" role="tab" aria-selected={activeTab === value} onClick={() => setActiveTab(value)} className={`flex min-w-0 flex-col items-center gap-0.5 border-b-2 px-xs py-sm text-[10px] font-medium transition-colors sm:text-[11px] ${activeTab === value ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}><span className="material-symbols-outlined text-[19px]">{icon}</span><span className="truncate">{label}</span></button>)}
      </div>
      {learning.loading && <div className="absolute inset-x-0 top-[54px] z-20 h-0.5 overflow-hidden bg-primary/20"><div className="h-full w-1/2 animate-pulse bg-primary" /></div>}
      {learning.error && <div className="shrink-0 bg-error/10 px-sm py-xs text-[11px] text-error">Không thể đồng bộ một phần tiến độ: {learning.error.message}</div>}
      {packError && <div className="shrink-0 bg-error/10 px-sm py-xs text-[11px] text-error">{packError}</div>}

      <div className="min-h-0 flex-1">
        {activeTab === 'transcript' && <InteractiveTranscript video={video} activeLineIndex={activeLineIndex} state={state} settings={settings} lineRefs={lineRefs} panelRef={panelRef} onSeekLine={onSeekLine} onLoopLine={onLoopLine} onToggleBookmark={toggleBookmark} onSaveNote={saveNote} onSavePhrase={savePhrase} onToggleKnown={toggleKnown} onCacheDictionary={cacheDictionary} onOpenPractice={openPractice} grammarNotes={learningPack?.grammarNotes || []} />}
        {activeTab === 'vocabulary' && <VideoVocabularyPanel words={videoVocabulary} onSeek={onSeekTime} onDelete={onDeleteVocabulary} />}
        {activeTab === 'practice' && <VideoPracticePanel key={practiceRequest.nonce} video={video} activeLineIndex={activeLineIndex} requestedActivity={practiceRequest.activity} requestedLineIndex={practiceRequest.nonce ? practiceRequest.lineIndex : activeLineIndex} state={state} attempts={attempts} settings={settings} learningPack={learningPack} onGenerateLearningPack={generatePack} generatingPack={generatingPack} onSeekLine={onSeekLine} onPlayLine={onPlayLine} onPause={onPause} onAttempt={addAttempt} />}
        {activeTab === 'progress' && <VideoProgressPanel video={video} state={state} attempts={attempts} words={videoVocabulary} onDifficultyChange={difficulty => updatePreferences({ difficulty })} onSeekLine={onSeekLine} onReset={reset} learningPack={learningPack} onGenerateLearningPack={generatePack} generatingPack={generatingPack} />}
      </div>
    </aside>
  );
}
