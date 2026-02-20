// ============================================================
// Web Audio API 再生
// ============================================================

let audioCtx = null;
let isPlaying = false;
let scheduledNodes = [];
let animationTimer = null;
let schedulerTimer = null;

async function playNotes(notes, bpm, seekOffset = 0) {
  stopPlayback();
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  isPlaying = true;
  scheduledNodes = [];

  const masterGain = audioCtx.createGain();
  const currentWave = document.getElementById('wave-type').value;
  const waveSlider = document.querySelector(`.mixer-channel[data-wave="${currentWave}"] .mixer-vol`);
  const masterSlider = document.getElementById('master-volume');
  const waveVol = waveSlider ? waveSlider.value / 100 : 0.5;
  const mVol = masterSlider ? masterSlider.value / 100 : 1.0;
  masterGain.gain.value = waveVol * mVol;
  window._masterGain = masterGain;

  // マスター合成波用AnalyserNode
  const masterAnalyser = audioCtx.createAnalyser();
  masterAnalyser.fftSize = 2048;
  masterGain.connect(masterAnalyser);
  masterAnalyser.connect(audioCtx.destination);
  window._masterAnalyser = masterAnalyser;

  // チャンネルごとのオーディオノード作成
  for (const ch of currentChannels) {
    const state = channelStates[ch];

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 1;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;

    gainNode.connect(analyser);
    analyser.connect(masterGain);

    state.gainNode = gainNode;
    state.analyser = analyser;

    // Canvasサイズ設定
    const canvas = document.getElementById(`waveform-${ch}`);
    if (canvas) canvas.width = canvas.offsetWidth;
  }

  // ミュート/ソロ状態を適用
  updateChannelGains();

  // ビジュアライザー表示
  document.getElementById('visualizer-section').style.display = 'block';

  // 波形描画ループ
  function drawWaveforms() {
    if (!isPlaying) {
      // マスタークリア
      const mc = document.getElementById('waveform-master');
      if (mc) {
        const mctx = mc.getContext('2d');
        mctx.clearRect(0, 0, mc.width, mc.height);
      }
      for (const ch of currentChannels) {
        const canvas = document.getElementById(`waveform-${ch}`);
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }
    requestAnimationFrame(drawWaveforms);

    // マスター合成波描画
    if (window._masterAnalyser) {
      const mc = document.getElementById('waveform-master');
      if (mc) {
        mc.width = mc.offsetWidth;
        const mctx = mc.getContext('2d');
        const ma = window._masterAnalyser;
        const bufLen = ma.frequencyBinCount;
        const data = new Uint8Array(bufLen);
        ma.getByteTimeDomainData(data);
        mctx.fillStyle = getThemeColor('--bg-canvas', '#140f1a');
        mctx.fillRect(0, 0, mc.width, mc.height);
        mctx.lineWidth = 2;
        mctx.strokeStyle = getThemeColor('--accent-purple', '#b39ddb');
        mctx.beginPath();
        const sw = mc.width / bufLen;
        let mx = 0;
        for (let i = 0; i < bufLen; i++) {
          const v = data[i] / 128.0;
          const y = (v * mc.height) / 2;
          if (i === 0) mctx.moveTo(mx, y);
          else mctx.lineTo(mx, y);
          mx += sw;
        }
        mctx.lineTo(mc.width, mc.height / 2);
        mctx.stroke();
      }
    }

    for (const ch of currentChannels) {
      const state = channelStates[ch];
      if (!state.analyser) continue;

      const canvas = document.getElementById(`waveform-${ch}`);
      if (!canvas) continue;

      const ctx = canvas.getContext('2d');
      const analyser = state.analyser;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = getThemeColor('--bg-canvas', '#140f1a');
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = getChannelColor(ch);
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    }
  }
  drawWaveforms();

  const startOffset = audioCtx.currentTime + 0.1;

  // AudioContext時間ベースの先読みスケジューラ
  const LOOK_AHEAD = 15;
  const CHECK_INTERVAL = 200;
  let chunkIndex = 0;

  function scheduler() {
    if (!isPlaying || !audioCtx) return;
    const horizon = audioCtx.currentTime + LOOK_AHEAD;

    while (chunkIndex < notes.length) {
      const t = startOffset + notes[chunkIndex].startTime;
      if (t > horizon) break;

      const n = notes[chunkIndex];
      const freq = midiToFreq(n.note);
      const dur = Math.max(n.duration, 0.05);

      const osc = audioCtx.createOscillator();
      const env = audioCtx.createGain();

      const waveType = document.getElementById('wave-type').value;
      osc.type = waveType;
      osc.frequency.value = freq;

      const vel = n.velocity / 127;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(vel * 0.15, t + 0.01);
      env.gain.setValueAtTime(vel * 0.15, t + dur - Math.min(0.05, dur * 0.3));
      env.gain.linearRampToValueAtTime(0, t + dur);

      osc.connect(env);

      // チャンネル別ゲインノードにルーティング
      const chState = channelStates[n.channel];
      if (chState?.gainNode) {
        env.connect(chState.gainNode);
      } else {
        env.connect(masterGain);
      }

      osc.start(t);
      osc.stop(t + dur + 0.01);

      scheduledNodes.push(osc);
      chunkIndex++;
    }

    if (chunkIndex < notes.length && isPlaying) {
      schedulerTimer = setTimeout(scheduler, CHECK_INTERVAL);
    }
  }

  scheduler();

  // 再生終了検知
  const totalDuration = notes.length > 0 ? Math.max(...notes.map((n) => n.startTime + n.duration)) : 0;

  if (seekOffset === 0) currentTotalDuration = totalDuration;

  btnPlay.innerHTML = '<i data-lucide="pause"></i> 一時停止';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
  btnPlay.disabled = false;
  btnStop.disabled = false;

  // シークバー表示・設定
  const posDisplay = document.getElementById('position-display');
  const startReal = performance.now();
  playbackStartReal = startReal;
  playbackStartOffset = seekOffset;

  animationTimer = setInterval(() => {
    const elapsed = (performance.now() - startReal - pauseDuration) / 1000 + seekOffset;
    posDisplay.textContent = `${elapsed.toFixed(1)}s / ${currentTotalDuration.toFixed(1)}s`;
    // 可視化ヘッド更新
    updatePlayhead(elapsed);
  }, 100);

  stopTimerId = setTimeout(
    () => {
      if (isPlaying) stopPlayback();
    },
    (totalDuration + 1.0) * 1000,
  );
}

let stopTimerId = null;
let isPaused = false;

let pauseDuration = 0;
let pauseStartTime = 0;

function pausePlayback() {
  if (!isPlaying || !audioCtx || isPaused) return;
  isPaused = true;
  pauseStartTime = performance.now();
  audioCtx.suspend();
  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
  if (stopTimerId) {
    clearTimeout(stopTimerId);
    stopTimerId = null;
  }
  btnPlay.innerHTML = '<i data-lucide="play"></i> 再生';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
  btnPlay.disabled = false;
}

function resumePlayback() {
  if (!isPlaying || !audioCtx || !isPaused) return;
  isPaused = false;
  pauseDuration += performance.now() - pauseStartTime;
  audioCtx.resume();
  // アニメーションタイマー再開（pause時間を差し引いて計算）
  const posDisplay = document.getElementById('position-display');
  animationTimer = setInterval(() => {
    const elapsed = (performance.now() - playbackStartReal - pauseDuration) / 1000 + playbackStartOffset;
    posDisplay.textContent = `${elapsed.toFixed(1)}s / ${currentTotalDuration.toFixed(1)}s`;
    updatePlayhead(elapsed);
  }, 100);
  // 残り時間で停止タイマー再設定
  const currentElapsed = (performance.now() - playbackStartReal - pauseDuration) / 1000 + playbackStartOffset;
  const remaining = currentTotalDuration - currentElapsed;
  if (remaining > 0) {
    stopTimerId = setTimeout(
      () => {
        if (isPlaying) stopPlayback();
      },
      (remaining + 1.0) * 1000,
    );
  }
  btnPlay.innerHTML = '<i data-lucide="pause"></i> 一時停止';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
}

function stopPlayback() {
  isPaused = false;
  pauseDuration = 0;
  pauseStartTime = 0;
  isPlaying = false;
  if (stopTimerId) {
    clearTimeout(stopTimerId);
    stopTimerId = null;
  }
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
  for (const osc of scheduledNodes) {
    try {
      osc.stop();
    } catch {}
  }
  scheduledNodes = [];
  // チャンネルオーディオノードのクリーンアップ
  for (const ch of Object.keys(channelStates)) {
    channelStates[ch].gainNode = null;
    channelStates[ch].analyser = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  btnPlay.innerHTML = '<i data-lucide="play"></i> 再生';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
  btnPlay.disabled = false;
  btnStop.disabled = true;
  document.getElementById('position-display').textContent = '';
}

function playNotesFrom(notes, bpm, fromTime) {
  // fromTime以降のノートだけをオフセットして再生（元インデックス保持）
  const offsetNotes = notes
    .filter((n) => n.startTime + n.duration > fromTime)
    .map((n) => ({
      ...n,
      startTime: Math.max(0, n.startTime - fromTime),
      duration: n.startTime < fromTime ? n.duration - (fromTime - n.startTime) : n.duration,
    }));
  playNotes(offsetNotes, bpm, fromTime);
}
