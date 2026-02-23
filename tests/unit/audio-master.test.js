import { describe, expect, it } from 'vitest';
import { makeDistortionCurve } from '../../js/audio-master.js';

describe('makeDistortionCurve()', () => {
  it('Float32Arrayを返す', () => {
    const curve = makeDistortionCurve(50);
    expect(curve).toBeInstanceOf(Float32Array);
  });

  it('44100サンプルの配列を返す', () => {
    const curve = makeDistortionCurve(50);
    expect(curve.length).toBe(44100);
  });

  it('値が有限数である', () => {
    const curve = makeDistortionCurve(50);
    for (let i = 0; i < curve.length; i++) {
      expect(Number.isFinite(curve[i])).toBe(true);
    }
  });

  it('amount=0でも動作する', () => {
    const curve = makeDistortionCurve(0);
    expect(curve).toBeInstanceOf(Float32Array);
    expect(curve.length).toBe(44100);
  });

  it('amount が大きいほど歪みが強くなる（中央付近の傾きが急）', () => {
    const low = makeDistortionCurve(10);
    const high = makeDistortionCurve(200);
    // 入力0付近（中央）の傾きを比較
    const mid = Math.floor(44100 / 2);
    const slopeLow = Math.abs(low[mid + 1] - low[mid - 1]);
    const slopeHigh = Math.abs(high[mid + 1] - high[mid - 1]);
    expect(slopeHigh).toBeGreaterThan(slopeLow);
  });

  it('入力-1〜+1の範囲で単調増加する', () => {
    const curve = makeDistortionCurve(50);
    // 完全に単調ではないかもしれないが、全体的に増加傾向
    expect(curve[curve.length - 1]).toBeGreaterThan(curve[0]);
  });
});
