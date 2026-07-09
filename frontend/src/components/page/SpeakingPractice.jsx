import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Mic,
  RotateCcw,
  Settings,
  Square,
  Volume2,
  XCircle,
} from 'lucide-react';
import {
  createPronunciationAssessmentSession,
  FALLBACK_SIMILARITY_THRESHOLD,
  hasSpeechRecognitionSupport,
} from '../../services/speechAssessment';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { speakEnglishText } from '../../utils/speech';

function shuffleWords(words) {
  return [...words].sort(() => 0.5 - Math.random());
}

function formatScore(score) {
  return typeof score === 'number' ? Math.round(score) : '-';
}

export function SpeakingPractice({ words, activeTopicId, topics, settings, onOpenSettings }) {
  const [phase, setPhase] = useState('setup');
  const [wordCount, setWordCount] = useState(10);
  const [practiceQueue, setPracticeQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [currentResult, setCurrentResult] = useState(null);
  const [sessionResults, setSessionResults] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const sessionRef = useRef(null);
  const [speakingMistakes, setSpeakingMistakes] = useLocalStorage('minuslearn_speaking_mistakes', {});

  const currentTopic = topics.find(topic => topic.id === activeTopicId);
  const topicWords = useMemo(
    () => words.filter(word => word.topicId === activeTopicId),
    [words, activeTopicId]
  );
  const speakableWords = useMemo(
    () => topicWords.filter(word => word.example?.trim()),
    [topicWords]
  );
  const hasSpeechRecognition = hasSpeechRecognitionSupport();
  const currentWord = practiceQueue[currentIndex];

  const topicMistakes = useMemo(
    () => speakableWords.filter(word => speakingMistakes[word.id]),
    [speakableWords, speakingMistakes]
  );

  useEffect(() => {
    setWordCount(Math.max(1, speakableWords.length || 1));
    setPhase('setup');
    setPracticeQueue([]);
    setCurrentIndex(0);
    setLiveTranscript('');
    setCurrentResult(null);
    setSessionResults([]);
    setErrorMessage('');
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
  }, [activeTopicId, speakableWords.length]);

  useEffect(() => () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
  }, []);

  const handleStartPractice = () => {
    if (!hasSpeechRecognition || speakableWords.length === 0) return;

    const count = Math.min(Math.max(1, wordCount), speakableWords.length);
    setPracticeQueue(shuffleWords(speakableWords).slice(0, count));
    setCurrentIndex(0);
    setLiveTranscript('');
    setCurrentResult(null);
    setSessionResults([]);
    setErrorMessage('');
    setPhase('playing');
  };

  const handleStartRecording = async () => {
    if (!currentWord || isRecording) return;

    setLiveTranscript('');
    setCurrentResult(null);
    setErrorMessage('');

    try {
      const session = await createPronunciationAssessmentSession({
        referenceText: currentWord.example,
        onTranscript: setLiveTranscript,
        onError: setErrorMessage,
      });

      sessionRef.current = session;
      await session.start();
      setIsRecording(true);
    } catch (error) {
      setErrorMessage(error.message || 'Không thể bắt đầu ghi âm.');
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    if (!sessionRef.current || !isRecording) return;

    try {
      const result = await sessionRef.current.stop();
      setCurrentResult(result);
      setLiveTranscript(result.transcript);
      setSessionResults(prev => [...prev, { word: currentWord, ...result }]);
    } catch (error) {
      setErrorMessage(error.message || 'Không thể dừng ghi âm.');
    } finally {
      sessionRef.current = null;
      setIsRecording(false);
    }
  };

  const handleRetry = () => {
    setSessionResults(prev => {
      if (!prev.length) return prev;
      const lastEntry = prev[prev.length - 1];
      return lastEntry.word.id === currentWord.id ? prev.slice(0, -1) : prev;
    });
    setLiveTranscript('');
    setCurrentResult(null);
    setErrorMessage('');
  };

  const handleNext = () => {
    const currentEntry = sessionResults[sessionResults.length - 1];
    if (currentEntry) {
      setSpeakingMistakes(prev => {
        const next = { ...prev };
        if (currentEntry.isPass) {
          delete next[currentEntry.word.id];
        } else {
          next[currentEntry.word.id] = true;
        }
        return next;
      });
    }

    if (currentIndex + 1 < practiceQueue.length) {
      setCurrentIndex(currentIndex + 1);
      setLiveTranscript('');
      setCurrentResult(null);
      setErrorMessage('');
      return;
    }

    setPhase('results');
  };

  if (!activeTopicId || topicWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full p-xl text-center">
        <div className="w-24 h-24 bg-surface rounded-full flex items-center justify-center shadow-sm mb-lg border border-hairline">
          <Mic size={40} className="text-on-surface-variant" />
        </div>
        <h2 className="font-heading-2 text-heading-2 text-ink mb-sm">Chưa có từ vựng</h2>
        <p className="font-body-md text-body-md text-ink-muted max-w-md">
          Chủ đề này chưa có từ vựng nào. Hãy thêm từ vựng trước khi bắt đầu luyện nói.
        </p>
      </div>
    );
  }

  if (speakableWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full p-xl text-center">
        <div className="w-24 h-24 bg-surface rounded-full flex items-center justify-center shadow-sm mb-lg border border-hairline">
          <Volume2 size={40} className="text-on-surface-variant" />
        </div>
        <h2 className="font-heading-2 text-heading-2 text-ink mb-sm">Chưa có câu ví dụ</h2>
        <p className="font-body-md text-body-md text-ink-muted max-w-md">
          Trang Luyện nói dùng câu ví dụ của từng từ vựng. Hãy thêm câu ví dụ trong form từ vựng trước nhé.
        </p>
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div className="min-h-full flex items-center justify-center p-xl">
        <div className="bg-surface border border-hairline rounded-[16px] p-[40px] shadow-sm max-w-lg w-full flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-accent-pink/10 rounded-full flex items-center justify-center mb-xl shadow-inner border border-accent-pink/20">
            <Mic size={48} className="text-accent-pink" />
          </div>

          <h2 className="font-display-2 text-display-2 text-ink mb-sm tracking-tight">Luyện nói</h2>
          <p className="font-body-md text-body-md text-ink-muted mb-xxl">
            Chủ đề <span className="font-bold text-ink px-1">{currentTopic?.name}</span> hiện có {speakableWords.length} câu ví dụ có thể luyện nói.
          </p>

          <div className="w-full text-left mb-lg bg-canvas-soft p-lg rounded-[12px] border border-hairline">
            <label className="block font-eyebrow text-eyebrow text-primary uppercase mb-sm tracking-wide">
              Số câu muốn luyện
            </label>
            <input
              type="number"
              min="1"
              max={speakableWords.length}
              value={wordCount}
              onChange={event => setWordCount(parseInt(event.target.value, 10) || 1)}
              className="w-full bg-surface border border-hairline rounded-[8px] p-sm font-title text-title text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
            />
          </div>

          {!hasSpeechRecognition && (
            <div className="w-full bg-error-container text-on-error-container border border-error/20 rounded-[12px] p-md mb-lg text-left">
              <p className="font-body-sm text-body-sm">
                Trình duyệt hiện tại chưa hỗ trợ Speech Recognition. Hãy mở app bằng Chrome hoặc Edge và cấp quyền micro để luyện nói.
              </p>
              <button
                type="button"
                onClick={onOpenSettings}
                className="mt-sm inline-flex items-center gap-xs px-md py-xs bg-surface rounded-full text-primary font-button text-button border border-hairline hover:bg-surface-container-low transition-colors"
              >
                <Settings size={16} />
                Mở Settings
              </button>
            </div>
          )}

          <div className="flex gap-sm w-full">
            <button
              onClick={handleStartPractice}
              disabled={!hasSpeechRecognition}
              className="flex-1 bg-primary text-on-primary font-button text-button py-md rounded-full shadow-md hover:bg-primary-active hover:shadow-lg hover:-translate-y-0.5 transition-all active:translate-y-0 active:shadow-sm disabled:opacity-50 disabled:pointer-events-none"
            >
              Bắt đầu
            </button>
            {topicMistakes.length > 0 && (
              <button
                onClick={() => {
                  if (!hasSpeechRecognition || topicMistakes.length === 0) return;
                  setPracticeQueue(shuffleWords(topicMistakes));
                  setCurrentIndex(0);
                  setLiveTranscript('');
                  setCurrentResult(null);
                  setSessionResults([]);
                  setErrorMessage('');
                  setPhase('playing');
                }}
                disabled={!hasSpeechRecognition}
                className="flex-1 bg-error-container text-on-error-container border border-error/20 font-button text-button py-md rounded-full shadow-sm hover:bg-error/20 hover:-translate-y-0.5 transition-all active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none"
              >
                Ôn lại {topicMistakes.length} câu sai
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'playing' && currentWord) {
    const progress = ((currentIndex + 1) / practiceQueue.length) * 100;

    return (
      <div className="min-h-full flex flex-col items-center p-lg md:p-xl">
        <div className="w-full max-w-3xl mb-lg">
          <div className="flex justify-between font-eyebrow text-eyebrow text-ink-muted uppercase mb-xs tracking-wide">
            <span>Tiến độ</span>
            <span>{currentIndex + 1} / {practiceQueue.length}</span>
          </div>
          <div className="h-3 w-full bg-hairline rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="w-full max-w-3xl bg-surface border border-hairline rounded-[16px] p-lg md:p-xxl shadow-sm flex flex-col items-center">
          <div className="w-full text-center mb-xl">
            <div className="inline-flex items-center gap-xs px-md py-xs rounded-full bg-primary/10 text-primary font-button text-button mb-md">
              Câu ví dụ
            </div>
            <h2 className="font-heading-2 text-heading-2 text-ink mb-xs">{currentWord.word}</h2>
            {currentWord.phonetic && (
              <p className="font-mono text-body-md text-on-surface-variant mb-md">{currentWord.phonetic}</p>
            )}
            <p className="font-heading-2 text-heading-2 text-ink leading-relaxed bg-canvas-soft border border-hairline rounded-[12px] p-lg">
              {currentWord.example}
              <button
                onClick={() => speakEnglishText(currentWord.example, settings?.voice)}
                className="inline-flex items-center justify-center ml-sm align-middle p-1 rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                title="Nghe câu ví dụ"
              >
                <Volume2 size={28} />
              </button>
            </p>
          </div>

          <button
            type="button"
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            disabled={Boolean(currentResult)}
            className={`w-32 h-32 rounded-full flex items-center justify-center mb-lg shadow-md transition-all active:scale-95 border ${isRecording
                ? 'bg-error text-on-error border-error animate-pulse'
                : 'bg-primary text-on-primary border-primary hover:bg-primary-active'
              } disabled:opacity-50 disabled:pointer-events-none`}
            title={isRecording ? 'Dừng' : 'Ghi âm'}
          >
            {isRecording ? <Square size={48} fill="currentColor" /> : <Mic size={56} />}
          </button>

          <p className="font-button text-button text-on-surface-variant mb-xl">
            {isRecording ? 'Đang ghi âm...' : currentResult ? 'Đã chấm xong' : 'Bấm micro và đọc câu ví dụ'}
          </p>

          {errorMessage && (
            <div className="w-full bg-error-container text-on-error-container border border-error/20 rounded-[12px] p-md mb-lg font-body-sm text-body-sm">
              {errorMessage}
            </div>
          )}

          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-md mb-xl">
            <div className="bg-canvas-soft border border-hairline rounded-[12px] p-md">
              <div className="font-eyebrow text-eyebrow uppercase text-ink-muted mb-xs">Bạn đã đọc</div>
              <p className="font-body-md text-body-md text-ink min-h-[72px]">
                {liveTranscript || 'Transcript sẽ xuất hiện sau khi trình duyệt nhận dạng giọng nói.'}
              </p>
            </div>
            <div className="bg-canvas-soft border border-hairline rounded-[12px] p-md">
              <div className="font-eyebrow text-eyebrow uppercase text-ink-muted mb-xs">Kết quả</div>
              {currentResult ? (
                <div className="flex flex-col gap-xs">
                  <div className={`font-heading-3 text-heading-3 ${currentResult.isPass ? 'text-accent-green' : 'text-accent-orange'}`}>
                    {currentResult.isPass ? 'Đạt' : 'Cần luyện lại'}
                  </div>
                  <p className="font-body-sm text-body-sm text-ink-muted">
                    Similarity: {formatScore(currentResult.similarityScore)}%
                  </p>
                  <p className="font-body-sm text-body-sm text-ink-muted">
                    Accuracy {formatScore(currentResult.accuracyScore)} · Web Speech transcript matching
                  </p>
                </div>
              ) : (
                <p className="font-body-md text-body-md text-ink-muted min-h-[72px]">
                  Dừng ghi âm để xem điểm. Mặc định đạt khi độ khớp câu đọc từ {FALLBACK_SIMILARITY_THRESHOLD}% trở lên.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-sm w-full">
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRecording || !currentResult}
              className="flex-1 bg-surface-container-high text-on-surface rounded-full py-md px-lg font-button text-button hover:bg-surface-container-highest transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              Đọc lại
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={isRecording || !currentResult}
              className="flex-1 bg-primary text-on-primary rounded-full py-md px-lg font-button text-button hover:bg-primary-active transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {currentIndex + 1 < practiceQueue.length ? 'Câu tiếp theo' : 'Xem kết quả'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const passedCount = sessionResults.filter(result => result.isPass).length;
  const averageSimilarity = sessionResults.length
    ? Math.round(sessionResults.reduce((sum, result) => sum + (result.similarityScore || 0), 0) / sessionResults.length)
    : 0;

  return (
    <div className="min-h-full flex items-center justify-center p-lg md:p-xl">
      <div className="w-full max-w-4xl bg-surface border border-hairline rounded-[16px] p-lg md:p-xxl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-lg mb-xl">
          <div>
            <h2 className="font-display-2 text-display-2 text-ink mb-xs">Kết quả luyện nói</h2>
            <p className="font-body-md text-body-md text-ink-muted">
              Bạn đạt {passedCount}/{sessionResults.length} câu. Độ khớp trung bình: {averageSimilarity}%.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPhase('setup')}
            className="inline-flex items-center justify-center gap-xs bg-primary text-on-primary rounded-full py-sm px-xl font-button text-button hover:bg-primary-active transition-colors shadow-sm"
          >
            <RotateCcw size={18} />
            Luyện lại
          </button>
        </div>

        <div className="flex flex-col gap-md">
          {sessionResults.map((result, index) => (
            <div
              key={`${result.word.id}-${index}`}
              className={`p-md rounded-[12px] border ${result.isPass ? 'bg-accent-green/5 border-accent-green/25' : 'bg-accent-orange/5 border-accent-orange/25'}`}
            >
              <div className="flex items-start gap-md">
                <div className="mt-1">
                  {result.isPass ? (
                    <CheckCircle2 className="text-accent-green" />
                  ) : (
                    <XCircle className="text-accent-orange" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-heading-3 text-heading-3 text-ink">{result.word.word}</div>
                  <p className="font-body-md text-body-md text-ink mt-xs">{result.word.example}</p>
                  <p className="font-body-sm text-body-sm text-ink-muted mt-sm">
                    Bạn đọc: {result.transcript || '(Không nhận dạng được)'}
                  </p>
                  <p className="font-body-sm text-body-sm text-ink-muted mt-xs">
                    Similarity {formatScore(result.similarityScore)}% · Accuracy {formatScore(result.accuracyScore)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
