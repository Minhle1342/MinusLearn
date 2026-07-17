import React, { useMemo, useRef, useState } from 'react';
import { explainVideoPhrase } from '../../services/api';

const wordPattern = /([A-Za-z0-9]+(?:['’][A-Za-z]+)?)/g;

function speakEnglish(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
}

export function InteractiveTranscript({
  video,
  activeLineIndex,
  state,
  settings,
  lineRefs,
  panelRef,
  onSeekLine,
  onLoopLine,
  onToggleBookmark,
  onSaveNote,
  onSavePhrase,
  onToggleKnown,
  onCacheDictionary,
  onOpenPractice,
  grammarNotes = [],
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [dictionaryLoading, setDictionaryLoading] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const noteDraftRef = useRef('');

  const filteredLines = useMemo(() => (video.transcript || []).map((line, index) => ({ line, index })).filter(({ line, index }) => {
    const matchesSearch = !search || `${line.text} ${line.text_vi || ''}`.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === 'bookmarked') return state.bookmarks.includes(index);
    const stats = state.lineStats?.[index] || {};
    const average = stats.attempts ? stats.totalScore / stats.attempts : null;
    if (filter === 'weak') return average !== null && average < 70;
    if (filter === 'practiced') return Number(stats.attempts || 0) > 0;
    return true;
  }), [filter, search, state.bookmarks, state.lineStats, video.transcript]);

  const openPhrase = (phrase, lineIndex) => {
    const cleanPhrase = String(phrase || '').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (!cleanPhrase) return;
    const normalized = cleanPhrase.toLowerCase();
    setSelected({
      phrase: cleanPhrase,
      lineIndex,
      details: state.dictionaryCache?.[normalized] || null,
    });
  };

  const handleSelection = lineIndex => {
    const phrase = window.getSelection?.().toString().trim();
    if (phrase && phrase.length <= 120) openPhrase(phrase, lineIndex);
  };

  const requestDictionary = async () => {
    if (!selected) return;
    setDictionaryLoading(true);
    try {
      const details = await explainVideoPhrase({
        phrase: selected.phrase,
        line: video.transcript[selected.lineIndex]?.text,
        lineIndex: selected.lineIndex,
      }, settings.apiKey, settings.model);
      setSelected(current => ({ ...current, details }));
      onCacheDictionary(selected.phrase.toLowerCase(), details);
    } catch (error) {
      alert(`Không thể tra cụm từ: ${error.message}`);
    } finally {
      setDictionaryLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-sm border-b border-hairline p-sm">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2 top-2 text-[18px] text-on-surface-variant">search</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm trong transcript…" className="w-full rounded-[8px] border border-hairline bg-surface-container-low py-xs pl-xl pr-sm text-body-sm outline-none focus:border-primary" aria-label="Tìm transcript" />
        </div>
        <div className="flex gap-xs overflow-x-auto" role="group" aria-label="Lọc transcript">
          {[['all', 'Tất cả'], ['bookmarked', 'Đã đánh dấu'], ['weak', 'Câu yếu'], ['practiced', 'Đã luyện']].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-full border px-sm py-1 text-[11px] ${filter === value ? 'border-primary bg-primary text-on-primary' : 'border-hairline bg-surface text-on-surface-variant'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div ref={panelRef} className="relative flex-1 overflow-y-auto p-sm">
        <div className="flex flex-col gap-sm">
          {filteredLines.map(({ line, index }) => {
            const isActive = index === activeLineIndex;
            const bookmarked = state.bookmarks.includes(index);
            const grammar = grammarNotes.filter(note => note.lineIndex === index);
            return (
              <article key={index} ref={element => { lineRefs.current[index] = element; }} aria-current={isActive ? 'true' : undefined} className={`group relative rounded-[8px] border p-sm transition-colors ${isActive ? 'border-primary/50 bg-primary/10 shadow-sm' : 'border-transparent hover:border-hairline hover:bg-surface-container-low'}`}>
                <button type="button" onClick={() => onSeekLine(index)} className="mb-1 font-mono text-[11px] font-semibold text-primary" aria-label={`Phát câu ${index + 1}`}>{new Date(Number(line.start || 0) * 1000).toISOString().slice(14, 19)}</button>
                <div onMouseUp={() => handleSelection(index)} className={`leading-relaxed text-on-surface ${isActive ? 'font-bold' : 'font-semibold'}`}>
                  {String(line.text || '').split(wordPattern).map((part, partIndex) => /^[A-Za-z0-9]+(?:['’][A-Za-z]+)?$/.test(part)
                    ? <button key={partIndex} type="button" onClick={event => { event.stopPropagation(); onSeekLine(index, false); openPhrase(part, index); }} className="rounded px-[1px] hover:bg-accent-sky/30 focus:bg-accent-sky/30 focus:outline-none">{part}</button>
                    : <React.Fragment key={partIndex}>{part}</React.Fragment>)}
                </div>
                {line.text_vi && <p className="mt-1 text-[13px] italic leading-relaxed text-on-surface-variant">{line.text_vi}</p>}
                {grammar.map(note => <div key={note.title} className="mt-xs rounded bg-accent-orange/10 px-xs py-1 text-[11px] text-on-surface"><strong>{note.title}:</strong> {note.explanation}</div>)}

                <div className="mt-xs flex flex-wrap gap-1 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button type="button" onClick={() => onSeekLine(index)} className="transcript-action" title="Phát lại"><span className="material-symbols-outlined">replay</span></button>
                  <button type="button" onClick={() => onLoopLine(index)} className="transcript-action" title="Loop câu"><span className="material-symbols-outlined">repeat_one</span></button>
                  <button type="button" onClick={() => onToggleBookmark(index)} className={`transcript-action ${bookmarked ? 'text-primary' : ''}`} title="Đánh dấu"><span className="material-symbols-outlined">{bookmarked ? 'bookmark' : 'bookmark_add'}</span></button>
                  <button type="button" onClick={() => { noteDraftRef.current = state.notes?.[index] || ''; setEditingNote(editingNote === index ? null : index); }} className="transcript-action" title="Ghi chú"><span className="material-symbols-outlined">note_add</span></button>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(`${line.text}\n${line.text_vi || ''}`)} className="transcript-action" title="Sao chép"><span className="material-symbols-outlined">content_copy</span></button>
                  <button type="button" onClick={() => onOpenPractice('dictation', index)} className="transcript-action px-xs" title="Dictation">D</button>
                  <button type="button" onClick={() => onOpenPractice('shadowing', index)} className="transcript-action px-xs" title="Shadowing">S</button>
                </div>
                {editingNote === index && (
                  <div className="mt-xs flex gap-xs">
                    <textarea maxLength={1000} defaultValue={state.notes?.[index] || ''} onChange={event => { noteDraftRef.current = event.target.value; }} className="min-h-16 flex-1 rounded border border-hairline bg-surface p-xs text-body-sm outline-none focus:border-primary" placeholder="Ghi chú cho câu này (tối đa 1.000 ký tự)…" autoFocus />
                    <button type="button" onClick={() => { onSaveNote(index, noteDraftRef.current); setEditingNote(null); }} className="self-end rounded bg-primary px-sm py-xs text-on-primary">Lưu</button>
                  </div>
                )}
              </article>
            );
          })}
          {!filteredLines.length && <p className="py-xl text-center text-body-sm text-on-surface-variant">Không có câu phù hợp bộ lọc.</p>}
        </div>
      </div>

      {selected && (
        <div className="absolute inset-x-sm bottom-sm z-30 max-h-[70%] overflow-y-auto rounded-[12px] border border-hairline bg-surface p-md shadow-xl" role="dialog" aria-label={`Tra từ ${selected.phrase}`}>
          <div className="flex items-start justify-between gap-sm">
            <div><h4 className="text-heading-3 font-semibold text-on-surface">{selected.phrase}</h4><p className="text-body-sm text-primary">{selected.details?.ipa} {selected.details?.partOfSpeech && `· ${selected.details.partOfSpeech}`}</p></div>
            <button type="button" onClick={() => setSelected(null)} className="transcript-action" aria-label="Đóng"><span className="material-symbols-outlined">close</span></button>
          </div>
          <p className="mt-sm text-body-sm text-on-surface">{selected.details?.meaning || video.transcript[selected.lineIndex]?.text_vi || 'Bấm “Phân tích ngữ cảnh” để lấy nghĩa, IPA và collocation.'}</p>
          {selected.details?.collocations?.length > 0 && <p className="mt-xs text-body-sm"><strong>Collocation:</strong> {selected.details.collocations.join(', ')}</p>}
          {selected.details?.example && <p className="mt-xs text-body-sm italic">“{selected.details.example}”</p>}
          <div className="mt-md flex flex-wrap gap-xs">
            <button type="button" onClick={() => speakEnglish(selected.phrase)} className="learning-tool-button"><span className="material-symbols-outlined text-[18px]">volume_up</span>Nghe</button>
            <button type="button" onClick={requestDictionary} disabled={dictionaryLoading} className="learning-tool-button">{dictionaryLoading ? 'Đang phân tích…' : 'Phân tích ngữ cảnh'}</button>
            <button type="button" onClick={() => onToggleKnown(selected.phrase)} className={`learning-tool-button ${state.knownTokens.includes(selected.phrase.toLowerCase()) ? 'learning-tool-button-active' : ''}`}>Đã biết</button>
            <button type="button" onClick={() => onSavePhrase({ ...selected, details: selected.details || {} })} className="learning-tool-button learning-tool-button-active"><span className="material-symbols-outlined text-[18px]">add</span>Lưu từ/cụm</button>
          </div>
        </div>
      )}
    </div>
  );
}
