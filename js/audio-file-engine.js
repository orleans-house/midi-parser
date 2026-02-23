// ============================================================
// Audio File Engine — オーディオファイル再生
// WAV/MP3/OGG等をデコードし、Master層に接続して再生する
//
// Signal Chain:
//   AudioBufferSourceNode → MasterGain → HPF → LPF → EQ → Output層
// ============================================================

import { stopPlayback } from './audio-engine.js';
import { buildMasterChain } from './audio-master.js';
import { buildOutputChain, drawWaveforms } from './audio-output.js';

let audioFilePausedAt = 0;
let audioFileStartedAt = 0;

export async function playAudioFile(buffer, seekOffset = 0) {
  stopPlayback();
  window.audioFileMode = true;

  window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (window.audioCtx.state === 'suspended') {
    await window.audioCtx.resume();
  }
  window.isPlaying = true;

  const audioCtx = window.audioCtx;

  // デコード
  if (!window.audioFileBuffer) {
    window.audioFileBuffer = await audioCtx.decodeAudioData(buffer.slice(0));
  }

  const totalDuration = window.audioFileBuffer.duration;
  window.currentTotalDuration = totalDuration;

  // === Master層 ===
  const { masterGain, eqOut } = buildMasterChain(audioCtx);

  // === Output層 ===
  buildOutputChain(audioCtx, eqOut);

  // === Source: AudioBufferSourceNode ===
  window.audioFileSource = audioCtx.createBufferSource();
  window.audioFileSource.buffer = window.audioFileBuffer;
  window.audioFileSource.connect(masterGain);
  window.audioFileSource.start(0, seekOffset);
  audioFileStartedAt = audioCtx.currentTime - seekOffset;
  audioFilePausedAt = 0;

  // 再生終了時
  window.audioFileSource.onended = () => {
    if (window.isPlaying && !window.isPaused) {
      if (window.repeatEnabled) {
        window.audioFileSource = null;
        playAudioFile(buffer, 0);
      } else {
        stopPlayback();
        if (typeof window.playNextTrack === 'function') window.playNextTrack();
      }
    }
  };

  // === Output層: 波形描画開始 ===
  drawWaveforms();

  // UI更新
  const btnPlay = document.getElementById('btn-play');
  const btnStop = document.getElementById('btn-stop');
  btnPlay.innerHTML = '<i data-lucide="pause"></i>';
  btnPlay.title = '一時停止';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
  btnPlay.disabled = false;
  if (typeof window.startSpectrumDraw === 'function') window.startSpectrumDraw();
  if (typeof window.startLimiterMeter === 'function') window.startLimiterMeter();
  btnStop.disabled = false;

  // 位置表示
  const posDisplay = document.getElementById('position-display');
  window.playbackStartReal = performance.now();
  window.playbackStartOffset = seekOffset;
  window.pauseDuration = 0;

  window._audioFileAnimTimer = setInterval(() => {
    const elapsed = (performance.now() - window.playbackStartReal - window.pauseDuration) / 1000 + seekOffset;
    posDisplay.textContent = `${elapsed.toFixed(1)}s / ${totalDuration.toFixed(1)}s`;
    if (typeof window.updatePlayhead === 'function') window.updatePlayhead(elapsed);
  }, 100);
}

export function pauseAudioFile() {
  if (!window.isPlaying || !window.audioCtx || window.isPaused || !window.audioFileMode) return;
  window.isPaused = true;
  audioFilePausedAt = window.audioCtx.currentTime - audioFileStartedAt;
  window.audioCtx.suspend();
  window.pauseStartTime = performance.now();

  if (window._audioFileAnimTimer) {
    clearInterval(window._audioFileAnimTimer);
    window._audioFileAnimTimer = null;
  }

  const btnPlay = document.getElementById('btn-play');
  btnPlay.innerHTML = '<i data-lucide="play"></i>';
  btnPlay.title = '再生';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
}

export function resumeAudioFile() {
  if (!window.isPlaying || !window.audioCtx || !window.isPaused || !window.audioFileMode) return;
  window.isPaused = false;
  window.pauseDuration += performance.now() - window.pauseStartTime;
  window.audioCtx.resume();

  const posDisplay = document.getElementById('position-display');
  window._audioFileAnimTimer = setInterval(() => {
    const elapsed =
      (performance.now() - window.playbackStartReal - window.pauseDuration) / 1000 + window.playbackStartOffset;
    posDisplay.textContent = `${elapsed.toFixed(1)}s / ${window.currentTotalDuration.toFixed(1)}s`;
    if (typeof window.updatePlayhead === 'function') window.updatePlayhead(elapsed);
  }, 100);

  const btnPlay = document.getElementById('btn-play');
  btnPlay.innerHTML = '<i data-lucide="pause"></i>';
  btnPlay.title = '一時停止';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
}

// シークは playAudioFile(buffer, seekOffset) を直接呼ぶことで実現。
// デコード済みバッファ(audioFileBuffer)はキャッシュされるため再デコードは不要。
