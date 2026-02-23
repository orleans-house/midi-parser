import { describe, expect, it } from 'vitest';
import { clearSF2BufferCache, getSF2AudioBuffer } from '../../js/sf2-parser.js';
import { createMockAudioContext } from './web-audio-mock.js';

describe('getSF2AudioBuffer()', () => {
  it('AudioBufferを返す', () => {
    clearSF2BufferCache();
    const ctx = createMockAudioContext();
    const sf2 = { sdta: new Float32Array(1000) };
    const shdr = { name: 'Test', start: 0, end: 100, sampleRate: 44100 };
    const result = getSF2AudioBuffer(ctx, sf2, shdr);
    expect(result).toBeDefined();
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 100, 44100);
  });

  it('キャッシュが効く', () => {
    clearSF2BufferCache();
    const ctx = createMockAudioContext();
    const sf2 = { sdta: new Float32Array(1000) };
    const shdr = { name: 'Cached', start: 0, end: 50, sampleRate: 44100 };
    const r1 = getSF2AudioBuffer(ctx, sf2, shdr);
    const r2 = getSF2AudioBuffer(ctx, sf2, shdr);
    expect(r1).toBe(r2);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
  });

  it('サンプル長が0以下ならnullを返す', () => {
    clearSF2BufferCache();
    const ctx = createMockAudioContext();
    const sf2 = { sdta: new Float32Array(100) };
    const shdr = { name: 'Empty', start: 50, end: 50, sampleRate: 44100 };
    expect(getSF2AudioBuffer(ctx, sf2, shdr)).toBeNull();
  });

  it('sdtaがnullならnullを返す', () => {
    clearSF2BufferCache();
    const ctx = createMockAudioContext();
    const sf2 = { sdta: null };
    const shdr = { name: 'NoData', start: 0, end: 100, sampleRate: 44100 };
    expect(getSF2AudioBuffer(ctx, sf2, shdr)).toBeNull();
  });
});
