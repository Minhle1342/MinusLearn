import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, 'speechSynthesis', {
  configurable: true,
  value: { speak: vi.fn(), cancel: vi.fn() },
});

globalThis.SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
  constructor(text) { this.text = text; this.lang = ''; }
};

URL.createObjectURL = vi.fn(() => 'blob:test');
URL.revokeObjectURL = vi.fn();
HTMLElement.prototype.scrollTo = vi.fn();
