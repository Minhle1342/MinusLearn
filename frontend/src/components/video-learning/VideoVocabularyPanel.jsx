import React from 'react';

function speak(text) {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function VideoVocabularyPanel({ words, onSeek, onDelete }) {
  return (
    <div className="h-full overflow-y-auto p-sm">
      <div className="mb-sm rounded-[8px] border border-accent-sky/30 bg-accent-sky/10 p-sm text-body-sm text-on-surface">
        Từ/cụm từ được lưu vào chủ đề từ vựng tương ứng với chủ đề video và tự gộp khi trùng.
      </div>
      <div className="flex flex-col gap-sm">
        {words.map(word => (
          <article key={word.id} className="rounded-[8px] border border-hairline bg-surface p-sm">
            <div className="flex items-start justify-between gap-sm">
              <div className="min-w-0"><h4 className="truncate font-semibold text-on-surface" title={word.word}>{word.word}</h4><p className="text-[12px] text-primary">{word.phonetic} {word.kind === 'phrase' ? '· Cụm từ' : ''}</p></div>
              <div className="flex">
                <button type="button" onClick={() => speak(word.word)} className="transcript-action" title="Nghe"><span className="material-symbols-outlined">volume_up</span></button>
                <button type="button" onClick={() => onDelete(word.id)} className="transcript-action text-error" title="Xóa"><span className="material-symbols-outlined">delete</span></button>
              </div>
            </div>
            <p className="mt-xs text-body-sm text-on-surface">{word.meaning || 'Chưa có nghĩa'}</p>
            {word.example && <p className="mt-xs text-[12px] italic text-on-surface-variant">{word.example}</p>}
            <button type="button" onClick={() => onSeek(Number(word.sourceStart || 0))} className="mt-sm flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"><span className="material-symbols-outlined text-[16px]">movie</span>{word.sourceTitle || 'Về cảnh gốc'} · {Math.floor(Number(word.sourceStart || 0) / 60)}:{String(Math.floor(Number(word.sourceStart || 0) % 60)).padStart(2, '0')}</button>
            {Number(word.encounterCount || 0) > 1 && <p className="mt-xs text-[10px] text-on-surface-variant">Đã gặp {word.encounterCount} lần</p>}
          </article>
        ))}
        {!words.length && <div className="py-xl text-center text-body-sm text-on-surface-variant"><span className="material-symbols-outlined mb-sm block text-[40px]">dictionary</span>Click một từ hoặc bôi đen cụm từ trong transcript để lưu.</div>}
      </div>
    </div>
  );
}
