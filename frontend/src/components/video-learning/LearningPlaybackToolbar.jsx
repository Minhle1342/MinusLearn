import React from 'react';

const subtitleModes = [
  ['bilingual', 'Song ngữ'],
  ['english', 'English'],
  ['vietnamese', 'Tiếng Việt'],
  ['hidden', 'Ẩn'],
  ['reveal', 'Nghe → hiện'],
];

export function LearningPlaybackToolbar({
  preferences,
  onPreferencesChange,
  activeLineIndex,
  lineCount,
  onPreviousLine,
  onNextLine,
  onReplay,
  loopRange,
  onSetLoopPoint,
  onClearLoop,
}) {
  return (
    <div className="border-t border-hairline bg-surface px-sm py-xs text-on-surface">
      <div className="flex items-center gap-xs overflow-x-auto pb-1" aria-label="Công cụ học theo video">
        <button type="button" onClick={onPreviousLine} disabled={activeLineIndex <= 0} className="learning-tool-button" title="Câu trước (J)" aria-label="Câu trước">
          <span className="material-symbols-outlined text-[19px]">skip_previous</span>
        </button>
        <button type="button" onClick={onReplay} disabled={activeLineIndex < 0} className="learning-tool-button" title="Phát lại câu (R)">
          <span className="material-symbols-outlined text-[19px]">replay</span>
          <span className="hidden xl:inline">Lặp {preferences.repeatCount}×</span>
        </button>
        <button type="button" onClick={onNextLine} disabled={activeLineIndex < 0 || activeLineIndex >= lineCount - 1} className="learning-tool-button" title="Câu sau (L)" aria-label="Câu sau">
          <span className="material-symbols-outlined text-[19px]">skip_next</span>
        </button>

        <label className="learning-tool-field" title="Tốc độ phát">
          <span className="material-symbols-outlined text-[18px]">speed</span>
          <select value={preferences.playbackRate} onChange={event => onPreferencesChange({ playbackRate: Number(event.target.value) })} aria-label="Tốc độ phát" className="bg-transparent outline-none">
            {[0.5, 0.75, 0.9, 1, 1.25, 1.5].map(rate => <option key={rate} value={rate}>{rate}×</option>)}
          </select>
        </label>

        <label className="learning-tool-field" title="Chế độ phụ đề">
          <span className="material-symbols-outlined text-[18px]">subtitles</span>
          <select value={preferences.subtitleMode} onChange={event => onPreferencesChange({ subtitleMode: event.target.value })} aria-label="Chế độ phụ đề" className="max-w-[110px] bg-transparent outline-none">
            {subtitleModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <label className="learning-tool-field" title="Lệch phụ đề từ -5 đến +5 giây">
          <span className="text-[11px]">Sub</span>
          <input type="number" min="-5" max="5" step="0.1" value={preferences.subtitleOffset} onChange={event => onPreferencesChange({ subtitleOffset: Math.max(-5, Math.min(5, Number(event.target.value))) })} className="w-12 bg-transparent text-center outline-none" aria-label="Độ lệch phụ đề" />
          <span className="text-[11px]">s</span>
        </label>

        <button type="button" onClick={() => onPreferencesChange({ autoPause: !preferences.autoPause })} aria-pressed={preferences.autoPause} className={`learning-tool-button ${preferences.autoPause ? 'learning-tool-button-active' : ''}`} title="Tự dừng cuối câu">
          <span className="material-symbols-outlined text-[19px]">motion_photos_paused</span>
          <span className="hidden 2xl:inline">Auto-pause</span>
        </button>
        <button type="button" onClick={() => onPreferencesChange({ progressiveReplay: !preferences.progressiveReplay })} aria-pressed={preferences.progressiveReplay} className={`learning-tool-button ${preferences.progressiveReplay ? 'learning-tool-button-active' : ''}`} title="Lặp tăng tốc 0.75× → 0.9× → 1×">
          <span className="material-symbols-outlined text-[19px]">trending_up</span>
        </button>
        <button type="button" onClick={() => onPreferencesChange({ audioFocus: !preferences.audioFocus })} aria-pressed={preferences.audioFocus} className={`learning-tool-button ${preferences.audioFocus ? 'learning-tool-button-active' : ''}`} title="Che hình để tập trung nghe">
          <span className="material-symbols-outlined text-[19px]">visibility_off</span>
          <span className="hidden 2xl:inline">Audio focus</span>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => onSetLoopPoint('start')} disabled={activeLineIndex < 0} className={`learning-tool-button ${loopRange?.start === activeLineIndex ? 'learning-tool-button-active' : ''}`} title="Đặt đầu đoạn A">A</button>
          <button type="button" onClick={() => onSetLoopPoint('end')} disabled={activeLineIndex < 0} className={`learning-tool-button ${loopRange?.end === activeLineIndex ? 'learning-tool-button-active' : ''}`} title="Đặt cuối đoạn B">B</button>
          {loopRange && <button type="button" onClick={onClearLoop} className="learning-tool-button" title="Tắt A–B loop"><span className="material-symbols-outlined text-[18px]">close</span></button>}
        </div>
      </div>

      <div className="flex items-center gap-md px-xs text-[11px] text-on-surface-variant">
        <label className="flex items-center gap-xs">
          Lặp câu
          <input type="range" min="1" max="5" value={preferences.repeatCount} onChange={event => onPreferencesChange({ repeatCount: Number(event.target.value) })} className="w-16 accent-primary" />
          {preferences.repeatCount}×
        </label>
        {preferences.autoPause && (
          <label className="flex items-center gap-xs">
            Chờ
            <input type="number" min="0.5" max="10" step="0.5" value={preferences.autoPauseDelay} onChange={event => onPreferencesChange({ autoPauseDelay: Math.max(0.5, Math.min(10, Number(event.target.value))) })} className="w-12 rounded border border-hairline bg-surface-container-low px-1" /> giây
          </label>
        )}
        {loopRange && <span className="font-medium text-primary">A–B: câu {loopRange.start + 1} → {loopRange.end + 1}</span>}
      </div>
    </div>
  );
}
