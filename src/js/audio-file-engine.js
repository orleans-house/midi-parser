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
import state from './state/audioState.js';

let audioFilePausedAt = 0;
let audioFileStartedAt = 0;

export async function playAudioFile(buffer, seekOffset = 0) {
  stopPlayback();
  state.audioFileMode = true;

  state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (state.audioCtx.state === 'suspended') {
    await state.audioCtx.resume();
  }
  state.isPlaying = true;

  const audioCtx = state.audioCtx;

  // デコード
  if (!state.audioFileBuffer) {
    state.audioFileBuffer = await audioCtx.decodeAudioData(buffer.slice(0));
  }

  const totalDuration = state.audioFileBuffer.duration;
  state.currentTotalDuration = totalDuration;

  // === Master層 ===
  const { masterGain, eqOut } = buildMasterChain(audioCtx);

  // === Output層 ===
  buildOutputChain(audioCtx, eqOut);

  // === Source: AudioBufferSourceNode ===
  state.audioFileSource = audioCtx.createBufferSource();
  state.audioFileSource.buffer = state.audioFileBuffer;
  state.audioFileSource.connect(masterGain);
  state.audioFileSource.start(0, seekOffset);
  audioFileStartedAt = audioCtx.currentTime - seekOffset;
  audioFilePausedAt = 0;

  // 再生終了時
  state.audioFileSource.onended = () => {
    if (state.isPlaying && !state.isPaused) {
      if (state.repeatEnabled) {
        state.audioFileSource = null;
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
  state.playbackStartReal = performance.now();
  state.playbackStartOffset = seekOffset;
  state.pauseDuration = 0;

  state._audioFileAnimTimer = setInterval(() => {
    const elapsed = (performance.now() - state.playbackStartReal - state.pauseDuration) / 1000 + seekOffset;
    posDisplay.textContent = `${elapsed.toFixed(1)}s / ${totalDuration.toFixed(1)}s`;
    if (typeof window.updatePlayhead === 'function') window.updatePlayhead(elapsed);
  }, 100);
}

export function pauseAudioFile() {
  if (!state.isPlaying || !state.audioCtx || state.isPaused || !state.audioFileMode) return;
  state.isPaused = true;
  audioFilePausedAt = state.audioCtx.currentTime - audioFileStartedAt;
  state.audioCtx.suspend();
  state.pauseStartTime = performance.now();

  if (state._audioFileAnimTimer) {
    clearInterval(state._audioFileAnimTimer);
    state._audioFileAnimTimer = null;
  }

  const btnPlay = document.getElementById('btn-play');
  btnPlay.innerHTML = '<i data-lucide="play"></i>';
  btnPlay.title = '再生';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
}

export function resumeAudioFile() {
  if (!state.isPlaying || !state.audioCtx || !state.isPaused || !state.audioFileMode) return;
  state.isPaused = false;
  state.pauseDuration += performance.now() - state.pauseStartTime;
  state.audioCtx.resume();

  const posDisplay = document.getElementById('position-display');
  state._audioFileAnimTimer = setInterval(() => {
    const elapsed =
      (performance.now() - state.playbackStartReal - state.pauseDuration) / 1000 + state.playbackStartOffset;
    posDisplay.textContent = `${elapsed.toFixed(1)}s / ${state.currentTotalDuration.toFixed(1)}s`;
    if (typeof window.updatePlayhead === 'function') window.updatePlayhead(elapsed);
  }, 100);

  const btnPlay = document.getElementById('btn-play');
  btnPlay.innerHTML = '<i data-lucide="pause"></i>';
  btnPlay.title = '一時停止';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
}

// シークは playAudioFile(buffer, seekOffset) を直接呼ぶことで実現。
// デコード済みバッファ(audioFileBuffer)はキャッシュされるため再デコードは不要。
