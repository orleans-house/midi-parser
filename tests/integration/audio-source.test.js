import { describe, expect, it } from 'vitest';
import { buildMetronome, createMetroClick } from '../../js/audio-source.js';
import { createMockAudioContext } from './web-audio-mock.js';

// ============================================================
// buildMetronome()
// ============================================================

describe('buildMetronome()', () => {
  it('GainNodeを返す', () => {
    const ctx = createMockAudioContext();
    const dest = ctx.createGain();
    const result = buildMetronome(ctx, dest);
    expect(result).toBeDefined();
    expect(result.gain).toBeDefined();
  });

  it('destinationに接続する', () => {
    const ctx = createMockAudioContext();
    const dest = ctx.createGain();
    const result = buildMetronome(ctx, dest);
    expect(result.connect).toHaveBeenCalledWith(dest);
  });
});

// ============================================================
// createMetroClick()
// ============================================================

describe('createMetroClick()', () => {
  it.each(['click', 'wood', 'rim', 'beep'])('type="%s" でオシレーターを生成する', (type) => {
    const ctx = createMockAudioContext();
    const gain = ctx.createGain();
    expect(() => createMetroClick(ctx, gain, 0, false, type)).not.toThrow();
    expect(ctx.createOscillator).toHaveBeenCalled();
  });

  it('type="hihat" でノイズバッファを生成する', () => {
    const ctx = createMockAudioContext();
    const gain = ctx.createGain();
    expect(() => createMetroClick(ctx, gain, 0, false, 'hihat')).not.toThrow();
    expect(ctx.createBufferSource).toHaveBeenCalled();
    expect(ctx.createBuffer).toHaveBeenCalled();
  });

  it('アクセント時は周波数が高い（clickタイプ）', () => {
    const ctx1 = createMockAudioContext();
    const gain1 = ctx1.createGain();
    createMetroClick(ctx1, gain1, 0, true, 'click');

    const ctx2 = createMockAudioContext();
    const gain2 = ctx2.createGain();
    createMetroClick(ctx2, gain2, 0, false, 'click');

    // アクセント: 1200Hz, 非アクセント: 800Hz
    const oscAccent = ctx1.createOscillator.mock.results[0].value;
    const oscNormal = ctx2.createOscillator.mock.results[0].value;
    expect(oscAccent.frequency.value).toBeGreaterThan(oscNormal.frequency.value);
  });
});
