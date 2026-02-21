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

// 現在の波形の音量 × マスター を masterGain に反映
function applyCurrentWaveVolume() {
  const currentWave = waveTypeSelect.value;
  const slider = mixerSliders[currentWave];
  if (slider && window._masterGain) {
    const waveVol = slider.value / 100;
    const masterVol = masterVolume.value / 100;
    window._masterGain.gain.value = waveVol * masterVol;
  }
}

// スライダーイベント
for (const [wave, slider] of Object.entries(mixerSliders)) {
  slider.addEventListener('input', () => {
    mixerDisplays[wave].textContent = `${slider.value}%`;
    applyCurrentWaveVolume();
  });
}

// 波形切替ボタン
function setActiveWave(newWave) {
  waveTypeSelect.value = newWave;
  for (const [wave, btn] of Object.entries(mixerBtns)) {
    btn.classList.toggle('active', wave === newWave);
  }
  applyCurrentWaveVolume();

  // 再生中のオシレーターの波形を変更（個別設定のないチャンネルのみ）
  if (typeof scheduledNodes !== 'undefined') {
    for (const osc of scheduledNodes) {
      try {
        const chFx = getChannelFx(osc._channel);
        // チャンネル別で明示的に変更されていなければグローバルに従う
        if (!chFx.customWave) {
          osc.type = newWave;
        }
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
  document.getElementById('visualizer-section').style.display = 'block';

  // 再生コントロール有効化
  btnPlay.disabled = false;
  btnStop.disabled = true;

  // 全体の長さを事前計算
  currentTotalDuration = notes.length > 0 ? Math.max(...notes.map((n) => n.startTime + n.duration)) : 0;

  // ピアノロール表示
  document.getElementById('piano-roll-section').style.display = 'block';

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

// FX コントロール
const fxDistortionOn = document.getElementById('fx-distortion-on');
const fxDistortion = document.getElementById('fx-distortion');
const fxDistortionVal = document.getElementById('fx-distortion-val');
const fxDelayOn = document.getElementById('fx-delay-on');
const fxDelayTime = document.getElementById('fx-delay-time');
const fxDelayVal = document.getElementById('fx-delay-val');
const fxReverbOn = document.getElementById('fx-reverb-on');
const fxReverb = document.getElementById('fx-reverb');
const fxReverbVal = document.getElementById('fx-reverb-val');

fxDistortionOn.addEventListener('change', () => {
  fxDistortion.disabled = !fxDistortionOn.checked;
  window._fxDistortionEnabled = fxDistortionOn.checked;
  if (window._fxDistortion) {
    if (fxDistortionOn.checked) {
      updateDistortionCurve(window._fxDistortion, Number(fxDistortion.value));
    } else {
      window._fxDistortion.curve = null;
    }
  }
});

fxDistortion.addEventListener('input', () => {
  fxDistortionVal.textContent = fxDistortion.value;
  if (window._fxDistortion && window._fxDistortionEnabled) {
    updateDistortionCurve(window._fxDistortion, Number(fxDistortion.value));
  }
});

fxDelayOn.addEventListener('change', () => {
  fxDelayTime.disabled = !fxDelayOn.checked;
  window._fxDelayEnabled = fxDelayOn.checked;
  if (window._fxDelayWet) {
    window._fxDelayWet.gain.value = fxDelayOn.checked ? 0.5 : 0;
  }
});

fxDelayTime.addEventListener('input', () => {
  fxDelayVal.textContent = `${fxDelayTime.value}ms`;
  if (window._fxDelay) {
    window._fxDelay.delayTime.value = Number(fxDelayTime.value) / 1000;
  }
});

fxReverbOn.addEventListener('change', () => {
  fxReverb.disabled = !fxReverbOn.checked;
  window._fxReverbEnabled = fxReverbOn.checked;
  if (window._fxReverbWet) {
    window._fxReverbWet.gain.value = fxReverbOn.checked ? Number(fxReverb.value) / 100 : 0;
  }
});

fxReverb.addEventListener('input', () => {
  fxReverbVal.textContent = fxReverb.value;
  if (window._fxReverbWet && window._fxReverbEnabled) {
    window._fxReverbWet.gain.value = Number(fxReverb.value) / 100;
  }
});

// FX Trim
const fxTrimSlider = document.getElementById('fx-trim');
const fxTrimVal = document.getElementById('fx-trim-val');
fxTrimSlider.addEventListener('input', () => {
  fxTrimVal.textContent = `${fxTrimSlider.value}%`;
  if (window._fxTrim) {
    window._fxTrim.gain.value = Number(fxTrimSlider.value) / 100;
  }
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
    chFx.customWave = true;

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
    const nyquist = 24000;
    const minFreq = 20;
    const maxFreq = 20000;

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

    // フィルターカットオフ線
    if (window._globalFilterEnabled) {
      const filterFreq = window._globalFilter?.frequency.value || 1000;
      const x = w * (Math.log(filterFreq / minFreq) / Math.log(maxFreq / minFreq));
      specCtx.strokeStyle = getThemeColor('--accent-green', '#81c784');
      specCtx.lineWidth = 2;
      specCtx.setLineDash([4, 4]);
      specCtx.beginPath();
      specCtx.moveTo(x, 0);
      specCtx.lineTo(x, h);
      specCtx.stroke();
      specCtx.setLineDash([]);

      // 周波数ラベル
      specCtx.fillStyle = getThemeColor('--accent-green', '#81c784');
      specCtx.font = '10px monospace';
      specCtx.fillText(`${Math.round(filterFreq)}Hz`, x + 4, 12);
    }
  }, 50);
}

function stopSpectrumDraw() {
  if (spectrumTimer) {
    clearInterval(spectrumTimer);
    spectrumTimer = null;
  }
}

// フィルターコントロール
const filterEnabled = document.getElementById('filter-enabled');
const filterType = document.getElementById('filter-type');
const filterFreq = document.getElementById('filter-freq');
const filterQ = document.getElementById('filter-q');
const filterFreqVal = document.getElementById('filter-freq-val');
const filterQVal = document.getElementById('filter-q-val');

filterEnabled.addEventListener('change', () => {
  filterType.disabled = !filterEnabled.checked;
  filterFreq.disabled = !filterEnabled.checked;
  filterQ.disabled = !filterEnabled.checked;
  window._globalFilterEnabled = filterEnabled.checked;
  if (window._globalFilter) {
    if (filterEnabled.checked) {
      window._globalFilter.type = filterType.value;
      window._globalFilter.frequency.value = Number(filterFreq.value);
      window._globalFilter.Q.value = Number(filterQ.value);
    } else {
      window._globalFilter.type = 'lowpass';
      window._globalFilter.frequency.value = 20000;
      window._globalFilter.Q.value = 0.1;
    }
  }
});

filterType.addEventListener('change', () => {
  if (window._globalFilter) window._globalFilter.type = filterType.value;
});

filterFreq.addEventListener('input', () => {
  filterFreqVal.textContent = filterFreq.value;
  if (window._globalFilter) window._globalFilter.frequency.value = Number(filterFreq.value);
});

filterQ.addEventListener('input', () => {
  filterQVal.textContent = Number(filterQ.value).toFixed(1);
  if (window._globalFilter) window._globalFilter.Q.value = Number(filterQ.value);
});

// スペクトラムcanvasクリックでフィルター周波数設定
spectrumCanvas.addEventListener('click', (e) => {
  if (!filterEnabled.checked) return;
  const rect = spectrumCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const ratio = x / spectrumCanvas.width;
  const freq = Math.round(20 * (20000 / 20) ** ratio);
  filterFreq.value = freq;
  filterFreqVal.textContent = freq;
  if (window._globalFilter) window._globalFilter.frequency.value = freq;
});

// Lucide アイコン初期化
if (typeof lucide !== 'undefined') {
  lucide.createIcons();
}
