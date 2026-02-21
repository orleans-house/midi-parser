// ============================================================
// Audio Engine — オーケストレーター
// 各層を呼び出して再生を管理する
//
// Signal Chain:
//   [Source層]  Osc → Envelope ─┐
//   [Channel層] ChGain(waveVol×playGate) → ChDist → ChDelay → ChReverb → ChAnalyser
//   [Master層]  MasterGain → HPF → LPF → EQ
//   [Output層]  → SpectrumAnalyser (visual) / MasterAnalyser → destination
//   [Source層]  Metronome → destination (独立経路)
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

  // === Master層 ===
  const { masterGain, eqOut } = buildMasterChain(audioCtx);

  // === Output層 ===
  buildOutputChain(audioCtx, eqOut);

  // === Channel層 ===
  for (const ch of currentChannels) {
    buildChannelChain(audioCtx, ch, masterGain);
  }

  // ミュート/ソロ状態を適用
  updateChannelGains();

  // === Output層: 波形描画開始 ===
  drawWaveforms();

  // === Source層: スケジューラ ===
  const startOffset = audioCtx.currentTime + 0.1;
  const LOOK_AHEAD = 15;
  const CHECK_INTERVAL = 200;
  let chunkIndex = 0;

  // メトロノーム
  const metronomeGain = buildMetronome(audioCtx, audioCtx.destination);
  const beatInterval = 60 / bpm;
  let nextMetroBeat = startOffset;
  let metroBeatCount = 0;

  function scheduleMetronome(horizon) {
    if (!document.getElementById('metronome-on').checked) return;
    const metroType = document.getElementById('metronome-type').value;
    while (nextMetroBeat < horizon) {
      if (nextMetroBeat >= startOffset) {
        const isAccent = metroBeatCount % 4 === 0;
        createMetroClick(audioCtx, metronomeGain, nextMetroBeat, isAccent, metroType);
      }
      nextMetroBeat += beatInterval;
      metroBeatCount++;
    }
  }

  function scheduler() {
    if (!isPlaying || !audioCtx) return;
    const horizon = audioCtx.currentTime + LOOK_AHEAD;
    scheduleMetronome(horizon);

    while (chunkIndex < notes.length) {
      const t = startOffset + notes[chunkIndex].startTime;
      if (t > horizon) break;

      const n = notes[chunkIndex];
      const freq = midiToFreq(n.note);
      const dur = Math.max(n.duration, 0.05);

      const osc = audioCtx.createOscillator();
      const env = audioCtx.createGain();

      const chFx = getChannelFx(n.channel);
      const waveType = chFx.waveType;
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

      osc._channel = n.channel;
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

  btnPlay.innerHTML = '<i data-lucide="pause"></i>';
  btnPlay.title = '一時停止';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
  btnPlay.disabled = false;
  if (typeof startSpectrumDraw === 'function') startSpectrumDraw();
  if (typeof startLimiterMeter === 'function') startLimiterMeter();
  btnStop.disabled = false;

  // シークバー表示・設定
  const posDisplay = document.getElementById('position-display');
  const startReal = performance.now();
  playbackStartReal = startReal;
  playbackStartOffset = seekOffset;

  animationTimer = setInterval(() => {
    const elapsed = (performance.now() - startReal - pauseDuration) / 1000 + seekOffset;
    posDisplay.textContent = `${elapsed.toFixed(1)}s / ${currentTotalDuration.toFixed(1)}s`;
    updatePlayhead(elapsed);
  }, 100);

  stopTimerId = setTimeout(
    () => {
      if (isPlaying) {
        if (repeatEnabled && currentNotes.length > 0) {
          playNotes(currentNotes, currentBpm);
        } else {
          stopPlayback();
          if (typeof playNextTrack === 'function') playNextTrack();
        }
      }
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
  btnPlay.innerHTML = '<i data-lucide="play"></i>';
  btnPlay.title = '再生';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
  btnPlay.disabled = false;
}

function resumePlayback() {
  if (!isPlaying || !audioCtx || !isPaused) return;
  isPaused = false;
  pauseDuration += performance.now() - pauseStartTime;
  audioCtx.resume();
  const posDisplay = document.getElementById('position-display');
  animationTimer = setInterval(() => {
    const elapsed = (performance.now() - playbackStartReal - pauseDuration) / 1000 + playbackStartOffset;
    posDisplay.textContent = `${elapsed.toFixed(1)}s / ${currentTotalDuration.toFixed(1)}s`;
    updatePlayhead(elapsed);
  }, 100);
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
  btnPlay.innerHTML = '<i data-lucide="pause"></i>';
  btnPlay.title = '一時停止';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
}

function stopPlayback() {
  if (typeof stopSpectrumDraw === 'function') stopSpectrumDraw();
  if (typeof stopLimiterMeter === 'function') stopLimiterMeter();
  isPaused = false;
  pauseDuration = 0;
  pauseStartTime = 0;
  isPlaying = false;
  if (typeof clearLoopTimer === 'function') clearLoopTimer();
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
  // オーディオファイルソースの停止
  if (audioFileSource) {
    try {
      audioFileSource.stop();
    } catch {}
    audioFileSource = null;
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
  btnPlay.innerHTML = '<i data-lucide="play"></i>';
  btnPlay.title = '再生';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
  btnPlay.disabled = false;
  btnStop.disabled = true;
  document.getElementById('position-display').textContent = '-';
}

function playNotesFrom(notes, bpm, fromTime) {
  const offsetNotes = notes
    .filter((n) => n.startTime + n.duration > fromTime)
    .map((n) => ({
      ...n,
      startTime: Math.max(0, n.startTime - fromTime),
      duration: n.startTime < fromTime ? n.duration - (fromTime - n.startTime) : n.duration,
    }));
  playNotes(offsetNotes, bpm, fromTime);
}
