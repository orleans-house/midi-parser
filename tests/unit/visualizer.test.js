import { describe, expect, it } from 'vitest';
import { CHANNEL_COLORS, detectChannels, getChannelColor } from '../../js/visualizer.js';

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
