import { describe, expect, it } from 'vitest';
import { clearLoopTimer } from '../../js/dj-controls.js';

describe('clearLoopTimer()', () => {
  it('呼び出してもエラーにならない', () => {
    expect(() => clearLoopTimer()).not.toThrow();
  });

  it('連続呼び出ししてもエラーにならない', () => {
    clearLoopTimer();
    clearLoopTimer();
    clearLoopTimer();
  });
});
