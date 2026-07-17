import React, { useMemo } from 'react';
import {
  buildTranscriptSrt,
  buildTranscriptTxt,
  buildVocabularyCsv,
  downloadLearningFile,
  getAdaptiveDifficulty,
} from '../../utils/videoLearning';

const skillActivities = {
  Listening: ['listening', 'dictation'],
  Dictation: ['dictation'],
  Speaking: ['shadowing', 'reply-to-scene', 'retell'],
  'Reading / Comprehension': ['comprehension', 'translation-recall', 'sentence-builder'],
};

function average(items) {
  return items.length ? Math.round(items.reduce((sum, item) => sum + Number(item.score || 0), 0) / items.length) : 0;
}

function formatPracticeTime(seconds) {
  const minutes = Math.floor(Number(seconds || 0) / 60);
  return minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}

export function VideoProgressPanel({ video, state, attempts, words, onDifficultyChange, onSeekLine, onReset, learningPack, onGenerateLearningPack, generatingPack }) {
  const scores = useMemo(() => Object.entries(skillActivities).map(([skill, names]) => ({
    skill,
    score: average(attempts.filter(item => names.includes(item.activity))),
    attempts: attempts.filter(item => names.includes(item.activity)).length,
  })), [attempts]);
  const lineEntries = Object.entries(state.lineStats || {}).map(([index, stats]) => ({
    index: Number(index),
    attempts: Number(stats.attempts || 0),
    score: stats.attempts ? Math.round(Number(stats.totalScore || 0) / stats.attempts) : null,
  }));
  const weakLines = lineEntries.filter(item => item.score !== null && item.score < 70).sort((a, b) => a.score - b.score);
  const masteredLines = lineEntries.filter(item => item.score >= 85);
  const weakestSkill = scores.filter(item => item.attempts).sort((a, b) => a.score - b.score)[0];
  const adaptive = getAdaptiveDifficulty(attempts);

  const reset = () => {
    if (window.confirm('Xóa toàn bộ trạng thái, bookmark, ghi chú và lịch sử luyện của riêng video này?')) onReset();
  };

  return (
    <div className="h-full overflow-y-auto p-sm">
      <section className="rounded-[10px] border border-hairline bg-surface p-sm">
        <div className="flex items-center justify-between gap-sm"><h3 className="font-semibold text-on-surface">Độ khó</h3><select value={state.preferences.difficulty} onChange={event => onDifficultyChange(event.target.value)} className="rounded border border-hairline bg-surface-container-low px-xs py-1 text-body-sm"><option value="auto">Auto ({adaptive === 'easy' ? 'Dễ' : adaptive === 'hard' ? 'Khó' : 'Trung bình'})</option><option value="easy">Khóa Dễ</option><option value="medium">Khóa Trung bình</option><option value="hard">Khóa Khó</option></select></div>
        <p className="mt-xs text-[11px] text-on-surface-variant">Auto dùng 10 attempt gần nhất: ≥85 và ít hint → Khó; &lt;60 hoặc nhiều hint → Dễ.</p>
      </section>

      <section className="mt-sm grid grid-cols-2 gap-xs">
        {scores.map(item => <div key={item.skill} className="rounded-[8px] border border-hairline bg-surface p-sm"><p className="text-[11px] text-on-surface-variant">{item.skill}</p><div className="mt-1 flex items-end justify-between"><strong className="text-[22px] text-primary">{item.score}</strong><span className="text-[10px] text-on-surface-variant">{item.attempts} lượt</span></div><div className="mt-xs h-1.5 overflow-hidden rounded-full bg-surface-container-highest"><div className="h-full bg-primary" style={{ width: `${item.score}%` }} /></div></div>)}
      </section>

      <section className="mt-sm rounded-[10px] border border-hairline bg-surface p-sm">
        <h3 className="font-semibold">Tổng quan video</h3>
        <div className="mt-sm grid grid-cols-3 gap-xs text-center"><div><strong>{state.aggregateStats?.totalAttempts || attempts.length}</strong><p className="text-[10px] text-on-surface-variant">attempt</p></div><div><strong>{words.length}</strong><p className="text-[10px] text-on-surface-variant">từ đã lưu</p></div><div><strong>{formatPracticeTime(state.aggregateStats?.practiceSeconds)}</strong><p className="text-[10px] text-on-surface-variant">luyện tập</p></div></div>
        <p className="mt-sm text-[11px] text-on-surface-variant">Đã xem khoảng {formatPracticeTime(state.aggregateStats?.watchSeconds || video.resumePositionSeconds || 0)} · Mastered {masteredLines.length} câu · Weak {weakLines.length} câu.</p>
      </section>

      <section className="mt-sm rounded-[10px] border border-hairline bg-surface p-sm">
        <h3 className="font-semibold">Heatmap từng câu</h3>
        <div className="mt-sm flex flex-wrap gap-1">{(video.transcript || []).map((_, index) => {
          const entry = lineEntries.find(item => item.index === index);
          const tone = entry?.score >= 85 ? 'bg-accent-green' : entry?.score >= 60 ? 'bg-accent-orange' : entry ? 'bg-error' : 'bg-surface-container-highest';
          return <button key={index} type="button" onClick={() => onSeekLine(index)} title={`Câu ${index + 1}${entry ? ` · ${entry.score} điểm` : ' · chưa luyện'}`} aria-label={`Câu ${index + 1}`} className={`h-5 w-5 rounded-[4px] text-[8px] ${tone} ${entry ? 'text-white' : 'text-on-surface-variant'}`}>{index + 1}</button>;
        })}</div>
      </section>

      <section className="mt-sm rounded-[10px] border border-primary/30 bg-primary/5 p-sm">
        <h3 className="font-semibold text-primary">Bài nên luyện tiếp</h3>
        <p className="mt-xs text-body-sm">{weakLines[0] ? `Luyện lại câu ${weakLines[0].index + 1} (${weakLines[0].score} điểm)` : weakestSkill ? `Tăng cường ${weakestSkill.skill} (${weakestSkill.score} điểm)` : 'Bắt đầu bằng Dictation ở câu hiện tại.'}</p>
        {weakLines[0] && <button type="button" onClick={() => onSeekLine(weakLines[0].index)} className="mt-xs text-[11px] font-medium text-primary hover:underline">Đi tới câu yếu nhất</button>}
      </section>

      <section className="mt-sm rounded-[10px] border border-hairline bg-surface p-sm">
        <div className="flex items-center justify-between"><h3 className="font-semibold">AI learning pack</h3><button type="button" onClick={onGenerateLearningPack} disabled={generatingPack} className="text-[11px] font-medium text-primary hover:underline">{generatingPack ? 'Đang tạo…' : learningPack ? 'Tạo lại' : 'Tạo on-demand'}</button></div>
        {learningPack ? <div className="mt-sm space-y-xs text-body-sm"><p>{learningPack.summaryEnglish}</p><p className="italic text-on-surface-variant">{learningPack.summaryVietnamese}</p><p className="text-[11px] text-primary">{learningPack.keyPhrases.length} key phrases · {learningPack.grammarNotes.length} grammar notes · {learningPack.questions.length} câu hỏi</p></div> : <p className="mt-xs text-[11px] text-on-surface-variant">Gemini chưa được gọi. Kết quả sẽ cache theo transcript, model, độ khó và schema.</p>}
      </section>

      <section className="mt-sm rounded-[10px] border border-hairline bg-surface p-sm">
        <h3 className="font-semibold">Lịch sử gần đây</h3><div className="mt-xs divide-y divide-hairline">{attempts.slice(0, 8).map(attempt => <div key={attempt.id} className="flex items-center justify-between py-xs text-[11px]"><span>{attempt.activity} · câu {Number(attempt.lineIndex ?? 0) + 1}</span><strong className={attempt.score >= 70 ? 'text-accent-green' : 'text-error'}>{attempt.score}</strong></div>)}{!attempts.length && <p className="py-sm text-[11px] text-on-surface-variant">Chưa có attempt.</p>}</div>
      </section>

      <section className="mt-sm rounded-[10px] border border-hairline bg-surface p-sm"><h3 className="font-semibold">Xuất dữ liệu học</h3><div className="mt-sm flex flex-wrap gap-xs"><button type="button" onClick={() => downloadLearningFile(`${video.title}-bilingual.txt`, buildTranscriptTxt(video.transcript))} className="learning-tool-button">TXT</button><button type="button" onClick={() => downloadLearningFile(`${video.title}-bilingual.srt`, buildTranscriptSrt(video.transcript), 'application/x-subrip')} className="learning-tool-button">SRT</button><button type="button" onClick={() => downloadLearningFile(`${video.title}-vocabulary.csv`, buildVocabularyCsv(words), 'text/csv;charset=utf-8')} className="learning-tool-button">CSV từ vựng</button><button type="button" onClick={() => window.print()} className="learning-tool-button"><span className="material-symbols-outlined text-[17px]">print</span>Study report</button></div></section>

      <button type="button" onClick={reset} className="mt-sm w-full rounded-[8px] border border-error/40 px-sm py-xs text-body-sm font-medium text-error hover:bg-error/10">Reset riêng video này</button>
    </div>
  );
}
