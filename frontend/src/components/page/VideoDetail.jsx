import React, { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
import { translateTranscriptChunks } from '../../services/api';
import { apiRequest } from '../../services/backendApi';
import { useVideoLearningState } from '../../hooks/useVideoLearningState';
import { LearningPlaybackToolbar } from '../video-learning/LearningPlaybackToolbar';
import { VideoLearningSidebar } from '../video-learning/VideoLearningSidebar';

const PLAYER_CONFIG = {
  youtube: {
    playerVars: {
      controls: 0,
      disablekb: 1,
      fs: 0,
      iv_load_policy: 3,
      modestbranding: 1,
      rel: 0
    }
  }
};

function formatPlayerTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function findActiveTranscriptIndex(transcript, playedSeconds) {
  if (!transcript?.length || playedSeconds < Number(transcript[0].start || 0)) return -1;

  let low = 0;
  let high = transcript.length - 1;
  let activeIndex = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = Number(transcript[middle].start || 0);

    if (start <= playedSeconds) {
      activeIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return activeIndex;
}

function getTranscriptLineRange(transcript, index) {
  const line = transcript?.[index];
  if (!line) return null;

  const start = Number(line.start || 0);
  const nextStart = Number(transcript[index + 1]?.start);
  const duration = Number(line.duration || 0);
  const end = Number.isFinite(nextStart) && nextStart > start
    ? nextStart
    : start + Math.max(duration, 0.5);

  return { start, end };
}

function calculateHoaiMyRate(text, timelineDuration) {
  const wordCount = text.trim().split(/\s+/).length;
  const estimatedDuration = wordCount / 2.5;
  return Math.max(-50, Math.min(100, Math.round((estimatedDuration / Math.max(timelineDuration, 0.5) - 1) * 100)));
}

function getHoaiMyAudioUrl(cache, text, timelineDuration) {
  const rate = calculateHoaiMyRate(text, timelineDuration);
  const cacheKey = `${rate}:${text}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const audioUrlPromise = apiRequest('/api/videos/tts', {
    method: 'POST',
    body: { text, rate }
  }).then(audioBlob => URL.createObjectURL(audioBlob));

  cache.set(cacheKey, audioUrlPromise);
  audioUrlPromise.catch(() => cache.delete(cacheKey));
  return audioUrlPromise;
}

function getHoaiMyLineAudioUrl(cache, transcript, index) {
  const line = transcript?.[index];
  const range = getTranscriptLineRange(transcript, index);
  if (!line?.text_vi || !range) return null;

  return getHoaiMyAudioUrl(cache, line.text_vi, range.end - range.start);
}

function prefetchHoaiMyWindow(cache, transcript, startIndex, count = 5) {
  if (startIndex < 0) return Promise.resolve([]);

  const requests = [];
  const endIndex = Math.min(transcript?.length || 0, startIndex + count);
  for (let index = startIndex; index < endIndex; index += 1) {
    const request = getHoaiMyLineAudioUrl(cache, transcript, index);
    if (request) requests.push(request);
  }

  return Promise.allSettled(requests);
}

function waitForAudioMetadata(audio) {
  if (audio.readyState >= 1 && Number.isFinite(audio.duration)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('error', handleError);
    };
    const handleLoaded = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Cannot read HoaiMy audio metadata.'));
    };

    audio.addEventListener('loadedmetadata', handleLoaded, { once: true });
    audio.addEventListener('error', handleError, { once: true });
    audio.load();
  });
}

function alignVoiceToTimeline(audio, range, currentTime) {
  const timelineDuration = Math.max(range.end - range.start, 0.1);
  const elapsedTimeline = Math.max(0, Math.min(timelineDuration, currentTime - range.start));
  const audioDuration = Number.isFinite(audio.duration) && audio.duration > 0
    ? audio.duration
    : timelineDuration;
  const exactPlaybackRate = audioDuration / timelineDuration;

  audio.preservesPitch = true;
  audio.playbackRate = Math.max(0.25, Math.min(4, exactPlaybackRate));
  audio.currentTime = Math.min(
    Math.max(0, elapsedTimeline * exactPlaybackRate),
    Math.max(0, audioDuration - 0.03)
  );
}

function getFollowingUnwatchedVideos(videos, currentVideo) {
  if (!currentVideo) return [];

  const sameTopicVideos = videos.filter(candidate => candidate.topicId === currentVideo.topicId);
  const currentIndex = sameTopicVideos.findIndex(candidate => candidate.id === currentVideo.id);
  const orderedVideos = currentIndex >= 0
    ? [...sameTopicVideos.slice(currentIndex + 1), ...sameTopicVideos.slice(0, currentIndex)]
    : sameTopicVideos;

  return orderedVideos.filter(candidate => candidate.id !== currentVideo.id && !candidate.watchedAt);
}

export function VideoDetail({
  videoId,
  videos,
  setVideos,
  settings,
  onBack,
  onVideoSelect,
  onPlaybackUpdate,
  videoTopic,
  videoVocabulary = [],
  onSaveVocabulary = () => Promise.resolve(),
  onDeleteVocabulary = () => Promise.resolve(),
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [activeTranscriptIndex, setActiveTranscriptIndex] = useState(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [showPlayerControls, setShowPlayerControls] = useState(true);
  const [loopLineIndex, setLoopLineIndex] = useState(null);
  const [isVietnameseVoiceEnabled, setIsVietnameseVoiceEnabled] = useState(false);
  const [isVoiceBuffering, setIsVoiceBuffering] = useState(false);
  const [voiceReplayKey, setVoiceReplayKey] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [revealStage, setRevealStage] = useState('hidden');
  const [abLoopRange, setAbLoopRange] = useState(null);
  const [temporaryPlaybackRate, setTemporaryPlaybackRate] = useState(null);
  const [practiceShortcut, setPracticeShortcut] = useState({ activity: null, lineIndex: -1, nonce: 0 });
  const learning = useVideoLearningState(videoId);
  const playerRef = useRef(null);
  const videoStageRef = useRef(null);
  const transcriptPanelRef = useRef(null);
  const transcriptLineRefs = useRef([]);
  const controlsTimerRef = useRef(null);
  const mutedBeforeVietnameseVoiceRef = useRef(false);
  const vietnameseVoiceEnabledRef = useRef(false);
  const vietnameseAudioRef = useRef(null);
  const hoaiMyAudioCacheRef = useRef(new Map());
  const isScrubbingRef = useRef(false);
  const voiceBufferRequestRef = useRef(0);
  const playbackSnapshotRef = useRef({ position: 0, duration: 0 });
  const lastSavedPositionRef = useRef(0);
  const lastSaveAtRef = useRef(0);
  const lastPeriodicSaveAtRef = useRef(0);
  const lastLearningWatchAtRef = useRef(0);
  const hasEndedRef = useRef(false);
  const hasRestoredProgressRef = useRef(false);
  const autoPauseTimerRef = useRef(null);
  const lastAutoPausedLineRef = useRef(-1);
  const replaySequenceRef = useRef(null);

  const video = videos.find(v => v.id === videoId);
  const learningPreferences = learning.state.preferences;
  const subtitleMode = learningPreferences.subtitleMode || 'bilingual';
  const showSubOriginal = subtitleMode === 'bilingual' || subtitleMode === 'english'
    || (subtitleMode === 'reveal' && ['english', 'vietnamese'].includes(revealStage));
  const showSubVietnamese = subtitleMode === 'bilingual' || subtitleMode === 'vietnamese'
    || (subtitleMode === 'reveal' && revealStage === 'vietnamese');

  const persistPlaybackProgress = ({ ended = false, force = false, keepalive = false } = {}) => {
    if (!video) return Promise.resolve();

    const now = Date.now();
    const position = Math.max(0, Number(playbackSnapshotRef.current.position || 0));
    const savedDuration = Math.max(0, Number(playbackSnapshotRef.current.duration || 0));
    const isAlmostFinished = savedDuration > 0 && (
      savedDuration - position <= 10
      || position / savedDuration >= 0.95
    );

    if (!ended && !isAlmostFinished && position < 5) return Promise.resolve();
    if (
      !ended
      && !isAlmostFinished
      && !force
      && Math.abs(position - lastSavedPositionRef.current) < 5
    ) return Promise.resolve();
    if (
      !ended
      && Math.abs(position - lastSavedPositionRef.current) < 0.25
      && now - lastSaveAtRef.current < 1000
    ) return Promise.resolve();

    const changes = ended || isAlmostFinished
      ? {
          resumePositionSeconds: 0,
          playbackDurationSeconds: savedDuration,
          lastWatchedAt: now,
          watchedAt: now
        }
      : {
          resumePositionSeconds: Math.round(position * 10) / 10,
          playbackDurationSeconds: Math.round(savedDuration * 10) / 10,
          lastWatchedAt: now,
          watchedAt: null
        };

    lastSavedPositionRef.current = position;
    lastSaveAtRef.current = now;

    if (onPlaybackUpdate) {
      return Promise.resolve(onPlaybackUpdate(video.id, changes, { keepalive }));
    }

    return Promise.resolve(setVideos(currentVideos => currentVideos.map(candidate => (
      candidate.id === video.id ? { ...candidate, ...changes } : candidate
    ))));
  };

  useEffect(() => {
    const savedPosition = Math.max(0, Number(video?.resumePositionSeconds || 0));
    const savedDuration = Math.max(0, Number(video?.playbackDurationSeconds || 0));
    setHasEnded(false);
    hasEndedRef.current = false;
    hasRestoredProgressRef.current = false;
    setActiveTranscriptIndex(-1);
    setPlayedSeconds(savedPosition);
    setDuration(savedDuration);
    playbackSnapshotRef.current = { position: savedPosition, duration: savedDuration };
    lastSavedPositionRef.current = savedPosition;
    lastSaveAtRef.current = 0;
    lastPeriodicSaveAtRef.current = Date.now();
    lastLearningWatchAtRef.current = Date.now();
    setLoopLineIndex(null);
    setAbLoopRange(null);
    replaySequenceRef.current = null;
    setTemporaryPlaybackRate(null);
    lastAutoPausedLineRef.current = -1;
    clearTimeout(autoPauseTimerRef.current);
    setIsVietnameseVoiceEnabled(false);
    setIsVoiceBuffering(false);
    setVoiceReplayKey(0);
    setIsScrubbing(false);
    isScrubbingRef.current = false;
    voiceBufferRequestRef.current += 1;
    if (vietnameseVoiceEnabledRef.current) {
      setIsMuted(mutedBeforeVietnameseVoiceRef.current);
      vietnameseVoiceEnabledRef.current = false;
    }
    vietnameseAudioRef.current?.pause();
    vietnameseAudioRef.current = null;
    transcriptLineRefs.current = [];
  }, [videoId]);

  useEffect(() => {
    const persistBeforeLeaving = keepalive => {
      if (hasEndedRef.current) return;
      persistPlaybackProgress({ force: true, keepalive }).catch(error => {
        console.error('Failed to save video progress:', error);
      });
    };
    const handlePageHide = () => persistBeforeLeaving(true);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistBeforeLeaving(true);
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      persistBeforeLeaving(false);
    };
  }, [videoId]);

  useEffect(() => {
    clearTimeout(controlsTimerRef.current);

    if (!isPlaying) {
      setShowPlayerControls(true);
      return undefined;
    }

    controlsTimerRef.current = setTimeout(() => setShowPlayerControls(false), 1800);
    return () => clearTimeout(controlsTimerRef.current);
  }, [isPlaying]);

  useEffect(() => () => clearTimeout(controlsTimerRef.current), []);

  useEffect(() => () => clearTimeout(autoPauseTimerRef.current), []);

  useEffect(() => {
    if (subtitleMode !== 'reveal' || activeTranscriptIndex < 0) {
      setRevealStage('hidden');
      return undefined;
    }
    setRevealStage('hidden');
    const englishTimer = setTimeout(() => setRevealStage('english'), 900);
    const vietnameseTimer = setTimeout(() => setRevealStage('vietnamese'), 1900);
    return () => {
      clearTimeout(englishTimer);
      clearTimeout(vietnameseTimer);
    };
  }, [activeTranscriptIndex, subtitleMode]);

  useEffect(() => {
    const cache = hoaiMyAudioCacheRef.current;
    return () => {
      vietnameseAudioRef.current?.pause();
      vietnameseAudioRef.current = null;
      cache.forEach(audioUrlPromise => {
        Promise.resolve(audioUrlPromise).then(URL.revokeObjectURL).catch(() => {});
      });
      cache.clear();
    };
  }, [videoId]);

  useEffect(() => {
    let cancelled = false;
    vietnameseAudioRef.current?.pause();
    vietnameseAudioRef.current = null;

    if (!isVietnameseVoiceEnabled || !isPlaying || isScrubbing || activeTranscriptIndex < 0) {
      return undefined;
    }

    const transcript = video?.transcript;
    const line = transcript?.[activeTranscriptIndex];
    const range = getTranscriptLineRange(transcript, activeTranscriptIndex);
    if (!line?.text_vi || !range) return undefined;

    prefetchHoaiMyWindow(
      hoaiMyAudioCacheRef.current,
      transcript,
      activeTranscriptIndex,
      5
    ).catch(() => {});

    const playVoice = async () => {
      try {
        const audioUrl = await getHoaiMyAudioUrl(
          hoaiMyAudioCacheRef.current,
          line.text_vi,
          range.end - range.start
        );
        if (cancelled) return;

        const audio = new Audio(audioUrl);
        await waitForAudioMetadata(audio);
        if (cancelled) return;

        const currentVideoTime = Number(playerRef.current?.getCurrentTime?.() ?? range.start);
        if (currentVideoTime >= range.end) return;

        alignVoiceToTimeline(audio, range, currentVideoTime);
        vietnameseAudioRef.current = audio;
        await audio.play();
      } catch (error) {
        if (!cancelled) console.error('HoaiMy voice playback failed:', error);
      }
    };

    playVoice();

    return () => {
      cancelled = true;
      vietnameseAudioRef.current?.pause();
      vietnameseAudioRef.current = null;
    };
  }, [activeTranscriptIndex, isPlaying, isScrubbing, isVietnameseVoiceEnabled, video, voiceReplayKey]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === videoStageRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyboardShortcut = event => {
      const target = event.target;
      const isEditing = target instanceof HTMLElement && (
        target.isContentEditable
        || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)
      );

      if (isEditing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.code === 'Space') {
        event.preventDefault();
        setShowPlayerControls(true);
        setIsPlaying(current => !current);
        return;
      }

      if (event.code === 'KeyF') {
        event.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          videoStageRef.current?.requestFullscreen();
        }
        return;
      }

      if (event.code === 'KeyJ' || event.code === 'KeyL') {
        event.preventDefault();
        const nextIndex = Math.max(0, Math.min((video?.transcript?.length || 1) - 1, activeTranscriptIndex + (event.code === 'KeyJ' ? -1 : 1)));
        const range = getTranscriptLineRange(video?.transcript, nextIndex);
        if (range) {
          playerRef.current?.seekTo(Math.max(0, range.start - Number(learningPreferences.subtitleOffset || 0)), 'seconds');
          setActiveTranscriptIndex(nextIndex);
          setIsPlaying(true);
        }
        return;
      }

      if (event.code === 'KeyR') {
        event.preventDefault();
        playLearningLine(activeTranscriptIndex);
        return;
      }

      if (event.code === 'KeyC') {
        event.preventDefault();
        const modes = ['bilingual', 'english', 'vietnamese', 'hidden', 'reveal'];
        const nextMode = modes[(modes.indexOf(subtitleMode) + 1) % modes.length];
        learning.updatePreferences({ subtitleMode: nextMode }).catch(() => {});
        return;
      }

      if (event.code === 'KeyD' || event.code === 'KeyS') {
        event.preventDefault();
        setPracticeShortcut(current => ({
          activity: event.code === 'KeyD' ? 'dictation' : 'shadowing',
          lineIndex: Math.max(0, activeTranscriptIndex),
          nonce: current.nonce + 1,
        }));
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
  }, [activeTranscriptIndex, learningPreferences.subtitleOffset, subtitleMode, videoId]);

  useEffect(() => {
    const panel = transcriptPanelRef.current;
    const activeLine = transcriptLineRefs.current[activeTranscriptIndex];
    if (!panel || !activeLine) return;

    const lineTop = activeLine.offsetTop;
    const lineBottom = lineTop + activeLine.offsetHeight;
    const viewportTop = panel.scrollTop;
    const viewportBottom = viewportTop + panel.clientHeight;
    const edgePadding = 16;

    if (lineTop < viewportTop + edgePadding || lineBottom > viewportBottom - edgePadding) {
      panel.scrollTo({
        top: Math.max(0, lineTop - (panel.clientHeight - activeLine.offsetHeight) / 2),
        behavior: 'smooth'
      });
    }
  }, [activeTranscriptIndex]);

  if (!video) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-md">
        <div className="text-on-surface-variant">Không tìm thấy video.</div>
        <button onClick={onBack} className="bg-primary text-on-primary px-lg py-sm rounded-[8px]">Quay lại</button>
      </div>
    );
  }

  const hasTranslation = video.transcript && video.transcript.some(t => t.text_vi);
  const activeTranscriptLine = video.transcript?.[activeTranscriptIndex] || null;
  const loopLineRange = getTranscriptLineRange(video.transcript, loopLineIndex);
  const abLoopMediaRange = abLoopRange ? {
    start: Math.max(0, Number(getTranscriptLineRange(video.transcript, abLoopRange.start)?.start || 0) - Number(learningPreferences.subtitleOffset || 0)),
    end: Math.max(0, Number(getTranscriptLineRange(video.transcript, abLoopRange.end)?.end || 0) - Number(learningPreferences.subtitleOffset || 0)),
  } : null;
  const followingUnwatchedVideos = getFollowingUnwatchedVideos(videos, video);
  const nextVideo = followingUnwatchedVideos[0] || null;
  const fullscreenRecommendations = followingUnwatchedVideos.slice(0, 4);

  const handleTranslate = async () => {
    if (!video.transcript || video.transcript.length === 0) return;
    setIsTranslating(true);
    setTranslationProgress(0);

    try {
      const transcript = [...video.transcript];
      const CHUNK_SIZE = 40; // 40 lines per request
      const chunks = [];
      for (let i = 0; i < transcript.length; i += CHUNK_SIZE) {
        chunks.push(transcript.slice(i, i + CHUNK_SIZE));
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const inputText = JSON.stringify(chunk.map(c => ({ text: c.text })));
        const translatedArray = await translateTranscriptChunks(inputText, settings.apiKey, settings.model);
        
        if (Array.isArray(translatedArray)) {
          for (let j = 0; j < chunk.length; j++) {
            const globalIndex = i * CHUNK_SIZE + j;
            if (transcript[globalIndex] && translatedArray[j]) {
              transcript[globalIndex].text_vi = translatedArray[j];
            }
          }
        }
        
        setTranslationProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      // Save back to state
      const updatedVideo = { ...video, transcript };
      setVideos(videos.map(v => v.id === video.id ? updatedVideo : v));

    } catch (e) {
      alert("Lỗi dịch: " + e.message);
    } finally {
      setIsTranslating(false);
    }
  };

  const primeHoaiMyAtIndex = async index => {
    if (index < 0) return;

    const currentLineRequest = getHoaiMyLineAudioUrl(
      hoaiMyAudioCacheRef.current,
      video.transcript,
      index
    );
    prefetchHoaiMyWindow(
      hoaiMyAudioCacheRef.current,
      video.transcript,
      index + 1,
      4
    ).catch(() => {});

    if (currentLineRequest) await currentLineRequest;
  };

  const bufferVoiceAndResume = async (index, shouldResume = true) => {
    const requestId = voiceBufferRequestRef.current + 1;
    voiceBufferRequestRef.current = requestId;
    vietnameseAudioRef.current?.pause();
    vietnameseAudioRef.current = null;
    setIsVoiceBuffering(true);
    setIsPlaying(false);

    try {
      await primeHoaiMyAtIndex(index);
      if (voiceBufferRequestRef.current !== requestId) return;

      setVoiceReplayKey(current => current + 1);
      if (shouldResume) setIsPlaying(true);
    } catch (error) {
      if (voiceBufferRequestRef.current === requestId) {
        console.error('HoaiMy voice buffering failed:', error);
        if (shouldResume) setIsPlaying(true);
      }
    } finally {
      if (voiceBufferRequestRef.current === requestId) setIsVoiceBuffering(false);
    }
  };

  const handleSeek = (time, shouldPlay = true) => {
    setHasEnded(false);
    hasEndedRef.current = false;
    playbackSnapshotRef.current = {
      ...playbackSnapshotRef.current,
      position: time
    };
    const nextIndex = findActiveTranscriptIndex(video.transcript, time + Number(learningPreferences.subtitleOffset || 0));
    setPlayedSeconds(time);
    setActiveTranscriptIndex(nextIndex);
    if (loopLineIndex !== null && nextIndex >= 0) setLoopLineIndex(nextIndex);
    if (playerRef.current) {
      playerRef.current.seekTo(time, 'seconds');
      if (isScrubbingRef.current) return;

      if (isVietnameseVoiceEnabled) {
        bufferVoiceAndResume(nextIndex, shouldPlay);
      } else {
        if (shouldPlay) setIsPlaying(true);
      }
    }
  };

  const seekToLine = (index, shouldPlay = true) => {
    const range = getTranscriptLineRange(video.transcript, index);
    if (!range) return;
    handleSeek(Math.max(0, range.start - Number(learningPreferences.subtitleOffset || 0)), shouldPlay);
    setActiveTranscriptIndex(index);
  };

  const playLearningLine = (index = activeTranscriptIndex, options = {}) => {
    const targetIndex = index >= 0 ? index : findActiveTranscriptIndex(
      video.transcript,
      playedSeconds + Number(learningPreferences.subtitleOffset || 0)
    );
    const range = getTranscriptLineRange(video.transcript, targetIndex);
    if (!range) return;
    const offset = Number(learningPreferences.subtitleOffset || 0);
    const rates = Number.isFinite(options.rate)
      ? [options.rate]
      : learningPreferences.progressiveReplay
        ? [0.75, 0.9, 1]
        : Array.from({ length: Number(learningPreferences.repeatCount || 1) }, () => Number(learningPreferences.playbackRate || 1));
    replaySequenceRef.current = {
      lineIndex: targetIndex,
      start: Math.max(0, range.start - offset),
      end: Math.max(0.1, range.end - offset),
      rates,
      iteration: 0,
      pauseAfter: options.pauseAfter ?? Number.isFinite(options.rate),
    };
    setTemporaryPlaybackRate(rates[0]);
    lastAutoPausedLineRef.current = -1;
    playerRef.current?.seekTo(Math.max(0, range.start - offset), 'seconds');
    setActiveTranscriptIndex(targetIndex);
    setPlayedSeconds(Math.max(0, range.start - offset));
    setIsPlaying(true);
  };

  const loopSpecificLine = index => {
    if (loopLineIndex === index) {
      setLoopLineIndex(null);
      return;
    }
    setAbLoopRange(null);
    setLoopLineIndex(index);
    seekToLine(index);
  };

  const setAbLoopPoint = point => {
    if (activeTranscriptIndex < 0) return;
    setLoopLineIndex(null);
    setAbLoopRange(current => {
      if (!current) return { start: activeTranscriptIndex, end: activeTranscriptIndex };
      const next = { ...current, [point]: activeTranscriptIndex };
      return next.start <= next.end ? next : { start: next.end, end: next.start };
    });
  };

  const updateLearningPreferences = changes => {
    learning.updatePreferences(changes).catch(error => console.error('Failed to save learning preferences:', error));
  };

  const toggleSubtitleLanguage = language => {
    if (language === 'english') {
      const nextMode = showSubOriginal
        ? (showSubVietnamese ? 'vietnamese' : 'hidden')
        : (showSubVietnamese ? 'bilingual' : 'english');
      updateLearningPreferences({ subtitleMode: nextMode });
      return;
    }
    const nextMode = showSubVietnamese
      ? (showSubOriginal ? 'english' : 'hidden')
      : (showSubOriginal ? 'bilingual' : 'vietnamese');
    updateLearningPreferences({ subtitleMode: nextMode });
  };

  const handleProgress = ({ playedSeconds }) => {
    const subtitleOffset = Number(learningPreferences.subtitleOffset || 0);
    if (
      abLoopMediaRange
      && (playedSeconds >= abLoopMediaRange.end - 0.05 || playedSeconds < abLoopMediaRange.start - 0.1)
    ) {
      playerRef.current?.seekTo(abLoopMediaRange.start, 'seconds');
      setPlayedSeconds(abLoopMediaRange.start);
      setActiveTranscriptIndex(abLoopRange.start);
      return;
    }

    const replaySequence = replaySequenceRef.current;
    if (replaySequence && playedSeconds >= replaySequence.end - 0.05) {
      const nextIteration = replaySequence.iteration + 1;
      if (nextIteration < replaySequence.rates.length) {
        replaySequence.iteration = nextIteration;
        setTemporaryPlaybackRate(replaySequence.rates[nextIteration]);
        playerRef.current?.seekTo(replaySequence.start, 'seconds');
        setPlayedSeconds(replaySequence.start);
        setActiveTranscriptIndex(replaySequence.lineIndex);
        return;
      }
      replaySequenceRef.current = null;
      setTemporaryPlaybackRate(null);
      if (replaySequence.pauseAfter) {
        setIsPlaying(false);
        return;
      }
    }

    if (
      loopLineIndex !== null
      && loopLineRange
      && (playedSeconds >= loopLineRange.end - subtitleOffset - 0.05 || playedSeconds < Math.max(0, loopLineRange.start - subtitleOffset) - 0.1)
    ) {
      const loopStart = Math.max(0, loopLineRange.start - subtitleOffset);
      playerRef.current?.seekTo(loopStart, 'seconds');
      setPlayedSeconds(loopStart);
      setActiveTranscriptIndex(loopLineIndex);
      if (isVietnameseVoiceEnabled) setVoiceReplayKey(current => current + 1);
      return;
    }

    playbackSnapshotRef.current = {
      position: playedSeconds,
      duration: playbackSnapshotRef.current.duration
    };
    setPlayedSeconds(playedSeconds);
    const nextIndex = findActiveTranscriptIndex(video.transcript, playedSeconds + subtitleOffset);
    setActiveTranscriptIndex(currentIndex => currentIndex === nextIndex ? currentIndex : nextIndex);

    const pauseLineIndex = activeTranscriptIndex >= 0 ? activeTranscriptIndex : nextIndex;
    const currentRange = getTranscriptLineRange(video.transcript, pauseLineIndex);
    if (
      learningPreferences.autoPause
      && currentRange
      && lastAutoPausedLineRef.current !== pauseLineIndex
      && playedSeconds >= currentRange.end - subtitleOffset - 0.08
    ) {
      lastAutoPausedLineRef.current = pauseLineIndex;
      setIsPlaying(false);
      clearTimeout(autoPauseTimerRef.current);
      autoPauseTimerRef.current = setTimeout(() => setIsPlaying(true), Number(learningPreferences.autoPauseDelay || 1.5) * 1000);
    }

    const now = Date.now();
    if (isPlaying && now - lastPeriodicSaveAtRef.current >= 10000) {
      lastPeriodicSaveAtRef.current = now;
      persistPlaybackProgress().catch(error => {
        console.error('Failed to save video progress:', error);
      });
    }
    if (isPlaying && now - lastLearningWatchAtRef.current >= 30000) {
      lastLearningWatchAtRef.current = now;
      learning.updateState(current => ({
        ...current,
        aggregateStats: { ...current.aggregateStats, watchSeconds: Number(current.aggregateStats?.watchSeconds || 0) + 30 },
      })).catch(() => {});
    }
  };

  const handlePlayerPause = () => {
    setIsPlaying(false);
    if (hasEndedRef.current) return;
    persistPlaybackProgress({ force: true }).catch(error => {
      console.error('Failed to save paused video progress:', error);
    });
  };

  const restoreSavedPosition = () => {
    if (hasRestoredProgressRef.current) return;
    hasRestoredProgressRef.current = true;

    const savedPosition = Math.max(0, Number(video.resumePositionSeconds || 0));
    const savedDuration = Math.max(0, Number(video.playbackDurationSeconds || 0));
    const canResume = savedPosition >= 5 && (
      savedDuration === 0
      || (savedDuration - savedPosition > 10 && savedPosition / savedDuration < 0.95)
    );
    if (!canResume) return;

    playerRef.current?.seekTo(savedPosition, 'seconds');
    setPlayedSeconds(savedPosition);
    setActiveTranscriptIndex(findActiveTranscriptIndex(video.transcript, savedPosition + Number(learningPreferences.subtitleOffset || 0)));
    playbackSnapshotRef.current = {
      position: savedPosition,
      duration: savedDuration
    };
  };

  const handlePlayerDuration = nextDuration => {
    setDuration(nextDuration);
    playbackSnapshotRef.current = {
      ...playbackSnapshotRef.current,
      duration: nextDuration
    };
    restoreSavedPosition();
  };

  const revealPlayerControls = () => {
    setShowPlayerControls(true);
    clearTimeout(controlsTimerRef.current);

    if (isPlaying) {
      controlsTimerRef.current = setTimeout(() => setShowPlayerControls(false), 1800);
    }
  };

  const handlePlayerClick = () => {
    setIsPlaying(current => !current);
    revealPlayerControls();
  };

  const handleTimelineChange = event => {
    handleSeek(Number(event.target.value));
    revealPlayerControls();
  };

  const startTimelineScrubbing = () => {
    isScrubbingRef.current = true;
    voiceBufferRequestRef.current += 1;
    setIsScrubbing(true);
    setIsPlaying(false);
    setIsVoiceBuffering(false);
    vietnameseAudioRef.current?.pause();
    vietnameseAudioRef.current = null;
  };

  const stopTimelineScrubbing = () => {
    isScrubbingRef.current = false;
    setIsScrubbing(false);
    if (isVietnameseVoiceEnabled) {
      bufferVoiceAndResume(activeTranscriptIndex);
    } else {
      setIsPlaying(true);
    }
  };

  const handleVolumeChange = event => {
    const nextVolume = Number(event.target.value);
    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
    revealPlayerControls();
  };

  const toggleCurrentLineLoop = () => {
    if (loopLineIndex !== null) {
      setLoopLineIndex(null);
      return;
    }

    const targetIndex = activeTranscriptIndex >= 0
      ? activeTranscriptIndex
      : findActiveTranscriptIndex(video.transcript, playedSeconds);
    const targetRange = getTranscriptLineRange(video.transcript, targetIndex);
    if (!targetRange) return;

    loopSpecificLine(targetIndex);
  };

  const toggleVietnameseVoice = async () => {
    if (isVietnameseVoiceEnabled) {
      voiceBufferRequestRef.current += 1;
      vietnameseAudioRef.current?.pause();
      vietnameseAudioRef.current = null;
      setIsVietnameseVoiceEnabled(false);
      vietnameseVoiceEnabledRef.current = false;
      setIsMuted(mutedBeforeVietnameseVoiceRef.current);
      return;
    }

    const targetIndex = activeTranscriptIndex >= 0
      ? activeTranscriptIndex
      : findActiveTranscriptIndex(video.transcript, playedSeconds);
    const wasPlaying = isPlaying;
    const requestId = voiceBufferRequestRef.current + 1;
    voiceBufferRequestRef.current = requestId;

    mutedBeforeVietnameseVoiceRef.current = isMuted;
    vietnameseVoiceEnabledRef.current = true;
    setIsMuted(true);
    setIsVoiceBuffering(true);
    setIsPlaying(false);

    try {
      await primeHoaiMyAtIndex(Math.max(0, targetIndex));
      if (voiceBufferRequestRef.current !== requestId) {
        vietnameseVoiceEnabledRef.current = false;
        setIsMuted(mutedBeforeVietnameseVoiceRef.current);
        return;
      }

      setIsVietnameseVoiceEnabled(true);
      setVoiceReplayKey(current => current + 1);
      if (wasPlaying) setIsPlaying(true);
    } catch (error) {
      if (voiceBufferRequestRef.current === requestId) {
        console.error('HoaiMy voice buffering failed:', error);
        vietnameseVoiceEnabledRef.current = false;
        setIsMuted(mutedBeforeVietnameseVoiceRef.current);
        alert(`Không thể tải voice HoaiMy: ${error.message}`);
      }
    } finally {
      if (voiceBufferRequestRef.current === requestId) setIsVoiceBuffering(false);
    }
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await videoStageRef.current?.requestFullscreen();
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    setHasEnded(true);
    hasEndedRef.current = true;
    setShowPlayerControls(true);
    vietnameseAudioRef.current?.pause();
    vietnameseAudioRef.current = null;
    playbackSnapshotRef.current = {
      position: duration || playedSeconds,
      duration: duration || playbackSnapshotRef.current.duration
    };
    persistPlaybackProgress({ ended: true, force: true }).catch(error => {
      console.error('Failed to mark video as watched:', error);
    });
  };

  const playSelectedVideo = selectedVideo => {
    if (!selectedVideo) return;
    setHasEnded(false);
    hasEndedRef.current = false;
    setIsPlaying(true);
    onVideoSelect(selectedVideo.id);
  };

  const replayCurrentVideo = () => {
    setHasEnded(false);
    hasEndedRef.current = false;
    setPlayedSeconds(0);
    setActiveTranscriptIndex(-1);
    playbackSnapshotRef.current = {
      position: 0,
      duration: playbackSnapshotRef.current.duration
    };
    playerRef.current?.seekTo(0, 'seconds');
    setIsPlaying(true);
  };

  const handleBack = () => {
    if (!hasEndedRef.current) {
      persistPlaybackProgress({ force: true }).catch(error => {
        console.error('Failed to save video progress before leaving:', error);
      });
    }
    onBack();
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="h-[60px] border-b border-hairline bg-surface flex items-center px-lg shrink-0 gap-md">
        <button 
          onClick={handleBack}
          className="p-xs rounded-lg hover:bg-surface-container-low text-on-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-heading-2 font-heading-2 text-on-surface line-clamp-1 min-w-0 flex-1" title={`${video.title}${videoTopic?.name ? ` · ${videoTopic.name}` : ''}`}>{video.title}</h2>

        {hasEnded && !isFullscreen && nextVideo && (
          <button
            type="button"
            onClick={() => playSelectedVideo(nextVideo)}
            title={nextVideo.title}
            className="flex max-w-[220px] shrink-0 items-center gap-xs rounded-[8px] border border-hairline bg-surface-container-low px-sm py-xs text-on-surface hover:border-primary hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined shrink-0 text-[20px]">skip_next</span>
            <span className="max-w-[72px] sm:max-w-[160px] truncate text-body-sm font-medium">{nextVideo.title}</span>
          </button>
        )}
        
        <div className="flex items-center gap-xs ml-auto mr-sm bg-surface-container-low p-1 rounded-[8px] border border-hairline">
          <button 
            onClick={() => toggleSubtitleLanguage('english')}
            className={`px-sm py-1 rounded-[6px] font-medium text-body-sm transition-colors ${showSubOriginal ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
            title="Bật/tắt phụ đề gốc"
          >
            Gốc
          </button>
          <button 
            onClick={() => toggleSubtitleLanguage('vietnamese')}
            className={`px-sm py-1 rounded-[6px] font-medium text-body-sm transition-colors ${showSubVietnamese ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
            title="Bật/tắt phụ đề tiếng Việt"
          >
            Việt
          </button>
        </div>

        {!hasTranslation && !isTranslating && (
          <button 
            onClick={handleTranslate}
            className="bg-primary text-on-primary px-md py-xs rounded-[8px] font-button text-button hover:opacity-90 whitespace-nowrap"
          >
            Dịch Video
          </button>
        )}
        {isTranslating && (
          <div className="text-primary font-medium text-body-sm">
            Đang dịch... {translationProgress}%
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-canvas">
        {/* Left: Video Player */}
        <div className="sticky top-0 z-10 flex h-[58vh] w-full flex-col border-b border-hairline bg-black md:static md:z-auto md:h-full md:min-w-0 md:flex-1 md:border-b-0 md:border-r">
          <div
            ref={videoStageRef}
            className="flex-1 min-h-0 relative bg-black"
            onMouseMove={revealPlayerControls}
            onMouseLeave={() => { if (isPlaying) setShowPlayerControls(false); }}
          >
            <ReactPlayer
              ref={playerRef}
              url={`https://www.youtube.com/watch?v=${video.youtubeId}`}
              width="100%"
              height="100%"
              playing={isPlaying}
              volume={volume}
              muted={isMuted}
              playbackRate={temporaryPlaybackRate ?? Number(learningPreferences.playbackRate || 1)}
              progressInterval={100}
              onReady={restoreSavedPosition}
              onPlay={() => { setIsPlaying(true); setHasEnded(false); hasEndedRef.current = false; }}
              onPause={handlePlayerPause}
              onEnded={handleVideoEnded}
              onProgress={handleProgress}
              onDuration={handlePlayerDuration}
              onSeek={time => setActiveTranscriptIndex(findActiveTranscriptIndex(video.transcript, time + Number(learningPreferences.subtitleOffset || 0)))}
              controls={false}
              config={PLAYER_CONFIG}
            />

            {learningPreferences.audioFocus && (
              <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-slate-950 text-white">
                <div className="text-center">
                  <span className="material-symbols-outlined text-[54px] text-accent-sky">headphones</span>
                  <p className="mt-sm text-body-sm font-medium">Audio focus · Hình ảnh đang được che</p>
                </div>
              </div>
            )}

            {isFullscreen && !hasEnded && (
              <div className="absolute inset-x-sm top-sm z-20 rounded-[8px] bg-surface/95 shadow-lg backdrop-blur-sm">
                <LearningPlaybackToolbar
                  preferences={learningPreferences}
                  onPreferencesChange={updateLearningPreferences}
                  activeLineIndex={activeTranscriptIndex}
                  lineCount={video.transcript?.length || 0}
                  onPreviousLine={() => seekToLine(activeTranscriptIndex - 1)}
                  onNextLine={() => seekToLine(activeTranscriptIndex + 1)}
                  onReplay={() => playLearningLine(activeTranscriptIndex)}
                  loopRange={abLoopRange}
                  onSetLoopPoint={setAbLoopPoint}
                  onClearLoop={() => setAbLoopRange(null)}
                />
              </div>
            )}

            {hasEnded && isFullscreen && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/95 p-lg text-white">
                <div className="w-full max-w-5xl">
                  <div className="mb-md flex items-center justify-between gap-md">
                    <div>
                      <h3 className="text-[24px] font-semibold">Video tiếp theo cùng chủ đề</h3>
                      <p className="mt-xs text-body-sm text-white/70">Chọn một video bạn chưa xem</p>
                    </div>
                    <button
                      type="button"
                      onClick={replayCurrentVideo}
                      className="shrink-0 flex items-center gap-xs rounded-[8px] border border-white/25 bg-white/10 px-md py-sm text-white hover:bg-white/20 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">replay</span>
                      Xem lại
                    </button>
                  </div>

                  {fullscreenRecommendations.length > 0 ? (
                    <div className="grid grid-cols-2 grid-rows-2 gap-md">
                      {fullscreenRecommendations.map(recommendedVideo => (
                        <button
                          key={recommendedVideo.id}
                          type="button"
                          onClick={() => playSelectedVideo(recommendedVideo)}
                          title={recommendedVideo.title}
                          className="group min-w-0 overflow-hidden rounded-[12px] border border-white/15 bg-white/10 text-left hover:border-primary hover:bg-white/15 transition-colors"
                        >
                          <div className="flex items-center gap-md p-sm">
                            <div className="relative aspect-video w-[42%] shrink-0 overflow-hidden rounded-[8px] bg-black">
                              <img
                                src={recommendedVideo.thumbnail}
                                alt=""
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <span className="material-symbols-outlined absolute inset-0 flex items-center justify-center bg-black/20 text-[36px] text-white opacity-80">play_circle</span>
                            </div>
                            <span className="line-clamp-2 min-w-0 text-[15px] font-semibold leading-snug text-white">
                              {recommendedVideo.title}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[12px] border border-white/15 bg-white/10 px-lg py-xl text-center text-white/75">
                      Bạn đã xem hết các video khác trong chủ đề này.
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handlePlayerClick}
              aria-label={isPlaying ? 'Tạm dừng video' : 'Phát video'}
              className="absolute inset-0 z-[1] cursor-default bg-transparent"
            />

            {activeTranscriptLine && (showSubOriginal || showSubVietnamese) && (
              <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-lg">
                <div className={`w-full rounded-[8px] bg-black/75 text-center shadow-lg backdrop-blur-sm flex flex-col gap-xs ${isFullscreen
                  ? 'max-w-5xl px-lg py-md'
                  : 'max-w-3xl px-md py-sm'
                }`}>
                  {showSubOriginal && (
                    <div className={`leading-tight font-semibold text-white ${isFullscreen
                      ? 'text-[30px] lg:text-[36px]'
                      : 'text-[22px] md:text-[26px]'
                    }`}>
                      {activeTranscriptLine.text}
                    </div>
                  )}
                  {showSubVietnamese && activeTranscriptLine.text_vi && (
                    <div className={`leading-relaxed font-medium text-accent-sky ${isFullscreen
                      ? 'text-[20px] lg:text-[24px]'
                      : 'text-[15px] md:text-[17px]'
                    }`}>
                      {activeTranscriptLine.text_vi}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className={`absolute inset-x-sm bottom-sm z-20 flex items-center gap-sm rounded-[8px] bg-black/80 px-sm py-xs text-white shadow-lg backdrop-blur-sm transition-opacity ${showPlayerControls || !isPlaying
              ? 'opacity-100'
              : 'pointer-events-none opacity-0'
            }`}>
              <button
                type="button"
                onClick={() => { setIsPlaying(current => !current); revealPlayerControls(); }}
                title={isPlaying ? 'Tạm dừng' : 'Phát'}
                aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-[8px] hover:bg-white/15 transition-colors"
              >
                <span className="material-symbols-outlined text-[24px]">
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>

              <span className="shrink-0 font-mono text-[11px] text-white/90">
                {formatPlayerTime(playedSeconds)} / {formatPlayerTime(duration)}
              </span>

              <input
                type="range"
                min="0"
                max={Math.max(duration, 0)}
                step="0.1"
                value={Math.min(playedSeconds, duration || 0)}
                onChange={handleTimelineChange}
                onPointerDown={startTimelineScrubbing}
                onPointerUp={stopTimelineScrubbing}
                onPointerCancel={stopTimelineScrubbing}
                aria-label="Tua video"
                className="h-1 min-w-0 flex-1 cursor-pointer accent-primary"
              />

              <button
                type="button"
                onClick={() => { setIsMuted(current => !current); revealPlayerControls(); }}
                title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                aria-label={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-[8px] hover:bg-white/15 transition-colors"
              >
                <span className="material-symbols-outlined text-[22px]">
                  {isMuted || volume === 0 ? 'volume_off' : 'volume_up'}
                </span>
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Âm lượng"
                className="hidden sm:block h-1 w-20 cursor-pointer accent-primary"
              />

              <button
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Thu nhỏ video' : 'Phóng to video'}
                aria-label={isFullscreen ? 'Thu nhỏ video' : 'Phóng to video'}
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-[8px] hover:bg-white/15 transition-colors"
              >
                <span className="material-symbols-outlined text-[22px]">
                  {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                </span>
              </button>
            </div>
          </div>

          <div className="h-[92px] shrink-0 border-t border-hairline bg-surface px-md py-xs text-on-surface">
            <div className="flex h-9 items-center gap-sm">
              <span className="w-12 shrink-0 text-right font-mono text-[11px] text-on-surface-variant">
                {formatPlayerTime(playedSeconds)}
              </span>
              <input
                type="range"
                min="0"
                max={Math.max(duration, 0)}
                step="0.1"
                value={Math.min(playedSeconds, duration || 0)}
                onChange={handleTimelineChange}
                onPointerDown={startTimelineScrubbing}
                onPointerUp={stopTimelineScrubbing}
                onPointerCancel={stopTimelineScrubbing}
                aria-label="Điều chỉnh thời gian video"
                className="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
              />
              <span className="w-12 shrink-0 font-mono text-[11px] text-on-surface-variant">
                {formatPlayerTime(duration)}
              </span>
            </div>

            <div className="flex h-10 items-center justify-between gap-xs">
              <div className="hidden min-w-0 truncate text-body-sm text-on-surface-variant sm:block">
                {activeTranscriptIndex >= 0
                  ? `Câu ${activeTranscriptIndex + 1} · ${formatPlayerTime(Number(activeTranscriptLine?.start || 0))}`
                  : 'Chưa chọn câu phụ đề'}
              </div>
              <div className="ml-auto flex items-center gap-xs">
                <button
                  type="button"
                  onClick={toggleVietnameseVoice}
                  disabled={!hasTranslation || isVoiceBuffering}
                  aria-pressed={isVietnameseVoiceEnabled}
                  title={isVietnameseVoiceEnabled ? 'Tắt voice Microsoft HoaiMy' : 'Bật voice Microsoft HoaiMy'}
                  className={`h-9 shrink-0 px-sm flex items-center gap-xs rounded-[8px] border font-button text-button transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isVietnameseVoiceEnabled
                    ? 'border-accent-sky bg-accent-sky text-on-primary-fixed'
                    : 'border-hairline bg-surface-container-low text-on-surface hover:border-accent-sky hover:text-primary'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${isVoiceBuffering ? 'animate-spin' : ''}`}>
                    {isVoiceBuffering ? 'progress_activity' : 'record_voice_over'}
                  </span>
                  {isVoiceBuffering ? 'Đang tải voice...' : 'Voice HoaiMy'}
                </button>

                <button
                  type="button"
                  onClick={toggleCurrentLineLoop}
                  disabled={loopLineIndex === null && activeTranscriptIndex < 0}
                  aria-pressed={loopLineIndex !== null}
                  title={loopLineIndex !== null ? 'Tắt lặp câu hiện tại' : 'Lặp câu hiện tại'}
                  className={`h-9 shrink-0 px-sm flex items-center gap-xs rounded-[8px] border font-button text-button transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${loopLineIndex !== null
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-hairline bg-surface-container-low text-on-surface hover:border-primary hover:text-primary'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">repeat_one</span>
                  {loopLineIndex !== null ? `Loop câu ${loopLineIndex + 1}` : 'Loop câu'}
                </button>
              </div>
            </div>
          </div>
          <LearningPlaybackToolbar
            preferences={learningPreferences}
            onPreferencesChange={updateLearningPreferences}
            activeLineIndex={activeTranscriptIndex}
            lineCount={video.transcript?.length || 0}
            onPreviousLine={() => seekToLine(activeTranscriptIndex - 1)}
            onNextLine={() => seekToLine(activeTranscriptIndex + 1)}
            onReplay={() => playLearningLine(activeTranscriptIndex)}
            loopRange={abLoopRange}
            onSetLoopPoint={setAbLoopPoint}
            onClearLoop={() => setAbLoopRange(null)}
          />
        </div>

        <div className="h-[60vh] min-h-0 w-full shrink-0 md:h-full md:w-auto">
          <VideoLearningSidebar
            video={video}
            activeLineIndex={activeTranscriptIndex}
            lineRefs={transcriptLineRefs}
            panelRef={transcriptPanelRef}
            settings={settings}
            learning={learning}
            videoVocabulary={videoVocabulary}
            onSaveVocabulary={onSaveVocabulary}
            onDeleteVocabulary={onDeleteVocabulary}
            onSeekLine={seekToLine}
            onSeekTime={time => handleSeek(time)}
            onPlayLine={playLearningLine}
            onPause={() => setIsPlaying(false)}
            onLoopLine={loopSpecificLine}
            practiceShortcut={practiceShortcut}
          />
        </div>
      </div>
    </div>
  );
}
