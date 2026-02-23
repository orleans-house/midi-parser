import { describe, expect, it } from 'vitest';
import { CUSTOM_WAVEFORMS, clearPeriodicWaveCache, isCustomWaveform } from '../../js/waveforms.js';

// ============================================================
// CUSTOM_WAVEFORMS 定義の整合性
// ============================================================

describe('CUSTOM_WAVEFORMS', () => {
  it('10種類の波形が定義されている', () => {
    expect(Object.keys(CUSTOM_WAVEFORMS)).toHaveLength(10);
  });

  it('全波形にlabel, real, imagが定義されている', () => {
    for (const [name, def] of Object.entries(CUSTOM_WAVEFORMS)) {
      expect(def).toHaveProperty('label');
      expect(def).toHaveProperty('real');
      expect(def).toHaveProperty('imag');
      expect(typeof def.label).toBe('string');
      expect(Array.isArray(def.real)).toBe(true);
      expect(Array.isArray(def.imag)).toBe(true);
    }
  });

  it('real と imag の配列長が一致する', () => {
    for (const [name, def] of Object.entries(CUSTOM_WAVEFORMS)) {
      expect(def.real.length).toBe(def.imag.length);
    }
  });

  it('DCオフセット（0番目）が常に0', () => {
    for (const [name, def] of Object.entries(CUSTOM_WAVEFORMS)) {
      expect(def.real[0]).toBe(0);
      expect(def.imag[0]).toBe(0);
    }
  });

  it('配列長が2以上（基音を含む）', () => {
    for (const def of Object.values(CUSTOM_WAVEFORMS)) {
      expect(def.real.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ============================================================
// isCustomWaveform()
// ============================================================

describe('isCustomWaveform()', () => {
  it('カスタム波形名でtrueを返す', () => {
    for (const name of Object.keys(CUSTOM_WAVEFORMS)) {
      expect(isCustomWaveform(name)).toBe(true);
    }
  });

  it('標準波形名でfalseを返す', () => {
    expect(isCustomWaveform('sine')).toBe(false);
    expect(isCustomWaveform('square')).toBe(false);
    expect(isCustomWaveform('sawtooth')).toBe(false);
    expect(isCustomWaveform('triangle')).toBe(false);
  });

  it('未定義の名前でfalseを返す', () => {
    expect(isCustomWaveform('nonexistent')).toBe(false);
    expect(isCustomWaveform('')).toBe(false);
  });
});

// ============================================================
// clearPeriodicWaveCache()
// ============================================================

describe('clearPeriodicWaveCache()', () => {
  it('呼び出してもエラーにならない', () => {
    expect(() => clearPeriodicWaveCache()).not.toThrow();
  });
});
