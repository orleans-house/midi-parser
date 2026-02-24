import { describe, expect, it } from 'vitest';
import { isAudioFile } from '../../src/js/app.js';

describe('isAudioFile()', () => {
  it.each([
    'song.wav',
    'song.mp3',
    'song.ogg',
    'song.flac',
    'song.aac',
    'song.m4a',
    'song.webm',
  ])('%s はオーディオファイル', (name) => {
    expect(isAudioFile(name)).toBe(true);
  });

  it.each(['song.mid', 'song.midi', 'song.txt', 'song.pdf', 'song.js'])('%s はオーディオファイルではない', (name) => {
    expect(isAudioFile(name)).toBe(false);
  });

  it('大文字拡張子でも判定できる', () => {
    expect(isAudioFile('SONG.WAV')).toBe(true);
    expect(isAudioFile('SONG.MP3')).toBe(true);
  });

  it('ドットを含むファイル名でも最後の拡張子で判定', () => {
    expect(isAudioFile('my.song.mp3')).toBe(true);
    expect(isAudioFile('my.song.mid')).toBe(false);
  });
});
