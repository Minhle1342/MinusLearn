import React, { useEffect, useMemo, useRef, useState } from 'react';
import { evaluateVideoLearningResponse } from '../../services/api';
import {
  calculateTextSimilarity,
  createPronunciationAssessmentSession,
  hasSpeechRecognitionSupport,
} from '../../services/speechAssessment';
import {
  buildDictationChallenge,
  buildTokenDiff,
  getAdaptiveDifficulty,
  scoreLearningAnswer,
  tokenizeLearningText,
} from '../../utils/videoLearning';

const activities = [
  ['dictation', 'Dictation', 'edit_note'],
  ['discrimination', 'Chọn câu', 'hearing'],
  ['builder', 'Xếp câu', 'view_week'],
  ['translation', 'Dịch ngược', 'translate'],
  ['shadowing', 'Shadowing', 'mic'],
  ['comprehension', 'Hiểu nội dung', 'quiz'],
  ['reply', 'Reply', 'forum'],
  ['retell', 'Retell', 'summarize'],
  ['grammar', 'Grammar', 'account_tree'],
];

function DiffView({ diff }) {
  if (!diff?.length) return null;
  const colors = { correct: 'bg-accent-green/15 text-accent-green', missing: 'bg-error/15 text-error line-through', extra: 'bg-accent-orange/15 text-on-surface' };
  return <div className="mt-sm flex flex-wrap gap-1">{diff.map((item, index) => <span key={`${item.type}-${index}`} className={`rounded px-1 py-0.5 text-[12px] ${colors[item.type]}`}>{item.token}</span>)}</div>;
}

function scoreLabel(score) {
  if (score >= 85) return 'Rất tốt';
  if (score >= 65) return 'Khá';
  return 'Cần luyện thêm';
}

function localListeningOptions(transcript, lineIndex) {
  const candidates = [lineIndex, lineIndex + 1, lineIndex - 1, lineIndex + 2]
    .filter((index, position, values) => index >= 0 && index < transcript.length && values.indexOf(index) === position)
    .map(index => ({ text: transcript[index].text, correct: index === lineIndex }));
  return candidates.sort((a, b) => a.text.length - b.text.length);
}

function semanticChunks(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const size = words.length > 12 ? 3 : words.length > 6 ? 2 : 1;
  const chunks = [];
  for (let index = 0; index < words.length; index += size) chunks.push(words.slice(index, index + size).join(' '));
  return chunks;
}

export function VideoPracticePanel({
  video,
  activeLineIndex,
  requestedActivity,
  requestedLineIndex,
  state,
  attempts,
  settings,
  learningPack,
  onGenerateLearningPack,
  generatingPack,
  onSeekLine,
  onPlayLine,
  onPause,
  onAttempt,
}) {
  const [activity, setActivity] = useState(requestedActivity || 'dictation');
  const [lineIndex, setLineIndex] = useState(Math.max(0, requestedLineIndex ?? activeLineIndex));
  const [scope, setScope] = useState('current');
  const [queue, setQueue] = useState([]);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [hints, setHints] = useState(0);
  const [replays, setReplays] = useState(0);
  const [builderSelection, setBuilderSelection] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [recordingUrl, setRecordingUrl] = useState(null);
  const [recordingError, setRecordingError] = useState('');
  const [aiFeedback, setAiFeedback] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const speechSessionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);

  const difficulty = state.preferences.difficulty === 'auto'
    ? getAdaptiveDifficulty(attempts)
    : state.preferences.difficulty;
  const line = video.transcript?.[lineIndex] || video.transcript?.[0] || null;
  const dictation = useMemo(() => buildDictationChallenge(line?.text, difficulty), [difficulty, line?.text]);
  const listeningOptions = useMemo(() => localListeningOptions(video.transcript || [], lineIndex), [lineIndex, video.transcript]);
  const builderChunks = useMemo(() => semanticChunks(line?.text), [line?.text]);
  const shuffledBuilder = useMemo(() => builderChunks.map((chunk, index) => ({ chunk, index })).sort((a, b) => ((b.index * 5) % 7) - ((a.index * 5) % 7)), [builderChunks]);
  const currentQuestion = learningPack?.questions?.[questionIndex] || null;
  const speechSupported = hasSpeechRecognitionSupport();
  const recorderSupported = typeof window !== 'undefined' && navigator.mediaDevices?.getUserMedia && window.MediaRecorder;

  useEffect(() => {
    if (requestedActivity) setActivity(requestedActivity);
    if (Number.isInteger(requestedLineIndex) && requestedLineIndex >= 0) setLineIndex(requestedLineIndex);
  }, [requestedActivity, requestedLineIndex]);

  useEffect(() => {
    setAnswer(''); setResult(null); setHints(0); setReplays(0); setBuilderSelection([]); setAiFeedback(null); setSelectedOption(null);
    if (activity === 'reply') onPause?.();
  }, [activity, lineIndex]);

  useEffect(() => () => {
    speechSessionRef.current?.close();
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  }, [recordingUrl]);

  const pickScope = () => {
    const all = (video.transcript || []).map((_, index) => index);
    const weak = all.filter(index => {
      const stats = state.lineStats?.[index];
      return stats?.attempts && stats.totalScore / stats.attempts < 70;
    });
    let indexes = [Math.max(0, activeLineIndex)];
    if (scope === 'bookmarked') indexes = state.bookmarks;
    if (scope === 'weak') indexes = weak;
    if (scope === '5') indexes = all.slice(Math.max(0, lineIndex), Math.max(0, lineIndex) + 5);
    if (scope === '10') indexes = all.slice(Math.max(0, lineIndex), Math.max(0, lineIndex) + 10);
    if (scope === 'all') indexes = all;
    const safe = indexes.length ? indexes : [Math.max(0, activeLineIndex)];
    setQueue(safe);
    setLineIndex(safe[0]);
  };

  const nextInQueue = () => {
    const position = queue.indexOf(lineIndex);
    if (position >= 0 && position < queue.length - 1) setLineIndex(queue[position + 1]);
  };

  const replay = (rate = difficulty === 'hard' ? 1 : 0.85) => {
    setReplays(value => value + 1);
    onPlayLine(lineIndex, { rate });
  };

  const submitTextActivity = async targetActivity => {
    const scored = scoreLearningAnswer(line?.text, answer, { hints, replays });
    setResult(scored);
    await onAttempt({ activity: targetActivity, lineIndex, difficulty, score: scored.score, hints, replays });
  };

  const chooseListening = async option => {
    const score = option.correct ? Math.max(0, 100 - hints * 3 - Math.max(0, replays - 1) * 2) : 0;
    setResult({ score, correct: option.correct });
    await onAttempt({ activity: 'listening', lineIndex, difficulty, score, hints, replays });
  };

  const submitBuilder = async () => {
    const built = builderSelection.map(index => builderChunks[index]).join(' ');
    const scored = scoreLearningAnswer(line?.text, built, { hints });
    setResult({ ...scored, built });
    await onAttempt({ activity: 'sentence-builder', lineIndex, difficulty, score: scored.score, hints, replays });
    onPlayLine(lineIndex);
  };

  const startShadowing = async () => {
    setRecordingError(''); setRecognizedText(''); setResult(null); setAiFeedback(null);
    if (!speechSupported) {
      setRecordingError('Trình duyệt không hỗ trợ SpeechRecognition. Bạn vẫn có thể nghe và lặp thủ công.');
      return;
    }
    try {
      if (recorderSupported) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = event => { if (event.data?.size) audioChunksRef.current.push(event.data); };
        recorder.start();
        mediaRecorderRef.current = recorder;
      }
      const session = await createPronunciationAssessmentSession({ referenceText: line.text, onTranscript: setRecognizedText, onError: setRecordingError });
      speechSessionRef.current = session;
      await session.start();
      recordingStartedAtRef.current = Date.now();
      setIsRecording(true);
    } catch (error) {
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      setRecordingError(error.message);
    }
  };

  const stopShadowing = async () => {
    const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
    const assessment = await speechSessionRef.current?.stop();
    speechSessionRef.current?.close();
    speechSessionRef.current = null;
    let nextUrl = null;
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === 'recording') {
      nextUrl = await new Promise(resolve => {
        recorder.onstop = () => resolve(audioChunksRef.current.length ? URL.createObjectURL(new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })) : null);
        recorder.stop();
      });
    }
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingUrl(nextUrl);
    setIsRecording(false);
    const transcript = assessment?.transcript || recognizedText;
    const diff = buildTokenDiff(line.text, transcript);
    const similarity = assessment?.similarityScore ?? calculateTextSimilarity(line.text, transcript);
    const referenceWords = tokenizeLearningText(line.text).length;
    const spokenWords = tokenizeLearningText(transcript).length;
    const completeness = Math.min(100, Math.round((spokenWords / Math.max(1, referenceWords)) * 100));
    const wordsPerMinute = Math.round((spokenWords / durationSeconds) * 60);
    const nextResult = { score: Math.round(similarity * 0.75 + completeness * 0.25), similarity, completeness, wordsPerMinute, diff, transcript };
    setRecognizedText(transcript);
    setResult(nextResult);
    await onAttempt({ activity: 'shadowing', lineIndex, difficulty, score: nextResult.score, hints, replays, recognizedTranscript: transcript, durationSeconds });
  };

  const askAiFeedback = async (targetActivity, response) => {
    setAiLoading(true);
    try {
      const feedback = await evaluateVideoLearningResponse({ activity: targetActivity, prompt: line?.text_vi || line?.text, response, reference: line?.text }, settings.apiKey, settings.model);
      setAiFeedback(feedback);
      await onAttempt({ activity: targetActivity, lineIndex, difficulty, score: Number(feedback.score || 0), hints, replays });
    } catch (error) {
      alert(`Không thể lấy phản hồi AI: ${error.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const answerQuestion = async optionIndex => {
    setSelectedOption(optionIndex);
    const score = optionIndex === currentQuestion.answerIndex ? 100 : 0;
    await onAttempt({ activity: 'comprehension', lineIndex: currentQuestion.lineIndex, difficulty, score, hints: 0, replays: 0 });
  };

  const captureSpokenAnswer = () => {
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setRecordingError('Trình duyệt không hỗ trợ nhập câu bằng giọng nói.');
      return;
    }
    const recognition = new RecognitionCtor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => setAnswer(event.results?.[0]?.[0]?.transcript || '');
    recognition.onerror = event => setRecordingError(event.error || 'speech-recognition-error');
    recognition.start();
  };

  if (!line) return <div className="p-lg text-center text-on-surface-variant">Video chưa có transcript để luyện tập.</div>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-hairline p-sm">
        <div className="flex gap-xs overflow-x-auto pb-xs" role="tablist" aria-label="Công cụ luyện tập">
          {activities.map(([value, label, icon]) => <button key={value} type="button" role="tab" aria-selected={activity === value} onClick={() => setActivity(value)} className={`flex shrink-0 items-center gap-1 rounded-full border px-sm py-1 text-[11px] ${activity === value ? 'border-primary bg-primary text-on-primary' : 'border-hairline bg-surface text-on-surface-variant'}`}><span className="material-symbols-outlined text-[15px]">{icon}</span>{label}</button>)}
        </div>
        <div className="mt-xs flex items-center gap-xs text-[11px] text-on-surface-variant">
          <select value={scope} onChange={event => setScope(event.target.value)} className="min-w-0 flex-1 rounded border border-hairline bg-surface px-xs py-1" aria-label="Phạm vi luyện tập">
            <option value="current">Câu hiện tại</option><option value="bookmarked">Câu đánh dấu</option><option value="weak">Câu yếu</option><option value="5">5 câu tiếp</option><option value="10">10 câu tiếp</option><option value="all">Tất cả</option>
          </select>
          <button type="button" onClick={pickScope} className="rounded bg-surface-container-low px-sm py-1 font-medium text-primary">Áp dụng</button>
          <span className="whitespace-nowrap rounded bg-accent-orange/15 px-xs py-1 font-medium">{difficulty === 'easy' ? 'Dễ' : difficulty === 'hard' ? 'Khó' : 'Trung bình'}{state.preferences.difficulty === 'auto' ? ' · Auto' : ''}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-md">
        <div className="mb-md flex items-center justify-between gap-sm">
          <button type="button" onClick={() => onSeekLine(lineIndex)} className="text-left text-[11px] font-semibold text-primary">Câu {lineIndex + 1} · {Math.floor(Number(line.start || 0) / 60)}:{String(Math.floor(Number(line.start || 0) % 60)).padStart(2, '0')}</button>
          {queue.length > 1 && <button type="button" onClick={nextInQueue} className="learning-tool-button">Câu tiếp</button>}
        </div>
        {recordingError && activity !== 'shadowing' && <p className="mb-sm rounded bg-accent-orange/10 p-sm text-body-sm text-on-surface">{recordingError}</p>}

        {activity === 'dictation' && <>
          <h3 className="font-semibold text-on-surface">Nghe và chép chính tả</h3>
          <p className="mt-sm rounded-[8px] bg-surface-container-low p-sm font-mono text-body-sm leading-relaxed">{dictation.prompt}</p>
          {dictation.wordBank.length > 0 && <div className="mt-xs flex flex-wrap gap-1">{dictation.wordBank.map(word => <button key={word} type="button" onClick={() => setAnswer(value => `${value} ${word}`.trim())} className="rounded border border-hairline bg-surface px-xs py-1 text-[11px]">{word}</button>)}</div>}
          {hints > 0 && <p className="mt-xs text-[11px] text-accent-orange">Gợi ý: {tokenizeLearningText(line.text).slice(0, hints).join(' ')}</p>}
          <textarea value={answer} onChange={event => setAnswer(event.target.value)} className="mt-sm min-h-24 w-full rounded-[8px] border border-hairline bg-surface p-sm outline-none focus:border-primary" placeholder="Nhập câu bạn nghe được…" autoFocus />
          <div className="mt-sm flex flex-wrap gap-xs"><button type="button" onClick={() => replay()} className="learning-tool-button"><span className="material-symbols-outlined text-[18px]">replay</span>Nghe lại</button><button type="button" onClick={() => setHints(value => value + 1)} className="learning-tool-button">Reveal 1 từ</button><button type="button" onClick={() => submitTextActivity('dictation')} className="learning-primary-button">Chấm điểm</button></div>
          {result && <div className="learning-result"><strong>{result.score}/100 · {scoreLabel(result.score)}</strong><DiffView diff={result.diff} /></div>}
        </>}

        {activity === 'discrimination' && <>
          <h3 className="font-semibold">Nghe và chọn transcript đúng</h3><button type="button" onClick={() => replay(1)} className="mt-sm learning-primary-button"><span className="material-symbols-outlined text-[18px]">play_arrow</span>Phát clip</button>
          <div className="mt-md flex flex-col gap-xs">{listeningOptions.map((option, index) => <button key={index} type="button" disabled={Boolean(result)} onClick={() => chooseListening(option)} className={`rounded-[8px] border p-sm text-left text-body-sm ${result && option.correct ? 'border-accent-green bg-accent-green/10' : 'border-hairline bg-surface hover:border-primary'}`}>{option.text}</button>)}</div>
          {result && <div className="learning-result"><strong>{result.correct ? 'Chính xác' : 'Chưa đúng'} · {result.score}/100</strong></div>}
          <button type="button" onClick={onGenerateLearningPack} disabled={generatingPack} className="mt-sm text-[11px] text-primary hover:underline">{generatingPack ? 'Đang tạo…' : 'Tạo bộ nâng cao bằng Gemini (on-demand)'}</button>
        </>}

        {activity === 'builder' && <>
          <h3 className="font-semibold">Sắp xếp semantic chunks</h3><p className="mt-xs text-body-sm text-on-surface-variant">Chọn từng mảnh theo đúng thứ tự.</p>
          <div className="mt-sm min-h-16 rounded-[8px] border border-dashed border-primary/40 bg-primary/5 p-sm">{builderSelection.map((index, order) => <button key={`${index}-${order}`} type="button" onClick={() => setBuilderSelection(values => values.filter((_, itemIndex) => itemIndex !== order))} className="m-1 rounded bg-primary px-xs py-1 text-[12px] text-on-primary">{builderChunks[index]}</button>)}</div>
          <div className="mt-sm flex flex-wrap gap-xs">{shuffledBuilder.map(item => <button key={item.index} type="button" disabled={builderSelection.includes(item.index)} onClick={() => setBuilderSelection(values => [...values, item.index])} className="rounded border border-hairline bg-surface px-xs py-1 text-[12px] disabled:opacity-30">{item.chunk}</button>)}</div>
          <button type="button" onClick={submitBuilder} className="mt-sm learning-primary-button">Kiểm tra thứ tự</button>
          {result && <div className="learning-result"><strong>{result.score}/100</strong><DiffView diff={result.diff} /></div>}
        </>}

        {activity === 'translation' && <>
          <h3 className="font-semibold">Nhìn tiếng Việt, nhớ lại tiếng Anh</h3><p className="mt-sm rounded-[8px] bg-accent-sky/10 p-sm text-body-sm">{line.text_vi || 'Câu này chưa có bản dịch. Hãy dịch transcript trước.'}</p>
          <textarea value={answer} onChange={event => setAnswer(event.target.value)} className="mt-sm min-h-24 w-full rounded-[8px] border border-hairline bg-surface p-sm outline-none focus:border-primary" placeholder="Nhập câu tiếng Anh…" />
          <div className="mt-sm flex flex-wrap gap-xs"><button type="button" onClick={() => submitTextActivity('translation-recall')} className="learning-primary-button">Chấm điểm</button><button type="button" onClick={captureSpokenAnswer} className="learning-tool-button"><span className="material-symbols-outlined text-[17px]">mic</span>Nói câu</button><button type="button" onClick={() => onSeekLine(lineIndex)} className="learning-tool-button">Về cảnh gốc</button></div>
          {result && <div className="learning-result"><strong>{result.score}/100</strong><DiffView diff={result.diff} /></div>}
        </>}

        {activity === 'shadowing' && <>
          <h3 className="font-semibold">Shadowing / Say It</h3><p className="mt-xs text-body-sm text-on-surface-variant">Điểm là <strong>độ khớp câu qua nhận dạng giọng nói</strong>, không phải điểm phát âm phoneme.</p>
          <div className="mt-sm rounded-[8px] border border-hairline bg-surface p-sm text-body-sm">{line.text}</div>
          <div className="mt-sm flex flex-wrap gap-xs"><button type="button" onClick={() => { replay(1); }} className="learning-tool-button">Nghe mẫu</button>{isRecording ? <button type="button" onClick={stopShadowing} className="learning-primary-button bg-error"><span className="material-symbols-outlined text-[18px]">stop</span>Dừng</button> : <button type="button" onClick={startShadowing} className="learning-primary-button"><span className="material-symbols-outlined text-[18px]">mic</span>Ghi âm</button>}</div>
          {isRecording && <p className="mt-sm animate-pulse text-body-sm font-medium text-error">● Đang nghe: {recognizedText || 'Hãy nói câu trên…'}</p>}
          {recordingError && <p className="mt-sm rounded bg-accent-orange/10 p-sm text-body-sm text-on-surface">{recordingError}</p>}
          {!speechSupported && <p className="mt-sm text-body-sm">Fallback thủ công: nghe mẫu, lặp lại, rồi tự đối chiếu với transcript. Các công cụ khác vẫn hoạt động bình thường.</p>}
          {recordingUrl && <audio controls src={recordingUrl} className="mt-sm w-full" aria-label="Nghe lại bản ghi của bạn" />}
          {result && <div className="learning-result"><strong>{result.score}/100 · Khớp {result.similarity}% · Đủ câu {result.completeness}%</strong><p className="mt-xs text-[11px]">Tốc độ ước tính: {result.wordsPerMinute} từ/phút</p><DiffView diff={result.diff} /><button type="button" onClick={() => askAiFeedback('shadowing-feedback', result.transcript)} disabled={aiLoading} className="mt-sm text-[11px] font-medium text-primary hover:underline">{aiLoading ? 'Đang phân tích…' : 'Nhờ Gemini góp ý lỗi khả dĩ (on-demand)'}</button></div>}
          {aiFeedback && <div className="learning-result"><strong>Phản hồi AI</strong><p className="mt-xs text-body-sm">{aiFeedback.feedbackVietnamese}</p></div>}
        </>}

        {activity === 'comprehension' && <>
          <h3 className="font-semibold">Comprehension quiz</h3>
          {!learningPack ? <button type="button" onClick={onGenerateLearningPack} disabled={generatingPack} className="mt-sm learning-primary-button">{generatingPack ? 'Đang tạo gói học…' : 'Tạo câu hỏi bằng Gemini'}</button> : currentQuestion && <>
            <p className="mt-sm text-body-sm font-medium">{currentQuestion.question}</p><div className="mt-sm flex flex-col gap-xs">{currentQuestion.options.map((option, index) => <button key={index} type="button" onClick={() => answerQuestion(index)} className={`rounded-[8px] border p-sm text-left text-body-sm ${selectedOption !== null && index === currentQuestion.answerIndex ? 'border-accent-green bg-accent-green/10' : selectedOption === index ? 'border-error bg-error/10' : 'border-hairline bg-surface'}`}>{option}</button>)}</div>
            {selectedOption !== null && <div className="learning-result"><p>{currentQuestion.explanation}</p><button type="button" onClick={() => onSeekLine(currentQuestion.lineIndex)} className="mt-xs text-primary hover:underline">Xem bằng chứng ở câu {currentQuestion.lineIndex + 1}</button></div>}
            <div className="mt-sm flex justify-between"><button type="button" onClick={() => setQuestionIndex(Math.max(0, questionIndex - 1))} className="learning-tool-button">Trước</button><span className="text-[11px] text-on-surface-variant">{questionIndex + 1}/{learningPack.questions.length}</span><button type="button" onClick={() => { setQuestionIndex(Math.min(learningPack.questions.length - 1, questionIndex + 1)); setSelectedOption(null); }} className="learning-tool-button">Sau</button></div>
          </>}
        </>}

        {activity === 'reply' && <>
          <h3 className="font-semibold">Reply to the scene</h3><p className="mt-sm text-body-sm">{learningPack?.replyPrompt?.prompt || 'Dừng trước câu tiếp theo và nói/viết một phản hồi phù hợp với cảnh.'}</p><textarea value={answer} onChange={event => setAnswer(event.target.value)} className="mt-sm min-h-24 w-full rounded border border-hairline bg-surface p-sm" placeholder="Nhập phản hồi (hoặc dùng transcript từ Shadowing)…" /><div className="mt-sm flex flex-wrap gap-xs"><button type="button" onClick={() => askAiFeedback('reply-to-scene', answer)} disabled={aiLoading || !answer.trim()} className="learning-primary-button">{aiLoading ? 'Đang chấm…' : 'Gemini chấm phản hồi'}</button><button type="button" onClick={captureSpokenAnswer} className="learning-tool-button"><span className="material-symbols-outlined text-[17px]">mic</span>Nói phản hồi</button></div>{aiFeedback && <div className="learning-result"><strong>{aiFeedback.score}/100</strong><p>{aiFeedback.feedbackVietnamese}</p><button type="button" onClick={() => onSeekLine(Math.min(video.transcript.length - 1, lineIndex + 1))} className="mt-xs text-primary hover:underline">Phát câu thật tiếp theo</button></div>}
        </>}

        {activity === 'retell' && <>
          <h3 className="font-semibold">Retell / Summarize</h3><p className="mt-sm text-body-sm">{learningPack?.retellPrompt || 'Tóm tắt đoạn vừa xem bằng tiếng Anh, tập trung vào ý chính và trình tự.'}</p><textarea value={answer} onChange={event => setAnswer(event.target.value)} className="mt-sm min-h-32 w-full rounded border border-hairline bg-surface p-sm" placeholder="Viết hoặc dán transcript phần kể lại…" /><div className="mt-sm flex flex-wrap gap-xs"><button type="button" onClick={() => askAiFeedback('retell', answer)} disabled={aiLoading || !answer.trim()} className="learning-primary-button">{aiLoading ? 'Đang chấm…' : 'Chấm coverage, coherence, grammar, vocabulary'}</button><button type="button" onClick={captureSpokenAnswer} className="learning-tool-button"><span className="material-symbols-outlined text-[17px]">mic</span>Kể bằng giọng nói</button></div>{aiFeedback && <div className="learning-result"><strong>{aiFeedback.score}/100</strong><p className="mt-xs text-[11px]">Coverage {aiFeedback.coverage} · Coherence {aiFeedback.coherence} · Grammar {aiFeedback.grammar} · Vocabulary {aiFeedback.vocabulary}</p><p className="mt-xs text-body-sm">{aiFeedback.feedbackVietnamese}</p></div>}
        </>}

        {activity === 'grammar' && <>
          <h3 className="font-semibold">Grammar Coach</h3><p className="mt-xs text-body-sm text-on-surface-variant">Chỉ phân tích các câu bạn chủ động mở trong gói học AI.</p>{!learningPack ? <button type="button" onClick={onGenerateLearningPack} disabled={generatingPack} className="mt-sm learning-primary-button">Tạo phân tích on-demand</button> : <div className="mt-sm flex flex-col gap-sm">{learningPack.grammarNotes.filter(note => note.lineIndex === lineIndex).map(note => <article key={note.title} className="rounded border border-hairline p-sm"><h4 className="font-medium text-primary">{note.title}</h4><p className="mt-xs text-body-sm">{note.explanation}</p><div className="mt-xs flex flex-wrap gap-1">{note.parts?.map((part, index) => <span key={index} className={`rounded px-1 py-0.5 text-[11px] ${part.pos === 'verb' ? 'bg-accent-pink/20' : part.pos === 'noun' ? 'bg-accent-sky/20' : part.pos === 'adjective' ? 'bg-accent-orange/20' : 'bg-surface-container-low'}`} title={part.pos}>{part.text}</span>)}</div></article>)}{!learningPack.grammarNotes.some(note => note.lineIndex === lineIndex) && <p className="text-body-sm text-on-surface-variant">Chưa có ghi chú cho câu này. Chọn câu có note trong Transcript.</p>}</div>}
        </>}
      </div>
    </div>
  );
}
