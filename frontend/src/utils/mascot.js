export const MASCOT_POSITION_KEY = 'minuslearn_mino_position';
export const MASCOT_DRAG_THRESHOLD = 6;

export const MASCOT_EMOTION_COLUMNS = {
  neutral: 0,
  happy: 1,
  excited: 2,
  thinking: 3,
  confused: 4,
  concerned: 5,
  proud: 6,
};

export function randomMascotDelay(random = Math.random) {
  return 180000 + Math.floor(random() * 120000);
}

export function defaultMascotPosition(viewportWidth, viewportHeight) {
  return {
    x: Math.max(12, viewportWidth - 104),
    y: Math.max(64, viewportHeight - 174),
  };
}

export function clampMascotPosition(position, viewportWidth, viewportHeight, size = { width: 92, height: 150 }) {
  return {
    x: Math.min(Math.max(12, position.x), Math.max(12, viewportWidth - size.width - 12)),
    y: Math.min(Math.max(64, position.y), Math.max(64, viewportHeight - size.height - 12)),
  };
}

export function snapMascotPosition(position, viewportWidth, viewportHeight, size) {
  const clamped = clampMascotPosition(position, viewportWidth, viewportHeight, size);
  return {
    ...clamped,
    x: clamped.x + size.width / 2 < viewportWidth / 2
      ? 12
      : Math.max(12, viewportWidth - size.width - 12),
  };
}

export function readMascotPosition(viewportWidth, viewportHeight) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(MASCOT_POSITION_KEY) || 'null');
    if (Number.isFinite(stored?.x) && Number.isFinite(stored?.y)) {
      return clampMascotPosition(stored, viewportWidth, viewportHeight);
    }
  } catch {
    // Ignore device-local position corruption.
  }
  return defaultMascotPosition(viewportWidth, viewportHeight);
}

export function isTextEntryActive(element = document.activeElement) {
  if (!element) return false;
  return element.matches?.('input, textarea, select, [contenteditable="true"]') || false;
}
