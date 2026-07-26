import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AUDIO_FOCUS_EVENT } from '../utils/audioFocus';


const AudioFocusContext = createContext({ isLearningAudioActive: false, activeSources: [] });


export function AudioFocusProvider({ children }) {
  const [sources, setSources] = useState(() => new Set());

  useEffect(() => {
    const handleFocus = event => {
      const source = event.detail?.source || 'unknown';
      const active = Boolean(event.detail?.active);
      setSources(current => {
        const next = new Set(current);
        if (active) next.add(source);
        else next.delete(source);
        return next;
      });
    };
    window.addEventListener(AUDIO_FOCUS_EVENT, handleFocus);
    return () => window.removeEventListener(AUDIO_FOCUS_EVENT, handleFocus);
  }, []);

  const value = useMemo(() => ({
    isLearningAudioActive: sources.size > 0,
    activeSources: [...sources],
  }), [sources]);

  return <AudioFocusContext.Provider value={value}>{children}</AudioFocusContext.Provider>;
}


export function useAudioFocus() {
  return useContext(AudioFocusContext);
}
