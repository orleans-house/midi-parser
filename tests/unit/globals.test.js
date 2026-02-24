import { describe, expect, it } from 'vitest';
import { FREQ_MAX, FREQ_MIN, freqToSlider, getChannelFx, sliderToFreq } from '../../src/js/globals.js';

// ============================================================
// sliderToFreq() / freqToSlider()
// ============================================================

describe('sliderToFreq()', () => {
  it('スライダー0で最低周波数(20Hz)', () => {
    expect(sliderToFreq(0)).toBeCloseTo(FREQ_MIN, 5);
  });

  it('スライダー100で最高周波数(20000Hz)', () => {
    expect(sliderToFreq(100)).toBeCloseTo(FREQ_MAX, 0);
  });

  it('スライダー50で中間値（対数スケール）', () => {
    const mid = sliderToFreq(50);
    // 対数中間 = sqrt(20 * 20000) ≈ 632.46
    expect(mid).toBeCloseTo(Math.sqrt(FREQ_MIN * FREQ_MAX), 0);
  });

  it('単調増加する', () => {
    let prev = 0;
    for (let v = 0; v <= 100; v += 10) {
      const freq = sliderToFreq(v);
      expect(freq).toBeGreaterThanOrEqual(prev);
      prev = freq;
    }
  });
});

describe('freqToSlider()', () => {
  it('最低周波数でスライダー0', () => {
    expect(freqToSlider(FREQ_MIN)).toBeCloseTo(0, 5);
  });

  it('最高周波数でスライダー100', () => {
    expect(freqToSlider(FREQ_MAX)).toBeCloseTo(100, 5);
  });
});

describe('sliderToFreq ↔ freqToSlider 往復', () => {
  it.each([0, 10, 25, 50, 75, 90, 100])('スライダー%iの往復', (val) => {
    expect(freqToSlider(sliderToFreq(val))).toBeCloseTo(val, 5);
  });

  it.each([20, 100, 440, 1000, 5000, 20000])('周波数%iHzの往復', (freq) => {
    expect(sliderToFreq(freqToSlider(freq))).toBeCloseTo(freq, 2);
  });
});

// ============================================================
// getChannelFx()
// ============================================================

describe('getChannelFx()', () => {
  it('初回呼び出しでデフォルト値を生成する', () => {
    const fx = getChannelFx(99); // 未使用チャンネル
    expect(fx).toMatchObject({
      waveType: 'triangle',
      distortion: { enabled: false, amount: 50 },
      delay: { enabled: false, time: 300 },
      reverb: { enabled: false, mix: 40 },
    });
  });

  it('同一チャンネルで同じオブジェクトを返す', () => {
    const a = getChannelFx(98);
    const b = getChannelFx(98);
    expect(a).toBe(b);
  });

  it('異なるチャンネルで異なるオブジェクトを返す', () => {
    const a = getChannelFx(96);
    const b = getChannelFx(97);
    expect(a).not.toBe(b);
  });

  it('状態を変更しても保持される', () => {
    const fx = getChannelFx(95);
    fx.waveType = 'sine';
    expect(getChannelFx(95).waveType).toBe('sine');
  });
});
