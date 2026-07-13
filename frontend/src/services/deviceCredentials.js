const DEVICE_CREDENTIALS_KEY = 'minuslearn_device_credentials';
const LEGACY_SETTINGS_KEY = 'minuslearn_settings';
export const SENSITIVE_SETTING_KEYS = ['apiKey', 'pixabayApiKey', 'unsplashApiKey', 'pexelsApiKey'];

function parseObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getDeviceCredentials() {
  const current = parseObject(window.localStorage.getItem(DEVICE_CREDENTIALS_KEY));
  if (Object.keys(current).length > 0) return current;
  const legacy = parseObject(window.localStorage.getItem(LEGACY_SETTINGS_KEY));
  return Object.fromEntries(
    SENSITIVE_SETTING_KEYS.filter(key => legacy[key]).map(key => [key, legacy[key]])
  );
}

export function saveDeviceCredentials(settings) {
  const credentials = Object.fromEntries(
    SENSITIVE_SETTING_KEYS.map(key => [key, settings?.[key] || ''])
  );
  window.localStorage.setItem(DEVICE_CREDENTIALS_KEY, JSON.stringify(credentials));
  return credentials;
}

export function sanitizeRemoteSettings(settings) {
  return Object.fromEntries(
    Object.entries(settings || {}).filter(([key]) => !SENSITIVE_SETTING_KEYS.includes(key))
  );
}

