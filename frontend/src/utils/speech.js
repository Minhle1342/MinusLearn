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
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return [];
  }

  return window.speechSynthesis
    .getVoices()
    .filter(isEnglishVoice)
    .sort((a, b) => scoreEnglishVoice(b) - scoreEnglishVoice(a) || a.name.localeCompare(b.name));
}

export function getSelectedEnglishVoice(voiceURI) {
  const voices = getEnglishVoices();
  if (!voices.length) {
    return null;
  }

  return voices.find(voice => voice.voiceURI === voiceURI) || voices[0];
}

export function speakEnglishText(text, voiceURI, options = {}) {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  const selectedVoice = getSelectedEnglishVoice(voiceURI);

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  } else {
    utterance.lang = 'en-US';
  }

  utterance.rate = options.rate ?? 0.9;
  utterance.pitch = options.pitch ?? 1;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}
