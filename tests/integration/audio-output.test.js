import { describe, expect, it } from 'vitest';
import { buildOutputChain } from '../../js/audio-output.js';
import state from '../../js/state/audioState.js';
import { createMockAudioContext } from './web-audio-mock.js';

describe('buildOutputChain()', () => {
  it('spectrumAnalyserとmasterAnalyserを生成する', () => {
    const ctx = createMockAudioContext();
    const eqOut = ctx.createGain();
    buildOutputChain(ctx, eqOut);
    expect(state._spectrumAnalyser).toBeDefined();
    expect(state._masterAnalyser).toBeDefined();
  });

  it('createAnalyserを2回呼ぶ', () => {
    const ctx = createMockAudioContext();
    const eqOut = ctx.createGain();
    buildOutputChain(ctx, eqOut);
    expect(ctx.createAnalyser).toHaveBeenCalledTimes(2);
  });

  it('eqOutからspectrumAnalyserとmasterAnalyserに接続する', () => {
    const ctx = createMockAudioContext();
    const eqOut = ctx.createGain();
    buildOutputChain(ctx, eqOut);
    // eqOut.connect が呼ばれている
    expect(eqOut.connect).toHaveBeenCalledTimes(2);
  });

  it('masterAnalyserからdestinationに接続する', () => {
    const ctx = createMockAudioContext();
    const eqOut = ctx.createGain();
    buildOutputChain(ctx, eqOut);
    expect(state._masterAnalyser.connect).toHaveBeenCalledWith(ctx.destination);
  });
});
