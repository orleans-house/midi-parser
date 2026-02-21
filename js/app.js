// ============================================================
// UI
// ============================================================

const fileInput = document.getElementById('file-input');
const btnOpen = document.getElementById('btn-open');
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const waveTypeSelect = document.getElementById('wave-type');

// 波形ミキサー
const mixerChannels = document.querySelectorAll('.mixer-channel');
const mixerSliders = {};
const mixerDisplays = {};
const mixerBtns = {};
for (const ch of mixerChannels) {
  const wave = ch.dataset.wave;
  if (!wave) continue; // skip master (no data-wave)
  mixerSliders[wave] = ch.querySelector('.mixer-vol');
  mixerDisplays[wave] = ch.querySelector('.mixer-pct');
  mixerBtns[wave] = ch.querySelector('.mixer-btn');
}

// マスターボリューム
const masterVolume = document.getElementById('master-volume');
const masterVolPct = document.getElementById('master-vol-pct');

masterVolume.addEventListener('input', () => {
  masterVolPct.textContent = `${masterVolume.value}%`;
  applyCurrentWaveVolume();
});

// 波形音量をチャンネルごとに適用 + マスター音量を masterGain に反映
function applyCurrentWaveVolume() {
  const masterVol = masterVolume.value / 100;
  if (window._masterGain) {
    window._masterGain.gain.value = masterVol;
  }
  applyChannelWaveVolumes();
}

// 各チャンネルの waveGain に波形別音量を適用
function applyChannelWaveVolumes() {
  if (typeof channelStates === 'undefined') return;
  for (const [ch, state] of Object.entries(channelStates)) {
    if (!state.gainNode) continue;
    const chFx = getChannelFx(Number(ch));
    const waveType = chFx.waveType;
    const slider = mixerSliders[waveType];
    state.waveGain = slider ? slider.value / 100 : 0.5;
    applyChannelGain(state);
  }
}

// スライダーイベント
for (const [wave, slider] of Object.entries(mixerSliders)) {
  slider.addEventListener('input', () => {
    mixerDisplays[wave].textContent = `${slider.value}%`;
    applyChannelWaveVolumes();
  });
}

// 波形切替ボタン
function setActiveWave(newWave) {
  waveTypeSelect.value = newWave;
  for (const [wave, btn] of Object.entries(mixerBtns)) {
    btn.classList.toggle('active', wave === newWave);
  }
  applyCurrentWaveVolume();

  // 全チャンネルの波形を一括変更（channelFxState全体 + currentChannels）
  for (const ch of Object.keys(channelFxState)) {
    channelFxState[ch].waveType = newWave;
  }
  for (const ch of currentChannels) {
    getChannelFx(ch).waveType = newWave;
  }

  // FXモジュールの波形ボタンUIも同期
  for (const btn of document.querySelectorAll('.fx-wave-btn')) {
    btn.classList.toggle('active', btn.dataset.wave === newWave);
  }

  // 切替先の波形の音量を全チャンネルに反映
  applyChannelWaveVolumes();

  // 再生中のオシレーターの波形を変更
  if (typeof scheduledNodes !== 'undefined') {
    for (const osc of scheduledNodes) {
      try {
        osc.type = newWave;
      } catch (_) {
        /* already stopped */
      }
    }
  }
}

for (const [wave, btn] of Object.entries(mixerBtns)) {
  btn.addEventListener('click', () => setActiveWave(wave));
}

// ファイル選択ボタン
btnOpen.addEventListener('click', () => fileInput.click());

// 全画面ドラッグ&ドロップ
const dragOverlay = document.getElementById('drag-overlay');
let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
  dragCounter++;
  dragOverlay.classList.add('active');
});

document.addEventListener('dragleave', (e) => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dragOverlay.classList.remove('active');
  }
});

document.addEventListener('dragover', (e) => {
  if (!e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  dragOverlay.classList.remove('active');
  if (e.dataTransfer.files.length > 0) loadFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) loadFile(fileInput.files[0]);
});

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      processMidi(e.target.result, file.name);
    } catch (err) {
      alert(`MIDIパースエラー: ${err.message}`);
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

function processMidi(buffer, fileName) {
  stopPlayback();
  if (typeof resetDJControls === 'function') resetDJControls();
  if (typeof invalidatePianoRollCache === 'function') invalidatePianoRollCache();

  const parser = new MidiParser(buffer);
  const parsed = parser.parse();
  const { notes, tempo, bpm } = extractNotes(parsed);

  currentNotes = notes;
  currentBpm = bpm;

  // チャンネルごとの楽器情報を抽出
  channelPrograms = extractChannelPrograms(parsed);

  // チャンネル検出
  currentChannels = detectChannels(notes);

  // ファイル情報表示
  document.getElementById('info-filename').textContent = fileName;
  document.getElementById('info-format').textContent = `Type ${parsed.header.format}`;
  document.getElementById('info-tracks').textContent = parsed.header.numTracks;
  document.getElementById('info-division').textContent = `${parsed.header.timeDivision} ticks`;
  document.getElementById('info-tempo').textContent = `${bpm} BPM`;
  document.getElementById('info-notes').textContent = notes.length;

  // テンポ表示（不要 — ファイル情報に表示済み）

  // チャンネルUI構築
  buildChannelUI(currentChannels);
  // 再生コントロール有効化
  btnPlay.disabled = false;
  btnStop.disabled = true;

  // 全体の長さを事前計算
  currentTotalDuration = notes.length > 0 ? Math.max(...notes.map((n) => n.startTime + n.duration)) : 0;

  // 描画（表示後に実行）
  requestAnimationFrame(() => {
    drawPianoRoll();
  });
}

// 再生コントロール
btnPlay.addEventListener('click', () => {
  if (isPlaying && !isPaused) {
    pausePlayback();
  } else if (isPlaying && isPaused) {
    resumePlayback();
  } else {
    playNotes(currentNotes, currentBpm);
  }
});
btnStop.addEventListener('click', () => stopPlayback());

// リピート
const btnRepeat = document.getElementById('btn-repeat');
btnRepeat.addEventListener('click', () => {
  repeatEnabled = !repeatEnabled;
  btnRepeat.classList.toggle('active', repeatEnabled);
});

// EQ スライダーイベント
document.querySelectorAll('.eq-band').forEach((band, i) => {
  const slider = band.querySelector('.eq-slider');
  const valDisplay = band.querySelector('.eq-val');
  slider.addEventListener('input', () => {
    const val = Number(slider.value);
    valDisplay.textContent = val > 0 ? `+${val}` : `${val}`;
    if (window._eqFilters && window._eqFilters[i]) {
      window._eqFilters[i].gain.value = val;
    }
  });
});

// チャンネル別FXモジュールイベント（動的要素なのでdelegation）
document.addEventListener('click', (e) => {
  // 波形ボタン
  const waveBtn = e.target.closest('.fx-wave-btn');
  if (waveBtn) {
    const ch = Number(waveBtn.dataset.ch);
    const wave = waveBtn.dataset.wave;
    const chFx = getChannelFx(ch);
    chFx.waveType = wave;

    // ボタンのactive状態を更新
    const container = waveBtn.closest('.fx-wave-btns');
    for (const b of container.querySelectorAll('.fx-wave-btn')) {
      b.classList.remove('active');
    }
    waveBtn.classList.add('active');

    // 再生中のオシレーターの波形を変更
    if (typeof scheduledNodes !== 'undefined') {
      for (const osc of scheduledNodes) {
        try {
          if (osc._channel === ch) osc.type = wave;
        } catch (_) {
          /* already stopped */
        }
      }
    }

    // 波形変更に伴い音量も更新
    applyChannelWaveVolumes();
  }
});

document.addEventListener('change', (e) => {
  // FXトグル
  if (e.target.classList.contains('ch-fx-toggle')) {
    const ch = Number(e.target.dataset.ch);
    const fx = e.target.dataset.fx;
    const chFx = getChannelFx(ch);
    const slider = e.target.closest('.fx-mod-row').querySelector('.ch-fx-slider');
    slider.disabled = !e.target.checked;
    chFx[fx].enabled = e.target.checked;

    const state = channelStates[ch];
    if (state?.fxNodes) {
      if (fx === 'distortion') {
        state.fxNodes.distDry.gain.value = e.target.checked ? 0 : 1;
        state.fxNodes.distWet.gain.value = e.target.checked ? 1 : 0;
        if (e.target.checked) {
          updateDistortionCurve(state.fxNodes.distortion, chFx.distortion.amount);
        }
      } else if (fx === 'delay') {
        state.fxNodes.delayWet.gain.value = e.target.checked ? 0.5 : 0;
      } else if (fx === 'reverb') {
        state.fxNodes.reverbWet.gain.value = e.target.checked ? chFx.reverb.mix / 100 : 0;
      }
    }
  }
});

document.addEventListener('input', (e) => {
  // FXスライダー
  if (e.target.classList.contains('ch-fx-slider')) {
    const ch = Number(e.target.dataset.ch);
    const fx = e.target.dataset.fx;
    const chFx = getChannelFx(ch);
    const valDisplay = e.target.closest('.fx-mod-row').querySelector('.ch-fx-val');
    valDisplay.textContent = e.target.value;

    const state = channelStates[ch];
    if (fx === 'distortion') {
      chFx.distortion.amount = Number(e.target.value);
      if (state?.fxNodes && chFx.distortion.enabled) {
        updateDistortionCurve(state.fxNodes.distortion, chFx.distortion.amount);
      }
    } else if (fx === 'delay') {
      chFx.delay.time = Number(e.target.value);
      if (state?.fxNodes) {
        state.fxNodes.delay.delayTime.value = Number(e.target.value) / 1000;
      }
    } else if (fx === 'reverb') {
      chFx.reverb.mix = Number(e.target.value);
      if (state?.fxNodes && chFx.reverb.enabled) {
        state.fxNodes.reverbWet.gain.value = Number(e.target.value) / 100;
      }
    }
  }
});

// スペクトラム描画
const spectrumCanvas = document.getElementById('spectrum-canvas');
const specCtx = spectrumCanvas.getContext('2d');
let spectrumTimer = null;

function startSpectrumDraw() {
  if (spectrumTimer) return;
  spectrumTimer = setInterval(() => {
    const analyser = window._spectrumAnalyser;
    if (!analyser) return;

    spectrumCanvas.width = spectrumCanvas.offsetWidth;
    const w = spectrumCanvas.width;
    const h = spectrumCanvas.height;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    analyser.getByteFrequencyData(data);

    specCtx.fillStyle = getThemeColor('--bg-canvas', '#140f1a');
    specCtx.fillRect(0, 0, w, h);

    // スペクトラムバー (対数スケール)
    const nyquist = (window._audioCtxSampleRate || 48000) / 2;
    const minFreq = FREQ_MIN;
    const maxFreq = FREQ_MAX;

    specCtx.fillStyle = getThemeColor('--accent-purple', '#b39ddb');
    specCtx.globalAlpha = 0.6;
    for (let i = 0; i < w; i++) {
      const freq = minFreq * (maxFreq / minFreq) ** (i / w);
      const bin = Math.round((freq / nyquist) * bufLen);
      if (bin >= bufLen) break;
      const val = data[bin] / 255;
      const barH = val * h;
      specCtx.fillRect(i, h - barH, 1, barH);
    }
    specCtx.globalAlpha = 1;

    // HPF/LPFカットオフ線
    const hpfF = window._hpfFreq || 20;
    const lpfF = window._lpfFreq || 20000;
    specCtx.lineWidth = 2;
    specCtx.setLineDash([4, 4]);
    if (hpfF > 25) {
      const xH = w * (Math.log(hpfF / minFreq) / Math.log(maxFreq / minFreq));
      specCtx.strokeStyle = '#ef5350';
      specCtx.beginPath();
      specCtx.moveTo(xH, 0);
      specCtx.lineTo(xH, h);
      specCtx.stroke();
      specCtx.fillStyle = '#ef5350';
      specCtx.font = '10px monospace';
      specCtx.fillText(`HP ${formatFreq(hpfF)}`, xH + 4, 12);
    }
    if (lpfF < 19000) {
      const xL = w * (Math.log(lpfF / minFreq) / Math.log(maxFreq / minFreq));
      specCtx.strokeStyle = '#4dd0e1';
      specCtx.beginPath();
      specCtx.moveTo(xL, 0);
      specCtx.lineTo(xL, h);
      specCtx.stroke();
      specCtx.fillStyle = '#4dd0e1';
      specCtx.font = '10px monospace';
      specCtx.fillText(`LP ${formatFreq(lpfF)}`, xL + 4, 24);
    }
    specCtx.setLineDash([]);
  }, 50);
}

function stopSpectrumDraw() {
  if (spectrumTimer) {
    clearInterval(spectrumTimer);
    spectrumTimer = null;
  }
}

// XY Filter Pad
const xyPad = document.getElementById('xy-pad');
const xyHpfLabel = document.getElementById('xy-hpf-label');
const xyLpfLabel = document.getElementById('xy-lpf-label');
let xyDragging = false;

// 初期値: HPF=20Hz(左端), LPF=20kHz(上端) → 左上がデフォルト位置(フィルターOFF相当)
window._hpfFreq = 20;
window._lpfFreq = 20000;

function xyPosToFreqs(x, y, w, h) {
  const hpfFreq = FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** (x / w);
  const lpfFreq = FREQ_MAX * (FREQ_MIN / FREQ_MAX) ** (y / h);
  return { hpfFreq: Math.max(20, Math.min(hpfFreq, 20000)), lpfFreq: Math.max(20, Math.min(lpfFreq, 20000)) };
}

function formatFreq(f) {
  return f >= 1000 ? `${(f / 1000).toFixed(1)}kHz` : `${Math.round(f)}Hz`;
}

function applyXYFilter(x, y) {
  const rect = xyPad.getBoundingClientRect();
  const cx = Math.max(0, Math.min(x - rect.left, rect.width));
  const cy = Math.max(0, Math.min(y - rect.top, rect.height));
  const { hpfFreq, lpfFreq } = xyPosToFreqs(cx, cy, rect.width, rect.height);
  window._hpfFreq = hpfFreq;
  window._lpfFreq = lpfFreq;
  if (window._hpf) window._hpf.frequency.value = hpfFreq;
  if (window._lpf) window._lpf.frequency.value = lpfFreq;
  xyHpfLabel.textContent = `HPF: ${formatFreq(hpfFreq)}`;
  xyLpfLabel.textContent = `LPF: ${formatFreq(lpfFreq)}`;
  drawXYPad(cx, cy, rect.width, rect.height);
}

function drawXYPad(cx, cy, w, h) {
  const canvas = xyPad;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = getThemeColor('--bg-canvas', '#140f1a');
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = 'rgba(90,77,112,0.3)';
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((w * i) / 4, 0);
    ctx.lineTo((w * i) / 4, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, (h * i) / 4);
    ctx.lineTo(w, (h * i) / 4);
    ctx.stroke();
  }

  // Crosshair
  ctx.strokeStyle = 'rgba(179,157,219,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();

  // Dot
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#b39ddb';
  ctx.fill();
  ctx.strokeStyle = '#e0d6f0';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = 'rgba(122,109,144,0.6)';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('HPF →', 4, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText('← LPF', w - 4, 12);
}

// 初期描画
requestAnimationFrame(() => {
  const rect = xyPad.getBoundingClientRect();
  drawXYPad(0, 0, rect.width, rect.height);
});

xyPad.addEventListener('mousedown', (e) => {
  xyDragging = true;
  applyXYFilter(e.clientX, e.clientY);
});
document.addEventListener('mousemove', (e) => {
  if (xyDragging) applyXYFilter(e.clientX, e.clientY);
});
document.addEventListener('mouseup', () => {
  xyDragging = false;
});

// タッチ対応
xyPad.addEventListener('touchstart', (e) => {
  xyDragging = true;
  applyXYFilter(e.touches[0].clientX, e.touches[0].clientY);
  e.preventDefault();
});
document.addEventListener('touchmove', (e) => {
  if (xyDragging) applyXYFilter(e.touches[0].clientX, e.touches[0].clientY);
});
document.addEventListener('touchend', () => {
  xyDragging = false;
});

// Q Sliders
const hpfQSlider = document.getElementById('hpf-q');
const hpfQValue = document.getElementById('hpf-q-value');
const lpfQSlider = document.getElementById('lpf-q');
const lpfQValue = document.getElementById('lpf-q-value');

hpfQSlider.addEventListener('input', () => {
  const q = Number(hpfQSlider.value);
  hpfQValue.textContent = q.toFixed(1);
  if (window._hpf) window._hpf.Q.value = q;
});
lpfQSlider.addEventListener('input', () => {
  const q = Number(lpfQSlider.value);
  lpfQValue.textContent = q.toFixed(1);
  if (window._lpf) window._lpf.Q.value = q;
});

// メトロノーム
const metronomeOn = document.getElementById('metronome-on');
const metronomeVol = document.getElementById('metronome-vol');
const metronomeVolVal = document.getElementById('metronome-vol-val');

const metronomeType = document.getElementById('metronome-type');

metronomeOn.addEventListener('change', () => {
  metronomeVol.disabled = !metronomeOn.checked;
  metronomeType.disabled = !metronomeOn.checked;
  if (window._metronomeGain) {
    window._metronomeGain.gain.value = metronomeOn.checked ? Number(metronomeVol.value) / 100 : 0;
  }
});

metronomeVol.addEventListener('input', () => {
  metronomeVolVal.textContent = `${metronomeVol.value}%`;
  if (window._metronomeGain && metronomeOn.checked) {
    window._metronomeGain.gain.value = Number(metronomeVol.value) / 100;
  }
});

// Lucide アイコン初期化
if (typeof lucide !== 'undefined') {
  lucide.createIcons();
}
