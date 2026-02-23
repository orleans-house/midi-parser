import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyFreqShiftToActive, pausePlayback, resumePlayback, stopPlayback } from '../../js/audio-engine.js';
import state from '../../js/state/audioState.js';
import { createMockAudioContext } from './web-audio-mock.js';

// lucide グローバルモック（DOM操作で呼ばれる）
globalThis.lucide = { createIcons: vi.fn() };

// ============================================================
// applyFreqShiftToActive()
// ============================================================

describe('applyFreqShiftToActive()', () => {
  beforeEach(() => {
    state.scheduledNodes = [];
    window._pitchShift = 0;
    window._freqShift = 0;
    window._scaleConvert = null;
  });

  it('空のscheduledNodesでエラーにならない', () => {
    expect(() => applyFreqShiftToActive()).not.toThrow();
  });

  it('オシレーターノードのfrequencyを更新する', () => {
    const osc = {
      _baseMidi: 69, // A4
      frequency: { value: 0 },
    };
    state.scheduledNodes = [osc];
    applyFreqShiftToActive();
    expect(osc.frequency.value).toBeCloseTo(440, 0);
  });

  it('SF2ノードのplaybackRateを更新する', () => {
    const node = {
      _baseMidi: 60,
      _isSF2: true,
      _rootKey: 60,
      _sampleTuning: 0,
      playbackRate: { value: 1 },
    };
    state.scheduledNodes = [node];
    applyFreqShiftToActive();
    // rootKey == baseMidi, tuning == 0, pitchShift == 0 → rate = 1
    expect(node.playbackRate.value).toBeCloseTo(1, 5);
  });

  it('pitchShiftが反映される（SF2）', () => {
    state._pitchShift = 12;
    const node = {
      _baseMidi: 60,
      _isSF2: true,
      _rootKey: 60,
      _sampleTuning: 0,
      playbackRate: { value: 1 },
    };
    state.scheduledNodes = [node];
    applyFreqShiftToActive();
    // +12 semitones → rate = 2
    expect(node.playbackRate.value).toBeCloseTo(2, 3);
  });

  it('_baseMidiがないノードはスキップする', () => {
    const node = { frequency: { value: 100 } };
    state.scheduledNodes = [node];
    expect(() => applyFreqShiftToActive()).not.toThrow();
    expect(node.frequency.value).toBe(100); // 変更されない
  });
});

// ============================================================
// pausePlayback()
// ============================================================

describe('pausePlayback()', () => {
  beforeEach(() => {
    state.isPlaying = false;
    state.isPaused = false;
    state.audioCtx = null;
  });

  it('再生中でなければ何もしない', () => {
    state.isPlaying = false;
    expect(() => pausePlayback()).not.toThrow();
    expect(state.isPaused).toBe(false);
  });

  it('再生中ならisPausedをtrueにする', () => {
    const ctx = createMockAudioContext();
    state.isPlaying = true;
    state.isPaused = false;
    state.audioCtx = ctx;
    pausePlayback();
    expect(state.isPaused).toBe(true);
    expect(ctx.suspend).toHaveBeenCalled();
  });

  it('既にポーズ中なら何もしない', () => {
    const ctx = createMockAudioContext();
    state.isPlaying = true;
    state.isPaused = true;
    state.audioCtx = ctx;
    pausePlayback();
    expect(ctx.suspend).not.toHaveBeenCalled();
  });
});

// ============================================================
// resumePlayback()
// ============================================================

describe('resumePlayback()', () => {
  beforeEach(() => {
    state.isPlaying = false;
    state.isPaused = false;
    state.audioCtx = null;
    state.pauseDuration = 0;
    state.pauseStartTime = 0;
    state.playbackStartReal = 0;
    state.playbackStartOffset = 0;
    state.currentTotalDuration = 10;
  });

  it('ポーズ中でなければ何もしない', () => {
    state.isPlaying = true;
    state.isPaused = false;
    state.audioCtx = createMockAudioContext();
    expect(() => resumePlayback()).not.toThrow();
  });

  it('ポーズ中ならisPausedをfalseにしてresumeする', () => {
    const ctx = createMockAudioContext();
    state.isPlaying = true;
    state.isPaused = true;
    state.audioCtx = ctx;
    state.pauseStartTime = performance.now() - 1000;
    resumePlayback();
    expect(state.isPaused).toBe(false);
    expect(ctx.resume).toHaveBeenCalled();
    expect(state.pauseDuration).toBeGreaterThan(0);
  });
});

// ============================================================
// stopPlayback()
// ============================================================

describe('stopPlayback()', () => {
  beforeEach(() => {
    state.isPlaying = true;
    state.isPaused = false;
    state.audioCtx = null;
    state.scheduledNodes = [];
    state.audioFileSource = null;
    state.pauseDuration = 100;
    state.pauseStartTime = 100;
  });

  it('isPlayingをfalseにする', () => {
    stopPlayback();
    expect(state.isPlaying).toBe(false);
  });

  it('pause関連stateをリセットする', () => {
    stopPlayback();
    expect(state.isPaused).toBe(false);
    expect(state.pauseDuration).toBe(0);
    expect(state.pauseStartTime).toBe(0);
  });

  it('scheduledNodesの全ノードを停止する', () => {
    const osc1 = { stop: vi.fn() };
    const osc2 = { stop: vi.fn() };
    state.scheduledNodes = [osc1, osc2];
    stopPlayback();
    expect(osc1.stop).toHaveBeenCalled();
    expect(osc2.stop).toHaveBeenCalled();
  });

  it('audioFileSourceを停止する', () => {
    const source = { stop: vi.fn() };
    state.audioFileSource = source;
    stopPlayback();
    expect(source.stop).toHaveBeenCalled();
    expect(state.audioFileSource).toBeNull();
  });

  it('audioCtxがあればcloseする', () => {
    const ctx = createMockAudioContext();
    state.audioCtx = ctx;
    stopPlayback();
    expect(ctx.close).toHaveBeenCalled();
  });

  it('再生中でなくてもエラーにならない', () => {
    state.isPlaying = false;
    expect(() => stopPlayback()).not.toThrow();
  });
});
