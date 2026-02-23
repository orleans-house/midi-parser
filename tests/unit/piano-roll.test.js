import { describe, expect, it } from 'vitest';
import { invalidatePianoRollCache } from '../../js/piano-roll.js';

describe('invalidatePianoRollCache()', () => {
  it('呼び出してもエラーにならない', () => {
    expect(() => invalidatePianoRollCache()).not.toThrow();
  });

  it('連続呼び出ししてもエラーにならない', () => {
    invalidatePianoRollCache();
    invalidatePianoRollCache();
  });
});
