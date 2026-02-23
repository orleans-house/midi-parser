import { describe, expect, it } from 'vitest';
import { applyWaveform, clearPeriodicWaveCache, getPeriodicWave } from '../../js/waveforms.js';
import { createMockAudioContext } from './web-audio-mock.js';

describe('getPeriodicWave()', () => {
  it('有効な波形名でPeriodicWaveオブジェクトを返す', () => {
    clearPeriodicWaveCache();
    const ctx = createMockAudioContext();
    const pw = getPeriodicWave(ctx, 'organ');
    expect(pw).toBeDefined();
    expect(ctx.createPeriodicWave).toHaveBeenCalled();
  });

  it('同じ波形名で2回目はキャッシュを返す', () => {
    clearPeriodicWaveCache();
    const ctx = createMockAudioContext();
    const pw1 = getPeriodicWave(ctx, 'piano');
    const pw2 = getPeriodicWave(ctx, 'piano');
    expect(pw1).toBe(pw2);
    // createPeriodicWaveは1回だけ呼ばれる
    expect(ctx.createPeriodicWave).toHaveBeenCalledTimes(1);
  });

  it('存在しない波形名でnullを返す', () => {
    const ctx = createMockAudioContext();
    const pw = getPeriodicWave(ctx, 'nonexistent');
    expect(pw).toBeNull();
  });

  it('clearPeriodicWaveCache後は再生成する', () => {
    clearPeriodicWaveCache();
    const ctx = createMockAudioContext();
    getPeriodicWave(ctx, 'flute');
    clearPeriodicWaveCache();
    getPeriodicWave(ctx, 'flute');
    expect(ctx.createPeriodicWave).toHaveBeenCalledTimes(2);
  });
});

describe('applyWaveform()', () => {
  it('カスタム波形名でsetPeriodicWaveを呼ぶ', () => {
    clearPeriodicWaveCache();
    const ctx = createMockAudioContext();
    const osc = ctx.createOscillator();
    applyWaveform(osc, 'organ', ctx);
    expect(osc.setPeriodicWave).toHaveBeenCalled();
  });

  it('標準波形名でtypeを設定する', () => {
    const ctx = createMockAudioContext();
    const osc = ctx.createOscillator();
    applyWaveform(osc, 'sawtooth', ctx);
    expect(osc.type).toBe('sawtooth');
  });
});
