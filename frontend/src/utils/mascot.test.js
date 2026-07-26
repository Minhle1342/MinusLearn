import { beforeEach, describe, expect, it } from 'vitest';
import {
  MASCOT_POSITION_KEY,
  clampMascotPosition,
  randomMascotDelay,
  readMascotPosition,
  snapMascotPosition,
} from './mascot';


describe('mascot positioning and scheduling', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps timed check-ins between three and five minutes', () => {
    expect(randomMascotDelay(() => 0)).toBe(180000);
    expect(randomMascotDelay(() => 1)).toBe(300000);
  });

  it('clamps and snaps the mascot to the nearest viewport edge', () => {
    expect(clampMascotPosition({ x: -20, y: 999 }, 400, 700, { width: 92, height: 150 }))
      .toEqual({ x: 12, y: 538 });
    expect(snapMascotPosition({ x: 260, y: 200 }, 400, 700, { width: 92, height: 150 }))
      .toEqual({ x: 296, y: 200 });
  });

  it('falls back safely when the device-local position is corrupt', () => {
    window.localStorage.setItem(MASCOT_POSITION_KEY, '{bad json');
    expect(readMascotPosition(400, 700)).toEqual({ x: 296, y: 526 });
  });
});
