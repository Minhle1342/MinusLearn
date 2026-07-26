import { setLearningAudioFocus } from './audioFocus';


let activeSpeechSource = null;
let speechSequence = 0;


function scoreEnglishVoice(voice) {
  const searchableText = `${voice.name} ${voice.voiceURI} ${voice.lang}`.toLowerCase();
  let score = 0;

  if (voice.default) score += 100;
  if (searchableText.includes('microsoft')) score += 40;
  if (searchableText.includes('edge')) score += 20;
  if (voice.lang?.toLowerCase() === 'en-us') score += 10;
  if (voice.lang?.toLowerCase() === 'en-gb') score += 8;

  return score;
}

export function isEnglishVoice(voice) {
  return Boolean(voice?.lang?.toLowerCase().startsWith('en'));
}

export function getEnglishVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis?.getVoices) {
    return [];
  }

  return window.speechSynthesis
    .getVoices()
    .filter(isEnglishVoice)
    .sort((a, b) => scoreEnglishVoice(b) - scoreEnglishVoice(a) || a.name.localeCompare(b.name));
}

export function getVoicesForLanguage(language) {
  if (typeof window === 'undefined' || !window.speechSynthesis?.getVoices) return [];
  const prefix = language === 'en' ? 'en' : 'vi';
  return window.speechSynthesis
    .getVoices()
    .filter(voice => voice?.lang?.toLowerCase().startsWith(prefix))
    .sort((a, b) => {
      const aScore = (a.default ? 100 : 0) + (/microsoft|edge/i.test(`${a.name} ${a.voiceURI}`) ? 30 : 0);
      const bScore = (b.default ? 100 : 0) + (/microsoft|edge/i.test(`${b.name} ${b.voiceURI}`) ? 30 : 0);
      return bScore - aScore || a.name.localeCompare(b.name);
    });
}

export function getSelectedVoiceForLanguage(language, voiceURI) {
  const voices = getVoicesForLanguage(language);
  return voices.find(voice => voice.voiceURI === voiceURI) || voices[0] || null;
}

export function getSelectedEnglishVoice(voiceURI) {
  const voices = getEnglishVoices();
  if (!voices.length) {
    return null;
  }

  return voices.find(voice => voice.voiceURI === voiceURI) || voices[0];
}

export function speakEnglishText(text, voiceURI, options = {}) {
  return speakText(text, 'en', voiceURI, options);
}

export function speakText(text, language, voiceURI, options = {}) {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  const selectedVoice = getSelectedVoiceForLanguage(language, voiceURI);

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  } else {
    utterance.lang = language === 'en' ? 'en-US' : 'vi-VN';
  }

  utterance.rate = options.rate ?? (language === 'en' ? 0.9 : 1);
  utterance.pitch = options.pitch ?? 1;

  if (activeSpeechSource) setLearningAudioFocus(activeSpeechSource, false);
  window.speechSynthesis.cancel();
  const source = `lesson-speech-${++speechSequence}`;
  activeSpeechSource = source;
  setLearningAudioFocus(source, true);
  const releaseFocus = () => {
    setLearningAudioFocus(source, false);
    if (activeSpeechSource === source) activeSpeechSource = null;
  };
  utterance.onend = releaseFocus;
  utterance.onerror = releaseFocus;
  window.speechSynthesis.speak(utterance);
  return true;
}
