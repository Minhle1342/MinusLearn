export const AUDIO_FOCUS_EVENT = 'minuslearn:audio-focus';

export function setLearningAudioFocus(source, active) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUDIO_FOCUS_EVENT, {
    detail: { source: source || 'unknown', active: Boolean(active) },
  }));
}
