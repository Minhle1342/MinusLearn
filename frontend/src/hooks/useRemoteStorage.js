import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../services/backendApi';
import {
  getDeviceCredentials,
  sanitizeRemoteSettings,
  saveDeviceCredentials,
} from '../services/deviceCredentials';


const STUDY_FIELDS = {
  minuslearn_sr_data: 'srData',
  minuslearn_mistakes: 'listeningMistakes',
  minuslearn_reading_mistakes: 'readingMistakes',
  minuslearn_speaking_mistakes: 'speakingMistakes',
  minuslearn_academic_calendar: 'academicCalendar',
};

async function loadValue(key) {
  if (key === 'minuslearn_topics') return apiRequest('/api/topics');
  if (key === 'minuslearn_video_topics') return apiRequest('/api/video-topics');
  if (key === 'minuslearn_words') return apiRequest('/api/words');
  if (key === 'minuslearn_videos') return apiRequest('/api/videos');
  if (key === 'minuslearn_settings') {
    const result = await apiRequest('/api/settings');
    return { ...result.settings, ...getDeviceCredentials() };
  }
  if (key === 'minuslearn_view_mode') {
    const result = await apiRequest('/api/settings');
    return result.viewMode;
  }
  if (STUDY_FIELDS[key]) {
    const result = await apiRequest('/api/study-state');
    return result[STUDY_FIELDS[key]];
  }
  throw new Error(`Unsupported remote storage key: ${key}`);
}

async function persistValue(key, value) {
  if (key === 'minuslearn_topics') return apiRequest('/api/topics', { method: 'PUT', body: value });
  if (key === 'minuslearn_video_topics') return apiRequest('/api/video-topics', { method: 'PUT', body: value });
  if (key === 'minuslearn_words') return apiRequest('/api/words', { method: 'PUT', body: value });
  if (key === 'minuslearn_videos') return apiRequest('/api/videos', { method: 'PUT', body: value });
  if (key === 'minuslearn_settings') {
    saveDeviceCredentials(value);
    return apiRequest('/api/settings', { method: 'PUT', body: { settings: sanitizeRemoteSettings(value) } });
  }
  if (key === 'minuslearn_view_mode') {
    return apiRequest('/api/settings', { method: 'PUT', body: { viewMode: value } });
  }
  if (STUDY_FIELDS[key]) {
    return apiRequest('/api/study-state', { method: 'PUT', body: { [STUDY_FIELDS[key]]: value } });
  }
  throw new Error(`Unsupported remote storage key: ${key}`);
}

export function useRemoteStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const valueRef = useRef(initialValue);
  const writeQueueRef = useRef(Promise.resolve());
  const writeVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadValue(key)
      .then(value => {
        if (!cancelled) {
          const loadedValue = key === 'minuslearn_settings'
            ? { ...initialValue, ...(value || {}) }
            : value ?? initialValue;
          valueRef.current = loadedValue;
          setStoredValue(loadedValue);
        }
      })
      .catch(requestError => {
        if (!cancelled) setError(requestError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [key]);

  const setValue = useCallback(value => {
    const previousValue = valueRef.current;
    const nextValue = value instanceof Function ? value(previousValue) : value;
    const writeVersion = ++writeVersionRef.current;
    valueRef.current = nextValue;
    setStoredValue(nextValue);
    setError(null);

    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(() => persistValue(key, nextValue))
      .then(() => {
        if (writeVersion === writeVersionRef.current) setError(null);
      })
      .catch(requestError => {
        if (writeVersion === writeVersionRef.current) {
          valueRef.current = previousValue;
          setStoredValue(previousValue);
        }
        setError(requestError);
        throw requestError;
      });

    return writeQueueRef.current;
  }, [key]);

  const updateLocalValue = useCallback(value => {
    const nextValue = value instanceof Function ? value(valueRef.current) : value;
    valueRef.current = nextValue;
    setStoredValue(nextValue);
    return nextValue;
  }, []);

  return [storedValue, setValue, { loading, error, updateLocalValue }];
}
