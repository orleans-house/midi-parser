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
        if (typeof applyWaveform === 'function' && osc.context) {
          applyWaveform(osc, newWave, osc.context);
        } else {
          osc.type = newWave;
        }
      } catch (_) {
        /* already stopped */
      }
    }
  }
}

for (const [wave, btn] of Object.entries(mixerBtns)) {
  btn.addEventListener('click', () => {
    setActiveWave(wave);
    // 標準波形選択時はカスタム波形セレクトをリセット
    document.getElementById('custom-waveform-select').value = '';
  });
}

// カスタム波形セレクト
document.getElementById('custom-waveform-select').addEventListener('change', (e) => {
  const val = e.target.value;
  if (!val) return;
  // 標準波形ボタンのアクティブ状態を解除
  for (const btn of Object.values(mixerBtns)) {
    btn.classList.remove('active');
  }
  setActiveWave(val);
});

// ファイル選択ボタン
const btnOpenFolder = document.getElementById('btn-open-folder');
const folderInput = document.getElementById('folder-input');

btnOpen.addEventListener('click', () => fileInput.click());
btnOpenFolder.addEventListener('click', () => folderInput.click());

// SF2音源読み込み
const btnLoadSF2 = document.getElementById('btn-load-sf2');
const sf2Input = document.getElementById('sf2-input');

btnLoadSF2.addEventListener('click', () => sf2Input.click());

sf2Input.addEventListener('change', () => {
  const file = sf2Input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parser = new SF2Parser(e.target.result);
      const sf2Data = parser.parse();
      window._sf2Data = sf2Data;
      window._sf2PresetMap = buildSF2PresetMap(sf2Data);
      const sf2DisplayName = sf2Data.info.INAM || file.name.replace('.sf2', '');
      btnLoadSF2.title = `SF2: ${sf2DisplayName}`;
      btnLoadSF2.classList.add('active');
      const sf2NameEl = document.getElementById('sf2-name');
      sf2NameEl.textContent = sf2DisplayName;
      sf2NameEl.classList.add('loaded');
      console.log(
        `SF2 loaded: ${sf2DisplayName}`,
        `Presets: ${Object.keys(window._sf2PresetMap).length}`,
      );
    } catch (err) {
      console.error('SF2 load error:', err);
      alert(`SF2読み込みエラー: ${err.message}`);
    }
  };
  reader.readAsArrayBuffer(file);
  sf2Input.value = '';
});

folderInput.addEventListener('change', () => {
  if (folderInput.files.length > 0) loadFiles(folderInput.files);
});

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
  if (e.dataTransfer.files.length > 0) loadFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) loadFiles(fileInput.files);
});

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.flac', '.aac', '.m4a', '.webm'];

function isAudioFile(fileName) {
  const ext = fileName.toLowerCase().replace(/^.*(\.[^.]+)$/, '$1');
  return AUDIO_EXTENSIONS.includes(ext);
}

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      if (isAudioFile(file.name)) {
        processAudioFile(e.target.result, file.name);
      } else {
        processMidi(e.target.result, file.name);
      }
    } catch (err) {
      alert(`ファイル読み込みエラー: ${err.message}`);
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

function loadFiles(fileList) {
  if (fileList.length === 1) {
    // 単一ファイル: 従来動作（プレイリストに追加しつつ即読み込み）
    clearPlaylist();
    addFilesToPlaylist(fileList);
  } else if (fileList.length > 1) {
    // 複数ファイル: プレイリストに追加
    clearPlaylist();
    addFilesToPlaylist(fileList);
  }
}

function processAudioFile(buffer, fileName) {
  stopPlayback();
  audioFileMode = true;
  audioFileBuffer = null;
  if (typeof resetDJControls === 'function') resetDJControls();
  if (typeof invalidatePianoRollCache === 'function') invalidatePianoRollCache();

  // 生バッファを保持（シーク用）
  window._audioFileRawBuffer = buffer;

  // MIDIモードのデータをクリア
  currentNotes = [];
  currentChannels = [];
  currentBpm = 0;

  // ファイル情報表示
  document.getElementById('info-filename').textContent = fileName;
  document.getElementById('info-format').textContent = 'Audio';
  document.getElementById('info-tracks').textContent = '-';
  document.getElementById('info-division').textContent = '-';
  document.getElementById('info-tempo').textContent = '-';
  document.getElementById('info-notes').textContent = '-';
  document.getElementById('info-key').textContent = '-';

  // チャンネルUIクリア
  buildChannelUI([]);

  // 再生コントロール有効化
  btnPlay.disabled = false;
  btnStop.disabled = true;

  // ピアノロールクリア
  const prCanvas = document.getElementById('piano-roll-canvas');
  if (prCanvas) {
    const ctx = prCanvas.getContext('2d');
    ctx.clearRect(0, 0, prCanvas.width, prCanvas.height);
  }
}

function processMidi(buffer, fileName) {
  stopPlayback();
  audioFileMode = false;
  audioFileBuffer = null;
  window._audioFileRawBuffer = null;
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

  // キー＋スケール自動検出
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  if (notes.length > 0) {
    const detected = detectKeyScale(notes);
    document.getElementById('info-key').textContent = `${noteNames[detected.key]} ${detected.scale}`;
    // スケール変換のKeyとFromに自動セット
    document.getElementById('scale-key').value = detected.key;
    document.getElementById('scale-from').value = detected.scale;
    updateScaleConvert();
  } else {
    document.getElementById('info-key').textContent = '-';
  }

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
  if (audioFileMode) {
    if (isPlaying && !isPaused) {
      pauseAudioFile();
    } else if (isPlaying && isPaused) {
      resumeAudioFile();
    } else {
      playAudioFile(window._audioFileRawBuffer);
    }
  } else {
    if (isPlaying && !isPaused) {
      pausePlayback();
    } else if (isPlaying && isPaused) {
      resumePlayback();
    } else {
      playNotes(currentNotes, currentBpm);
    }
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
    if (window._eqFilters?.[i]) {
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
          if (osc._channel === ch) {
            if (typeof applyWaveform === 'function' && osc.context) {
              applyWaveform(osc, wave, osc.context);
            } else {
              osc.type = wave;
            }
          }
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
let spectrumData = null;
let spectrumInitialized = false;

function startSpectrumDraw() {
  if (spectrumTimer) return;

  // Canvasサイズは開始時に1回だけ設定
  if (!spectrumInitialized) {
    spectrumCanvas.width = spectrumCanvas.offsetWidth;
    spectrumInitialized = true;
  }

  spectrumTimer = setInterval(() => {
    const analyser = window._spectrumAnalyser;
    if (!analyser) return;

    const w = spectrumCanvas.width;
    const h = spectrumCanvas.height;
    const bufLen = analyser.frequencyBinCount;

    // バッファを使い回す
    if (!spectrumData || spectrumData.length !== bufLen) {
      spectrumData = new Uint8Array(bufLen);
    }
    analyser.getByteFrequencyData(spectrumData);

    specCtx.fillStyle = getThemeColor('--bg-canvas', '#140f1a');
    specCtx.fillRect(0, 0, w, h);

    // スペクトラムバー (対数スケール、4px幅で間引き)
    const nyquist = (window._audioCtxSampleRate || 48000) / 2;
    const minFreq = FREQ_MIN;
    const maxFreq = FREQ_MAX;
    const barWidth = 4;
    const logMin = Math.log(minFreq);
    const logRange = Math.log(maxFreq) - logMin;

    specCtx.fillStyle = getThemeColor('--accent-purple', '#b39ddb');
    specCtx.globalAlpha = 0.6;
    for (let i = 0; i < w; i += barWidth) {
      const freq = Math.exp(logMin + (i / w) * logRange);
      const bin = Math.round((freq / nyquist) * bufLen);
      if (bin >= bufLen) break;
      const val = spectrumData[bin] / 255;
      const barH = val * h;
      specCtx.fillRect(i, h - barH, barWidth - 1, barH);
    }
    specCtx.globalAlpha = 1;

    // HPF/LPFカットオフ線
    const hpfF = window._hpfFreq || 20;
    const lpfF = window._lpfFreq || 20000;
    specCtx.lineWidth = 2;
    specCtx.setLineDash([4, 4]);
    if (hpfF > 25) {
      const xH = w * ((Math.log(hpfF) - logMin) / logRange);
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
      const xL = w * ((Math.log(lpfF) - logMin) / logRange);
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

    // 周波数シフト時: 基準線（元の位置）とシフト後の位置を表示
    const freqShift = window._freqShift || 0;
    const pitchShift = window._pitchShift || 0;
    const anyShift = freqShift !== 0 || pitchShift !== 0;
    {
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      specCtx.font = '9px monospace';
      // C1(24)〜C9(120) の範囲で描画
      for (let midi = 24; midi <= 120; midi += 12) {
        const baseFreq = 440 * 2 ** ((midi - 69) / 12);
        const shiftedMidi = midi + pitchShift;
        const shiftedFreq = Math.max(1, 440 * 2 ** ((shiftedMidi - 69) / 12) + freqShift);
        if (baseFreq < minFreq && shiftedFreq < minFreq) continue;
        if (baseFreq > maxFreq && shiftedFreq > maxFreq) continue;
        const xBase = w * ((Math.log(baseFreq) - logMin) / logRange);
        const xShift = w * ((Math.log(shiftedFreq) - logMin) / logRange);
        const octave = Math.floor(midi / 12) - 1;
        const label = `${noteNames[midi % 12]}${octave}`;

        // 基準線（元の位置）
        if (baseFreq >= minFreq && baseFreq <= maxFreq) {
          specCtx.globalAlpha = anyShift ? 0.25 : 0.35;
          specCtx.strokeStyle = '#ffd54f';
          specCtx.lineWidth = 1;
          specCtx.setLineDash([2, 4]);
          specCtx.beginPath();
          specCtx.moveTo(xBase, 0);
          specCtx.lineTo(xBase, h);
          specCtx.stroke();
          // シフトなしの場合はラベルを基準線に表示
          if (!anyShift) {
            specCtx.globalAlpha = 0.5;
            specCtx.fillStyle = '#ffd54f';
            specCtx.fillText(label, xBase + 3, h - 4);
          }
        }

        // シフト後の位置 — 実線・明るめ（シフト時のみ）
        if (anyShift && shiftedFreq >= minFreq && shiftedFreq <= maxFreq) {
          specCtx.globalAlpha = 0.7;
          specCtx.strokeStyle = '#ff7043';
          specCtx.lineWidth = 1.5;
          specCtx.setLineDash([]);
          specCtx.beginPath();
          specCtx.moveTo(xShift, 0);
          specCtx.lineTo(xShift, h);
          specCtx.stroke();
          // ラベルはシフト後の位置に表示
          specCtx.fillStyle = '#ff7043';
          specCtx.fillText(label, xShift + 3, h - 4);
        }

        // ズレ量を示す矢印帯（基準→シフト後、シフト時のみ）
        if (anyShift && baseFreq >= minFreq && shiftedFreq <= maxFreq) {
          specCtx.globalAlpha = 0.1;
          specCtx.fillStyle = '#ff7043';
          const left = Math.min(xBase, xShift);
          const right = Math.max(xBase, xShift);
          specCtx.fillRect(left, 0, right - left, h);
        }
      }
      specCtx.setLineDash([]);
      specCtx.globalAlpha = 1;
    }
  }, 80);
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
let filterMode = 'hpf-lpf';
window._filterMode = filterMode;

// 初期値
window._hpfFreq = 20;
window._lpfFreq = 20000;
window._bpFreq = 1000;
window._bpQ = 1;
window._notchFreq = 1000;
window._notchQ = 1;
window._peakFreq = 1000;
window._peakQ = 1;
window._peakGain = 0;
// 初期化後にチェーン構築を通知（audio-master.js側で_switchFilterChainが設定される）

// フィルターモード切替
const filterModeBtns = document.querySelectorAll('.filter-mode-btn');
for (const btn of filterModeBtns) {
  btn.addEventListener('click', () => {
    filterMode = btn.dataset.mode;
    window._filterMode = filterMode;
    for (const b of filterModeBtns) {
      b.classList.toggle('active', b === btn);
    }
    // モード変更時にフィルターチェーンを切替・リセット
    resetFilterBypass();
    if (window._switchFilterChain) window._switchFilterChain(filterMode);
    const rect = xyPad.getBoundingClientRect();
    drawXYPad(rect.width / 2, rect.height / 2, rect.width, rect.height);
  });
}

function resetFilterBypass() {
  // HPF/LPFをデフォルトに戻す
  window._hpfFreq = 20;
  window._lpfFreq = 20000;
  if (window._hpf) window._hpf.frequency.value = 20;
  if (window._lpf) window._lpf.frequency.value = 20000;
  // 各フィルターのパラメータをデフォルトに戻す
  window._bpFreq = 1000;
  window._bpQ = 1;
  if (window._bandpass) {
    window._bandpass.frequency.value = 1000;
    window._bandpass.Q.value = 1;
  }
  window._notchFreq = 1000;
  window._notchQ = 1;
  if (window._notch) {
    window._notch.frequency.value = 1000;
    window._notch.Q.value = 1;
  }
  window._peakFreq = 1000;
  window._peakQ = 1;
  window._peakGain = 0;
  if (window._peaking) {
    window._peaking.frequency.value = 1000;
    window._peaking.Q.value = 1;
    window._peaking.gain.value = 0;
  }
  xyHpfLabel.textContent = '';
  xyLpfLabel.textContent = '';
}

function xyPosToFreqs(x, y, w, h) {
  const hpfFreq = FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** (x / w);
  const lpfFreq = FREQ_MAX * (FREQ_MIN / FREQ_MAX) ** (y / h);
  return { hpfFreq: Math.max(20, Math.min(hpfFreq, 20000)), lpfFreq: Math.max(20, Math.min(lpfFreq, 20000)) };
}

function xyPosToFreqQ(x, y, w, h) {
  const freq = FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** (x / w);
  const q = 0.1 + (1 - y / h) * 19.9; // 上=高Q(狭い), 下=低Q(広い)
  return { freq: Math.max(20, Math.min(freq, 20000)), q: Math.max(0.1, Math.min(q, 20)) };
}

function xyPosToFreqGain(x, y, w, h) {
  const freq = FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** (x / w);
  const gain = (0.5 - y / h) * 24; // 上=+12dB, 下=-12dB, 中央=0
  return { freq: Math.max(20, Math.min(freq, 20000)), gain: Math.max(-12, Math.min(gain, 12)) };
}

function formatFreq(f) {
  return f >= 1000 ? `${(f / 1000).toFixed(1)}kHz` : `${Math.round(f)}Hz`;
}

function applyXYFilter(x, y) {
  const rect = xyPad.getBoundingClientRect();
  const cx = Math.max(0, Math.min(x - rect.left, rect.width));
  const cy = Math.max(0, Math.min(y - rect.top, rect.height));

  if (filterMode === 'hpf-lpf') {
    const { hpfFreq, lpfFreq } = xyPosToFreqs(cx, cy, rect.width, rect.height);
    window._hpfFreq = hpfFreq;
    window._lpfFreq = lpfFreq;
    if (window._hpf) window._hpf.frequency.value = hpfFreq;
    if (window._lpf) window._lpf.frequency.value = lpfFreq;
    xyHpfLabel.textContent = `HPF: ${formatFreq(hpfFreq)}`;
    xyLpfLabel.textContent = `LPF: ${formatFreq(lpfFreq)}`;
  } else if (filterMode === 'bandpass') {
    const { freq, q } = xyPosToFreqQ(cx, cy, rect.width, rect.height);
    window._bpFreq = freq;
    window._bpQ = q;
    if (window._bandpass) {
      window._bandpass.frequency.value = freq;
      window._bandpass.Q.value = q;
    }
    xyHpfLabel.textContent = `Freq: ${formatFreq(freq)}`;
    xyLpfLabel.textContent = `Q: ${q.toFixed(1)}`;
  } else if (filterMode === 'notch') {
    const { freq, q } = xyPosToFreqQ(cx, cy, rect.width, rect.height);
    window._notchFreq = freq;
    window._notchQ = q;
    if (window._notch) {
      window._notch.frequency.value = freq;
      window._notch.Q.value = q;
    }
    xyHpfLabel.textContent = `Freq: ${formatFreq(freq)}`;
    xyLpfLabel.textContent = `Q: ${q.toFixed(1)}`;
  } else if (filterMode === 'peaking') {
    const { freq, gain } = xyPosToFreqGain(cx, cy, rect.width, rect.height);
    window._peakFreq = freq;
    window._peakGain = gain;
    window._peakQ = 2;
    if (window._peaking) {
      window._peaking.frequency.value = freq;
      window._peaking.gain.value = gain;
      window._peaking.Q.value = 2;
    }
    xyHpfLabel.textContent = `Freq: ${formatFreq(freq)}`;
    xyLpfLabel.textContent = `Gain: ${gain > 0 ? '+' : ''}${gain.toFixed(1)}dB`;
  }

  drawXYPad(cx, cy, rect.width, rect.height);
}

const modeAxisLabels = {
  'hpf-lpf': { x: 'HPF →', y: '← LPF' },
  bandpass: { x: 'Freq →', y: '← Q' },
  notch: { x: 'Freq →', y: '← Q' },
  peaking: { x: 'Freq →', y: '← Gain' },
};

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
  const labels = modeAxisLabels[filterMode] || modeAxisLabels['hpf-lpf'];
  ctx.fillStyle = 'rgba(122,109,144,0.6)';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(labels.x, 4, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText(labels.y, w - 4, 12);
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
// --- ピッチシフト ---
const pitchShiftSlider = document.getElementById('pitch-shift');
const pitchShiftVal = document.getElementById('pitch-shift-val');
const pitchShiftReset = document.getElementById('pitch-shift-reset');
window._pitchShift = 0;

pitchShiftSlider.addEventListener('input', () => {
  const v = Number(pitchShiftSlider.value);
  window._pitchShift = v;
  pitchShiftVal.textContent = `${v >= 0 ? '+' : ''}${v} st`;
  if (typeof applyFreqShiftToActive === 'function') applyFreqShiftToActive();
});

pitchShiftReset.addEventListener('click', () => {
  pitchShiftSlider.value = 0;
  window._pitchShift = 0;
  pitchShiftVal.textContent = '0 st';
  if (typeof applyFreqShiftToActive === 'function') applyFreqShiftToActive();
});

// --- 周波数シフト ---
const freqShiftSlider = document.getElementById('freq-shift');
const freqShiftVal = document.getElementById('freq-shift-val');
const freqShiftReset = document.getElementById('freq-shift-reset');
window._freqShift = 0;

freqShiftSlider.addEventListener('input', () => {
  const v = Number(freqShiftSlider.value);
  window._freqShift = v;
  freqShiftVal.textContent = `${v >= 0 ? '+' : ''}${v} Hz`;
  if (typeof applyFreqShiftToActive === 'function') applyFreqShiftToActive();
});

freqShiftReset.addEventListener('click', () => {
  freqShiftSlider.value = 0;
  window._freqShift = 0;
  freqShiftVal.textContent = '0 Hz';
  if (typeof applyFreqShiftToActive === 'function') applyFreqShiftToActive();
});

// --- スケール変換 ---
const scaleConvertOn = document.getElementById('scale-convert-on');
const scaleKey = document.getElementById('scale-key');
const scaleFrom = document.getElementById('scale-from');
const scaleTo = document.getElementById('scale-to');

window._scaleConvert = { enabled: false, key: 0, from: 'major', to: 'minor' };

function updateScaleConvert() {
  window._scaleConvert = {
    enabled: scaleConvertOn.checked,
    key: Number(scaleKey.value),
    from: scaleFrom.value,
    to: scaleTo.value,
  };
  if (typeof applyFreqShiftToActive === 'function') applyFreqShiftToActive();
}

scaleConvertOn.addEventListener('change', updateScaleConvert);
scaleKey.addEventListener('change', updateScaleConvert);
scaleFrom.addEventListener('change', updateScaleConvert);
scaleTo.addEventListener('change', updateScaleConvert);

// --- メトロノーム ---
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

// リミッター
const limiterOn = document.getElementById('limiter-on');
const limiterThreshold = document.getElementById('limiter-threshold');
const limiterThresholdVal = document.getElementById('limiter-threshold-val');
const limiterKnee = document.getElementById('limiter-knee');
const limiterKneeVal = document.getElementById('limiter-knee-val');
const limiterReduction = document.getElementById('limiter-reduction');

limiterOn.addEventListener('change', () => {
  applyLimiterParams(window._limiter);
});

limiterThreshold.addEventListener('input', () => {
  limiterThresholdVal.textContent = `${limiterThreshold.value} dB`;
  applyLimiterParams(window._limiter);
});

limiterKnee.addEventListener('input', () => {
  limiterKneeVal.textContent = `${limiterKnee.value} dB`;
  applyLimiterParams(window._limiter);
});

// リミッターのゲインリダクション表示
let limiterMeterTimer = null;

function startLimiterMeter() {
  if (limiterMeterTimer) return;
  limiterMeterTimer = setInterval(() => {
    if (window._limiter && !window._limiterBypassed) {
      const reduction = window._limiter.reduction;
      limiterReduction.textContent = `Reduction: ${reduction.toFixed(1)} dB`;
    } else {
      limiterReduction.textContent = 'Reduction: OFF';
    }
  }, 100);
}

function stopLimiterMeter() {
  if (limiterMeterTimer) {
    clearInterval(limiterMeterTimer);
    limiterMeterTimer = null;
  }
  limiterReduction.textContent = 'Reduction: 0 dB';
}

// マスターリバーブ
const masterReverbOn = document.getElementById('master-reverb-on');
const masterReverbMix = document.getElementById('master-reverb-mix');
const masterReverbMixVal = document.getElementById('master-reverb-mix-val');
const masterReverbDecay = document.getElementById('master-reverb-decay');
const masterReverbDecayVal = document.getElementById('master-reverb-decay-val');

masterReverbOn.addEventListener('change', () => {
  const on = masterReverbOn.checked;
  masterReverbMix.disabled = !on;
  masterReverbDecay.disabled = !on;
  if (window._masterReverbWet) {
    window._masterReverbWet.gain.value = on ? Number(masterReverbMix.value) / 100 : 0;
  }
});

masterReverbMix.addEventListener('input', () => {
  masterReverbMixVal.textContent = `${masterReverbMix.value}%`;
  if (window._masterReverbWet && masterReverbOn.checked) {
    window._masterReverbWet.gain.value = Number(masterReverbMix.value) / 100;
  }
});

masterReverbDecay.addEventListener('input', () => {
  const decay = Number(masterReverbDecay.value) / 10;
  masterReverbDecayVal.textContent = `${decay.toFixed(1)}s`;
  if (window._masterReverbConvolver && audioCtx) {
    window._masterReverbConvolver.buffer = createReverbIR(audioCtx, decay, 2);
  }
});

// マスターコーラス
const masterChorusOn = document.getElementById('master-chorus-on');
const masterChorusRate = document.getElementById('master-chorus-rate');
const masterChorusRateVal = document.getElementById('master-chorus-rate-val');
const masterChorusDepth = document.getElementById('master-chorus-depth');
const masterChorusDepthVal = document.getElementById('master-chorus-depth-val');
const masterChorusMix = document.getElementById('master-chorus-mix');
const masterChorusMixVal = document.getElementById('master-chorus-mix-val');

masterChorusOn.addEventListener('change', () => {
  const on = masterChorusOn.checked;
  masterChorusRate.disabled = !on;
  masterChorusDepth.disabled = !on;
  masterChorusMix.disabled = !on;
  if (window._masterChorusWet) {
    window._masterChorusWet.gain.value = on ? Number(masterChorusMix.value) / 100 : 0;
  }
});

masterChorusRate.addEventListener('input', () => {
  const rate = Number(masterChorusRate.value) / 10;
  masterChorusRateVal.textContent = `${rate.toFixed(1)} Hz`;
  if (window._masterChorusLfo) {
    window._masterChorusLfo.frequency.value = rate;
  }
});

masterChorusDepth.addEventListener('input', () => {
  const depth = Number(masterChorusDepth.value);
  masterChorusDepthVal.textContent = `${depth} ms`;
  if (window._masterChorusLfoGain) {
    window._masterChorusLfoGain.gain.value = depth / 1000;
  }
});

masterChorusMix.addEventListener('input', () => {
  masterChorusMixVal.textContent = `${masterChorusMix.value}%`;
  if (window._masterChorusWet && masterChorusOn.checked) {
    window._masterChorusWet.gain.value = Number(masterChorusMix.value) / 100;
  }
});

// Lucide アイコン初期化
if (typeof lucide !== 'undefined') {
  lucide.createIcons();
}
