import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pauseAudioFile, resumeAudioFile } from '../../js/audio-file-engine.js';
import state from '../../js/state/audioState.js';
import { createMockAudioContext } from './web-audio-mock.js';

globalThis.lucide = { createIcons: vi.fn() };

describe('pauseAudioFile()', () => {
  beforeEach(() => {
    state.isPlaying = false;
    state.isPaused = false;
    state.audioCtx = null;
    state.audioFileMode = false;
  });

  it('再生中でなければ何もしない', () => {
    expect(() => pauseAudioFile()).not.toThrow();
    expect(state.isPaused).toBe(false);
  });

  it('audioFileModeでなければ何もしない', () => {
    const ctx = createMockAudioContext();
    state.isPlaying = true;
    state.audioCtx = ctx;
    state.audioFileMode = false;
    pauseAudioFile();
    expect(state.isPaused).toBe(false);
  });

  it('再生中＋audioFileModeならisPausedをtrueにしてsuspendする', () => {
    const ctx = createMockAudioContext();
    ctx.currentTime = 5;
    state.isPlaying = true;
    state.isPaused = false;
    state.audioCtx = ctx;
    state.audioFileMode = true;
    pauseAudioFile();
    expect(state.isPaused).toBe(true);
    expect(ctx.suspend).toHaveBeenCalled();
  });
});

describe('resumeAudioFile()', () => {
  beforeEach(() => {
    state.isPlaying = false;
    state.isPaused = false;
    state.audioCtx = null;
    state.audioFileMode = false;
    state.pauseDuration = 0;
    state.pauseStartTime = 0;
    state.playbackStartReal = performance.now() - 5000;
    state.playbackStartOffset = 0;
    state.currentTotalDuration = 60;
  });

  it('ポーズ中でなければ何もしない', () => {
    expect(() => resumeAudioFile()).not.toThrow();
  });

  it('ポーズ中＋audioFileModeならisPausedをfalseにしてresumeする', () => {
    const ctx = createMockAudioContext();
    state.isPlaying = true;
    state.isPaused = true;
    state.audioCtx = ctx;
    state.audioFileMode = true;
    state.pauseStartTime = performance.now() - 500;
    resumeAudioFile();
    expect(state.isPaused).toBe(false);
    expect(ctx.resume).toHaveBeenCalled();
  });
});
