// ============================================================
// Output層: SpectrumAnalyser, MasterAnalyser, 波形描画
// ============================================================

import { getThemeColor } from './globals.js';
import state from './state/audioState.js';
import { getChannelColor } from './visualizer.js';

// Output分岐構築: eqOut → spectrumAnalyser (表示用)
//                eqOut → masterAnalyser → destination
export function buildOutputChain(audioCtx, eqOut) {
  // スペクトラム表示用Analyser
  const spectrumAnalyser = audioCtx.createAnalyser();
  spectrumAnalyser.fftSize = 4096;
  spectrumAnalyser.smoothingTimeConstant = 0.8;
  state._spectrumAnalyser = spectrumAnalyser;

  // マスター波形用Analyser → 音声出力
  const masterAnalyser = audioCtx.createAnalyser();
  masterAnalyser.fftSize = 2048;
  state._masterAnalyser = masterAnalyser;

  eqOut.connect(spectrumAnalyser);
  eqOut.connect(masterAnalyser);
  masterAnalyser.connect(audioCtx.destination);

  return { spectrumAnalyser, masterAnalyser };
}

// 波形描画用バッファ（使い回し）
let waveformMasterBuf = null;
const waveformChBufs = {};
let waveFrameCount = 0;

// 波形描画ループ（30fpsに間引き）
export function drawWaveforms() {
  if (!state.isPlaying) {
    // マスタークリア
    const mc = document.getElementById('waveform-master');
    if (mc) {
      const mctx = mc.getContext('2d');
      mctx.clearRect(0, 0, mc.width, mc.height);
    }
    for (const ch of state.currentChannels) {
      const canvas = document.getElementById(`waveform-${ch}`);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    return;
  }
  requestAnimationFrame(drawWaveforms);

  // 30fps間引き（偶数フレームのみ描画）
  waveFrameCount++;
  if (waveFrameCount % 2 !== 0) return;

  // マスター合成波描画
  if (state._masterAnalyser) {
    const mc = document.getElementById('waveform-master');
    if (mc) {
      const mctx = mc.getContext('2d');
      const ma = state._masterAnalyser;
      const bufLen = ma.frequencyBinCount;
      if (!waveformMasterBuf || waveformMasterBuf.length !== bufLen) {
        waveformMasterBuf = new Uint8Array(bufLen);
      }
      ma.getByteTimeDomainData(waveformMasterBuf);
      mctx.fillStyle = getThemeColor('--bg-canvas', '#140f1a');
      mctx.fillRect(0, 0, mc.width, mc.height);
      mctx.lineWidth = 2;
      mctx.strokeStyle = getThemeColor('--accent-purple', '#b39ddb');
      mctx.beginPath();
      const sw = mc.width / bufLen;
      let mx = 0;
      for (let i = 0; i < bufLen; i++) {
        const v = waveformMasterBuf[i] / 128.0;
        const y = (v * mc.height) / 2;
        if (i === 0) mctx.moveTo(mx, y);
        else mctx.lineTo(mx, y);
        mx += sw;
      }
      mctx.lineTo(mc.width, mc.height / 2);
      mctx.stroke();
    }
  }

  for (const ch of state.currentChannels) {
    const chState = state.channelStates[ch];
    if (!chState.analyser) continue;

    // ミュート中 or ソロ外のチャンネルはスキップ
    if (chState.playGate === 0) continue;

    const canvas = document.getElementById(`waveform-${ch}`);
    if (!canvas) continue;

    const ctx = canvas.getContext('2d');
    const analyser = chState.analyser;
    const bufferLength = analyser.frequencyBinCount;

    if (!waveformChBufs[ch] || waveformChBufs[ch].length !== bufferLength) {
      waveformChBufs[ch] = new Uint8Array(bufferLength);
    }
    analyser.getByteTimeDomainData(waveformChBufs[ch]);

    ctx.fillStyle = getThemeColor('--bg-canvas', '#140f1a');
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = getChannelColor(ch);
    ctx.beginPath();

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    const chWaveGain = 3.0; // チャンネル波形の描画ゲイン
    for (let i = 0; i < bufferLength; i++) {
      const v = waveformChBufs[ch][i] / 128.0;
      const centered = (v - 1.0) * chWaveGain + 1.0;
      const y = (centered * canvas.height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }
}
