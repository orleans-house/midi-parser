import { describe, expect, it } from 'vitest';
import { applyChannelGain, CHANNEL_COLORS, detectChannels, getChannelColor } from '../../src/js/visualizer.js';

describe('getChannelColor()', () => {
  it('チャンネル0で最初の色を返す', () => {
    expect(getChannelColor(0)).toBe(CHANNEL_COLORS[0]);
  });

  it('範囲外のチャンネルでもラップアラウンドする', () => {
    const len = CHANNEL_COLORS.length;
    expect(getChannelColor(len)).toBe(CHANNEL_COLORS[0]);
    expect(getChannelColor(len + 1)).toBe(CHANNEL_COLORS[1]);
  });

  it('全チャンネル(0-15)で文字列を返す', () => {
    for (let ch = 0; ch < 16; ch++) {
      expect(typeof getChannelColor(ch)).toBe('string');
      expect(getChannelColor(ch)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('detectChannels()', () => {
  it('ノート配列からユニークなチャンネル番号を抽出する', () => {
    const notes = [
      { channel: 0, note: 60 },
      { channel: 2, note: 72 },
      { channel: 0, note: 64 },
      { channel: 5, note: 48 },
    ];
    expect(detectChannels(notes)).toEqual([0, 2, 5]);
  });

  it('空配列で空配列を返す', () => {
    expect(detectChannels([])).toEqual([]);
  });

  it('結果は昇順ソートされる', () => {
    const notes = [
      { channel: 9, note: 36 },
      { channel: 1, note: 60 },
      { channel: 5, note: 48 },
    ];
    const result = detectChannels(notes);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1]);
    }
  });

  it('単一チャンネルのノートで1要素の配列を返す', () => {
    const notes = [
      { channel: 3, note: 60 },
      { channel: 3, note: 72 },
    ];
    expect(detectChannels(notes)).toEqual([3]);
  });
});

describe('applyChannelGain()', () => {
  it('waveGain × playGate を gainNode に設定する', () => {
    const chState = {
      gainNode: { gain: { value: 0 } },
      waveGain: 0.8,
      playGate: 0.5,
    };
    applyChannelGain(chState);
    expect(chState.gainNode.gain.value).toBeCloseTo(0.4, 5);
  });

  it('waveGain 未設定時はデフォルト1として計算する', () => {
    const chState = {
      gainNode: { gain: { value: 0 } },
      playGate: 0.5,
    };
    applyChannelGain(chState);
    expect(chState.gainNode.gain.value).toBeCloseTo(0.5, 5);
  });

  it('playGate 未設定時はデフォルト1として計算する', () => {
    const chState = {
      gainNode: { gain: { value: 0 } },
      waveGain: 0.7,
    };
    applyChannelGain(chState);
    expect(chState.gainNode.gain.value).toBeCloseTo(0.7, 5);
  });

  it('gainNode がない場合はエラーにならない', () => {
    const chState = { waveGain: 1, playGate: 1 };
    expect(() => applyChannelGain(chState)).not.toThrow();
  });

  it('両方未設定時は1になる', () => {
    const chState = {
      gainNode: { gain: { value: 0 } },
    };
    applyChannelGain(chState);
    expect(chState.gainNode.gain.value).toBeCloseTo(1, 5);
  });
});
