// ============================================================
// Channel層: チャンネル別Gain, チャンネル別FXチェーン構築
// ============================================================

import { createReverbIR, updateDistortionCurve } from './audio-master.js';
import { getChannelFx } from './globals.js';

export function buildChannelChain(audioCtx, ch, masterGain) {
  const state = window.channelStates[ch];
  const chFx = getChannelFx(ch);

  const gainNode = audioCtx.createGain();
  // 波形別音量を初期値に適用
  const chWaveType = chFx.waveType;
  const chWaveSlider = document.querySelector(`.mixer-channel[data-wave="${chWaveType}"] .mixer-vol`);
  const initWaveGain = chWaveSlider ? chWaveSlider.value / 100 : 0.5;
  state.waveGain = initWaveGain;
  state.playGate = 1;
  gainNode.gain.value = initWaveGain;

  // --- チャンネル別FXノード (dry/wet方式) ---

  // Distortion
  const chDistDry = audioCtx.createGain();
  const chDistWet = audioCtx.createGain();
  const chDistNode = audioCtx.createWaveShaper();
  chDistNode.oversample = '4x';
  const chDistMerge = audioCtx.createGain();
  chDistDry.gain.value = 1;
  chDistWet.gain.value = 0;
  if (chFx.distortion.enabled) {
    chDistDry.gain.value = 0;
    chDistWet.gain.value = 1;
    updateDistortionCurve(chDistNode, chFx.distortion.amount);
  }
  gainNode.connect(chDistDry);
  gainNode.connect(chDistNode);
  chDistNode.connect(chDistWet);
  chDistDry.connect(chDistMerge);
  chDistWet.connect(chDistMerge);

  // Delay
  const chDelayDry = audioCtx.createGain();
  const chDelayWet = audioCtx.createGain();
  const chDelayNode = audioCtx.createDelay(1.0);
  const chDelayFeedback = audioCtx.createGain();
  const chDelayMerge = audioCtx.createGain();
  chDelayNode.delayTime.value = chFx.delay.time / 1000;
  chDelayFeedback.gain.value = 0.3;
  chDelayDry.gain.value = 1;
  chDelayWet.gain.value = 0;
  if (chFx.delay.enabled) {
    chDelayWet.gain.value = 0.5;
  }
  chDelayNode.connect(chDelayFeedback);
  chDelayFeedback.connect(chDelayNode);
  chDelayNode.connect(chDelayWet);
  chDistMerge.connect(chDelayDry);
  chDistMerge.connect(chDelayNode);
  chDelayDry.connect(chDelayMerge);
  chDelayWet.connect(chDelayMerge);

  // Reverb
  const chReverbDry = audioCtx.createGain();
  const chReverbWet = audioCtx.createGain();
  const chConvolver = audioCtx.createConvolver();
  chConvolver.buffer = createReverbIR(audioCtx, 2, 2);
  const chReverbMerge = audioCtx.createGain();
  chReverbDry.gain.value = 1;
  chReverbWet.gain.value = 0;
  if (chFx.reverb.enabled) {
    chReverbWet.gain.value = chFx.reverb.mix / 100;
  }
  chDelayMerge.connect(chReverbDry);
  chDelayMerge.connect(chConvolver);
  chConvolver.connect(chReverbWet);
  chReverbDry.connect(chReverbMerge);
  chReverbWet.connect(chReverbMerge);

  // Analyser → Master
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  chReverbMerge.connect(analyser);
  analyser.connect(masterGain);

  state.gainNode = gainNode;
  state.analyser = analyser;
  state.fxNodes = {
    distortion: chDistNode,
    distDry: chDistDry,
    distWet: chDistWet,
    delay: chDelayNode,
    delayWet: chDelayWet,
    delayFeedback: chDelayFeedback,
    convolver: chConvolver,
    reverbWet: chReverbWet,
  };

  // Canvasサイズ設定
  const canvas = document.getElementById(`waveform-${ch}`);
  if (canvas) canvas.width = canvas.offsetWidth;
}
