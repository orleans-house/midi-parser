import { beforeEach, describe, expect, it } from 'vitest';
import { buildChannelChain } from '../../js/audio-channel.js';
import state from '../../js/state/audioState.js';
import { createMockAudioContext } from './web-audio-mock.js';

describe('buildChannelChain()', () => {
  let ctx;
  let masterGain;

  beforeEach(() => {
    ctx = createMockAudioContext();
    masterGain = ctx.createGain();
    // channelStates を初期化
    state.channelStates = {};
    state.channelStates[0] = {};
  });

  it('gainNodeを生成してchannelStatesに保存する', () => {
    buildChannelChain(ctx, 0, masterGain);
    expect(state.channelStates[0].gainNode).toBeDefined();
    expect(state.channelStates[0].gainNode.gain).toBeDefined();
  });

  it('analyserを生成してchannelStatesに保存する', () => {
    buildChannelChain(ctx, 0, masterGain);
    expect(state.channelStates[0].analyser).toBeDefined();
  });

  it('FXノード群を生成する', () => {
    buildChannelChain(ctx, 0, masterGain);
    const fxNodes = state.channelStates[0].fxNodes;
    expect(fxNodes).toBeDefined();
    expect(fxNodes.distortion).toBeDefined();
    expect(fxNodes.delay).toBeDefined();
    expect(fxNodes.convolver).toBeDefined();
  });

  it('masterGainに接続する（analyser経由）', () => {
    buildChannelChain(ctx, 0, masterGain);
    const analyser = state.channelStates[0].analyser;
    expect(analyser.connect).toHaveBeenCalledWith(masterGain);
  });

  it('複数チャンネルで独立したノードを生成する', () => {
    state.channelStates[1] = {};
    buildChannelChain(ctx, 0, masterGain);
    buildChannelChain(ctx, 1, masterGain);
    expect(state.channelStates[0].gainNode).not.toBe(state.channelStates[1].gainNode);
  });
});
