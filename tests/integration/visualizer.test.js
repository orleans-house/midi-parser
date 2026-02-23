import { beforeEach, describe, expect, it } from 'vitest';
import state from '../../js/state/audioState.js';
import { updateChannelGains } from '../../js/visualizer.js';

describe('updateChannelGains()', () => {
  beforeEach(() => {
    state.channelStates = {
      0: { gainNode: { gain: { value: 0 } }, waveGain: 0.8, playGate: 1, muted: false, soloed: false },
      1: { gainNode: { gain: { value: 0 } }, waveGain: 0.6, playGate: 1, muted: false, soloed: false },
      2: { gainNode: { gain: { value: 0 } }, waveGain: 1.0, playGate: 1, muted: true, soloed: false },
    };
  });

  it('ミュートされたチャンネルのplayGateを0にする', () => {
    updateChannelGains();
    expect(state.channelStates[2].playGate).toBe(0);
    expect(state.channelStates[2].gainNode.gain.value).toBe(0);
  });

  it('ミュートされていないチャンネルのplayGateは1', () => {
    updateChannelGains();
    expect(state.channelStates[0].playGate).toBe(1);
    expect(state.channelStates[0].gainNode.gain.value).toBeCloseTo(0.8, 5);
  });

  it('ソロ中は他のチャンネルがミュートされる', () => {
    state.channelStates[0].soloed = true;
    updateChannelGains();
    expect(state.channelStates[0].playGate).toBe(1);
    expect(state.channelStates[1].playGate).toBe(0);
    expect(state.channelStates[2].playGate).toBe(0); // ミュート+非ソロ
  });

  it('ソロかつミュートのチャンネルはミュートが優先', () => {
    state.channelStates[0].soloed = true;
    state.channelStates[0].muted = true;
    updateChannelGains();
    expect(state.channelStates[0].playGate).toBe(0);
  });

  it('gainNodeがないチャンネルでもエラーにならない', () => {
    state.channelStates[3] = { muted: false, soloed: false };
    expect(() => updateChannelGains()).not.toThrow();
  });
});
