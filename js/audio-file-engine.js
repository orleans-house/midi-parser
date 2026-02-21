// ============================================================
// Audio File Engine — オーディオファイル再生
// WAV/MP3/OGG等をデコードし、Master層に接続して再生する
//
// Signal Chain:
//   AudioBufferSourceNode → MasterGain → HPF → LPF → EQ → Output層
// ============================================================

let audioFileSource = null;
let audioFileBuffer = null;
let audioFileMode = false;
let audioFilePausedAt = 0;
let audioFileStartedAt = 0;

async function playAudioFile(buffer, seekOffset = 0) {
  stopPlayback();
  audioFileMode = true;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  isPlaying = true;

  // デコード
  if (!audioFileBuffer) {
    audioFileBuffer = await audioCtx.decodeAudioData(buffer.slice(0));
  }

  const totalDuration = audioFileBuffer.duration;
  currentTotalDuration = totalDuration;

  // === Master層 ===
  const { masterGain, eqOut } = buildMasterChain(audioCtx);

  // === Output層 ===
  buildOutputChain(audioCtx, eqOut);

  // === Source: AudioBufferSourceNode ===
  audioFileSource = audioCtx.createBufferSource();
  audioFileSource.buffer = audioFileBuffer;
  audioFileSource.connect(masterGain);
  audioFileSource.start(0, seekOffset);
  audioFileStartedAt = audioCtx.currentTime - seekOffset;
  audioFilePausedAt = 0;

  // 再生終了時
  audioFileSource.onended = () => {
    if (isPlaying && !isPaused) {
      if (repeatEnabled) {
        audioFileSource = null;
        playAudioFile(buffer, 0);
      } else {
        stopPlayback();
      }
    }
  };

  // === Output層: 波形描画開始 ===
  drawWaveforms();

  // UI更新
  btnPlay.innerHTML = '<i data-lucide="pause"></i>';
  btnPlay.title = '一時停止';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
  btnPlay.disabled = false;
  if (typeof startSpectrumDraw === 'function') startSpectrumDraw();
  btnStop.disabled = false;

  // 位置表示
  const posDisplay = document.getElementById('position-display');
  playbackStartReal = performance.now();
  playbackStartOffset = seekOffset;
  pauseDuration = 0;

  animationTimer = setInterval(() => {
    const elapsed = (performance.now() - playbackStartReal - pauseDuration) / 1000 + seekOffset;
    posDisplay.textContent = `${elapsed.toFixed(1)}s / ${totalDuration.toFixed(1)}s`;
    updatePlayhead(elapsed);
  }, 100);
}

function pauseAudioFile() {
  if (!isPlaying || !audioCtx || isPaused || !audioFileMode) return;
  isPaused = true;
  audioFilePausedAt = audioCtx.currentTime - audioFileStartedAt;
  audioCtx.suspend();
  pauseStartTime = performance.now();

  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = null;
  }

  btnPlay.innerHTML = '<i data-lucide="play"></i>';
  btnPlay.title = '再生';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
}

function resumeAudioFile() {
  if (!isPlaying || !audioCtx || !isPaused || !audioFileMode) return;
  isPaused = false;
  pauseDuration += performance.now() - pauseStartTime;
  audioCtx.resume();

  const posDisplay = document.getElementById('position-display');
  animationTimer = setInterval(() => {
    const elapsed = (performance.now() - playbackStartReal - pauseDuration) / 1000 + playbackStartOffset;
    posDisplay.textContent = `${elapsed.toFixed(1)}s / ${currentTotalDuration.toFixed(1)}s`;
    updatePlayhead(elapsed);
  }, 100);

  btnPlay.innerHTML = '<i data-lucide="pause"></i>';
  btnPlay.title = '一時停止';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
}

function seekAudioFile(time) {
  if (!audioFileMode || !window._audioFileRawBuffer) return;
  audioFileBuffer = null; // 再デコード不要、キャッシュクリアしてplayAudioFileで再利用
  // バッファを保持して再生し直す
  const buf = window._audioFileRawBuffer;
  audioFileBuffer = window._audioFileDecodedBuffer;
  playAudioFile(buf, time);
}
