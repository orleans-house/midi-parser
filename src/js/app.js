// ============================================================
// UI
// ============================================================

import { applyFreqShiftToActive, pausePlayback, playNotes, resumePlayback, stopPlayback } from './audio-engine.js';
import { pauseAudioFile, playAudioFile, resumeAudioFile } from './audio-file-engine.js';
import { applyLimiterParams, createReverbIR, updateDistortionCurve } from './audio-master.js';
import { resetDJControls } from './dj-controls.js';
import { FREQ_MAX, FREQ_MIN, getChannelFx, getThemeColor } from './globals.js';
import { detectKeyScale, extractChannelPrograms, extractNotes, getInstrumentName, MidiParser } from './midi-parser.js';
import { drawPianoRoll, invalidatePianoRollCache } from './piano-roll.js';
import { addFilesToPlaylist, clearPlaylist } from './playlist.js';
import { buildSF2PresetMap, SF2Parser } from './sf2-parser.js';
import state from './state/audioState.js';
import { applyChannelGain, buildChannelUI, detectChannels, updateVoiceLabels } from './visualizer.js';
import { applyWaveform } from './waveforms.js';

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
  if (state._masterGain) {
    state._masterGain.gain.value = masterVol;
  }
  applyChannelWaveVolumes();
}

// 各チャンネルの waveGain に波形別音量を適用
function applyChannelWaveVolumes() {
  if (typeof state.channelStates === 'undefined') return;
  for (const [ch, chState] of Object.entries(state.channelStates)) {
    if (!chState.gainNode) continue;
    const chFx = getChannelFx(Number(ch));
    const waveType = chFx.waveType;
    const slider = mixerSliders[waveType];
    chState.waveGain = slider ? slider.value / 100 : 0.5;
    applyChannelGain(chState);
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

  // SF2モードを無効化（波形選択=オシレーターモード）
  state._useSF = false;
  const btnSF2 = document.getElementById('btn-load-sf2');
  if (btnSF2) btnSF2.classList.remove('active');

  // 全チャンネルの波形を一括変更（channelFxState全体 + currentChannels）
  for (const ch of Object.keys(state.channelFxState)) {
    state.channelFxState[ch].waveType = newWave;
  }
  for (const ch of state.currentChannels) {
    getChannelFx(ch).waveType = newWave;
  }

  // FXモジュールの波形ボタンUIも同期
  for (const btn of document.querySelectorAll('.fx-wave-btn')) {
    btn.classList.toggle('active', btn.dataset.wave === newWave);
  }

  // 切替先の波形の音量を全チャンネルに反映
  applyChannelWaveVolumes();

  // 再生中のオシレーターの波形を変更
  if (typeof state.scheduledNodes !== 'undefined') {
    for (const osc of state.scheduledNodes) {
      try {
        if (osc.context) {
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

btnLoadSF2.addEventListener('click', () => {
  if (state._sf) {
    // SF2読み込み済み: ON/OFFトグル
    state._useSF = !state._useSF;
    btnLoadSF2.classList.toggle('active', state._useSF);
    if (state._useSF) {
      // SF2有効化: 波形ボタンのアクティブを解除
      for (const btn of Object.values(mixerBtns)) {
        btn.classList.remove('active');
      }
      document.getElementById('custom-waveform-select').value = '';
    } else {
      // SF2無効化: 現在の波形を再アクティブ化
      const currentWave =
        Object.keys(state.channelFxState).length > 0
          ? state.channelFxState[Object.keys(state.channelFxState)[0]]?.waveType || 'triangle'
          : 'triangle';
      if (mixerBtns[currentWave]) mixerBtns[currentWave].classList.add('active');
    }
    // 再生中なら即時反映
    if (typeof applyFreqShiftToActive === 'function') applyFreqShiftToActive();
    updateVoiceLabels();
  } else {
    // 未読み込み: ファイル選択
    sf2Input.click();
  }
});

// 右クリックでSF2ファイル再選択
btnLoadSF2.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  sf2Input.click();
});

sf2Input.addEventListener('change', () => {
  const file = sf2Input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parser = new SF2Parser(e.target.result);
      const sf2Data = parser.parse();
      state._sf = sf2Data;
      state._sf2PresetMap = buildSF2PresetMap(sf2Data);
      const sf2DisplayName = sf2Data.info.INAM || file.name.replace('.sf2', '');
      state._useSF = true;
      btnLoadSF2.title = `SF2: ${sf2DisplayName}`;
      btnLoadSF2.classList.add('active');
      const sf2NameEl = document.getElementById('sf2-name');
      sf2NameEl.textContent = sf2DisplayName;
      sf2NameEl.classList.add('loaded');
      // 波形ボタンのアクティブを解除
      for (const btn of Object.values(mixerBtns)) {
        btn.classList.remove('active');
      }
      document.getElementById('custom-waveform-select').value = '';
      document.getElementById('btn-sf2-info').style.display = '';
      updateVoiceLabels();
      console.log(`SF2 loaded: ${sf2DisplayName}`, `Presets: ${Object.keys(state._sf2PresetMap).length}`);
    } catch (err) {
      console.error('SF2 load error:', err);
      alert(`SF2読み込みエラー: ${err.message}`);
    }
  };
  reader.readAsArrayBuffer(file);
  sf2Input.value = '';
});

// --- SF2 Info Modal ---
const sf2InfoModal = document.getElementById('sf2-info-modal');
const btnSF2Info = document.getElementById('btn-sf2-info');

function showSF2Info() {
  if (!state._sf || !state._sf2PresetMap) return;

  // タイトル
  const name = state._sf.info.INAM || 'Unknown';
  document.getElementById('sf2-info-title').textContent = `SF2: ${name}`;

  // チャンネル割り当て
  const assignDiv = document.getElementById('sf2-channel-assignments');
  const channels = Object.keys(state.channelPrograms);
  if (channels.length > 0) {
    let html = '<table class="sf2-info-table"><tr><th>Ch</th><th>Program</th><th>楽器名</th></tr>';
    for (const ch of channels.sort((a, b) => Number(a) - Number(b))) {
      const prog = state.channelPrograms[ch];
      html += `<tr><td>${Number(ch) + 1}</td><td>${prog}</td><td>${getInstrumentName(prog)}</td></tr>`;
    }
    html += '</table>';
    assignDiv.innerHTML = html;
  } else {
    assignDiv.innerHTML = '<p style="color:var(--text-secondary);font-size:0.8rem;">MIDIファイル未読み込み</p>';
  }

  // プリセット一覧
  const presetDiv = document.getElementById('sf2-preset-list');
  const presets = Object.values(state._sf2PresetMap);
  presets.sort((a, b) => a.bank - b.bank || a.preset - b.preset);
  let html = '<table class="sf2-info-table"><tr><th>Bank</th><th>Program</th><th>プリセット名</th></tr>';
  for (const p of presets) {
    html += `<tr><td>${p.bank}</td><td>${p.preset}</td><td>${p.name}</td></tr>`;
  }
  html += '</table>';
  presetDiv.innerHTML = html;

  sf2InfoModal.style.display = '';
}

btnSF2Info.addEventListener('click', showSF2Info);
document.getElementById('btn-sf2-info-close').addEventListener('click', () => {
  sf2InfoModal.style.display = 'none';
});
sf2InfoModal.addEventListener('click', (e) => {
  if (e.target === sf2InfoModal) sf2InfoModal.style.display = 'none';
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

export function isAudioFile(fileName) {
  const ext = fileName.toLowerCase().replace(/^.*(\.[^.]+)$/, '$1');
  return AUDIO_EXTENSIONS.includes(ext);
}

export function loadFile(file) {
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

export function loadFiles(fileList) {
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

export function processAudioFile(buffer, fileName) {
  stopPlayback();
  state.audioFileMode = true;
  state.audioFileBuffer = null;
  if (typeof resetDJControls === 'function') resetDJControls();
  if (typeof invalidatePianoRollCache === 'function') invalidatePianoRollCache();

  // 生バッファを保持（シーク用）
  state._audioFileRawBuffer = buffer;

  // MIDIモードのデータをクリア
  state.currentNotes = [];
  state.currentChannels = [];
  state.currentBpm = 0;

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

export function processMidi(buffer, fileName) {
  stopPlayback();
  state.audioFileMode = false;
  state.audioFileBuffer = null;
  state._audioFileRawBuffer = null;
  if (typeof resetDJControls === 'function') resetDJControls();
  if (typeof invalidatePianoRollCache === 'function') invalidatePianoRollCache();

  const parser = new MidiParser(buffer);
  const parsed = parser.parse();
  const { notes, tempo, bpm } = extractNotes(parsed);

  state.currentNotes = notes;
  state.currentBpm = bpm;

  // チャンネルごとの楽器情報を抽出
  state.channelPrograms = extractChannelPrograms(parsed);

  // チャンネル検出
  state.currentChannels = detectChannels(notes);

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
  buildChannelUI(state.currentChannels);
  updateVoiceLabels();
  // 再生コントロール有効化
  btnPlay.disabled = false;
  btnStop.disabled = true;

  // 全体の長さを事前計算
  state.currentTotalDuration = notes.length > 0 ? Math.max(...notes.map((n) => n.startTime + n.duration)) : 0;

  // 描画（表示後に実行）
  requestAnimationFrame(() => {
    drawPianoRoll();
  });
}

// 再生コントロール
btnPlay.addEventListener('click', () => {
  if (state.audioFileMode) {
    if (state.isPlaying && !state.isPaused) {
      pauseAudioFile();
    } else if (state.isPlaying && state.isPaused) {
      resumeAudioFile();
    } else {
      playAudioFile(state._audioFileRawBuffer);
    }
  } else {
    if (state.isPlaying && !state.isPaused) {
      pausePlayback();
    } else if (state.isPlaying && state.isPaused) {
      resumePlayback();
    } else {
      playNotes(state.currentNotes, state.currentBpm);
    }
  }
});
btnStop.addEventListener('click', () => stopPlayback());

// リピート
const btnRepeat = document.getElementById('btn-repeat');
btnRepeat.addEventListener('click', () => {
  state.repeatEnabled = !state.repeatEnabled;
  btnRepeat.classList.toggle('active', state.repeatEnabled);
});

// EQ スライダーイベント
document.querySelectorAll('.eq-band').forEach((band, i) => {
  const slider = band.querySelector('.eq-slider');
  const valDisplay = band.querySelector('.eq-val');
  slider.addEventListener('input', () => {
    const val = Number(slider.value);
    valDisplay.textContent = val > 0 ? `+${val}` : `${val}`;
    if (state._eqFilters?.[i]) {
      state._eqFilters[i].gain.value = val;
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
    if (typeof state.scheduledNodes !== 'undefined') {
      for (const osc of state.scheduledNodes) {
        try {
          if (osc._channel === ch) {
            if (osc.context) {
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

    const chState = state.channelStates[ch];
    if (chState?.fxNodes) {
      if (fx === 'distortion') {
        chState.fxNodes.distDry.gain.value = e.target.checked ? 0 : 1;
        chState.fxNodes.distWet.gain.value = e.target.checked ? 1 : 0;
        if (e.target.checked) {
          updateDistortionCurve(chState.fxNodes.distortion, chFx.distortion.amount);
        }
      } else if (fx === 'delay') {
        chState.fxNodes.delayWet.gain.value = e.target.checked ? 0.5 : 0;
      } else if (fx === 'reverb') {
        chState.fxNodes.reverbWet.gain.value = e.target.checked ? chFx.reverb.mix / 100 : 0;
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

    const chState = state.channelStates[ch];
    if (fx === 'distortion') {
      chFx.distortion.amount = Number(e.target.value);
      if (chState?.fxNodes && chFx.distortion.enabled) {
        updateDistortionCurve(chState.fxNodes.distortion, chFx.distortion.amount);
      }
    } else if (fx === 'delay') {
      chFx.delay.time = Number(e.target.value);
      if (chState?.fxNodes) {
        chState.fxNodes.delay.delayTime.value = Number(e.target.value) / 1000;
      }
    } else if (fx === 'reverb') {
      chFx.reverb.mix = Number(e.target.value);
      if (chState?.fxNodes && chFx.reverb.enabled) {
        chState.fxNodes.reverbWet.gain.value = Number(e.target.value) / 100;
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

export function startSpectrumDraw() {
  if (spectrumTimer) return;

  // Canvasサイズは開始時に1回だけ設定
  if (!spectrumInitialized) {
    spectrumCanvas.width = spectrumCanvas.offsetWidth;
    spectrumInitialized = true;
  }

  spectrumTimer = setInterval(() => {
    const analyser = state._spectrumAnalyser;
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
    const nyquist = (state._audioCtxSampleRate || 48000) / 2;
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
    const hpfF = state._hpfFreq || 20;
    const lpfF = state._lpfFreq || 20000;
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
    const freqShift = state._freqShift || 0;
    const pitchShift = state._pitchShift || 0;
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

export function stopSpectrumDraw() {
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
state._filterMode = filterMode;

// 初期値
state._hpfFreq = 20;
state._lpfFreq = 20000;
state._bpFreq = 1000;
state._bpQ = 1;
state._notchFreq = 1000;
state._notchQ = 1;
state._peakFreq = 1000;
state._peakQ = 1;
state._peakGain = 0;
// 初期化後にチェーン構築を通知（audio-master.js側で_switchFilterChainが設定される）

// フィルターモード切替
const filterModeBtns = document.querySelectorAll('.filter-mode-btn');
for (const btn of filterModeBtns) {
  btn.addEventListener('click', () => {
    filterMode = btn.dataset.mode;
    state._filterMode = filterMode;
    for (const b of filterModeBtns) {
      b.classList.toggle('active', b === btn);
    }
    // モード変更時にフィルターチェーンを切替・リセット
    resetFilterBypass();
    if (state._switchFilterChain) state._switchFilterChain(filterMode);
    const rect = xyPad.getBoundingClientRect();
    drawXYPad(rect.width / 2, rect.height / 2, rect.width, rect.height);
  });
}

function resetFilterBypass() {
  // HPF/LPFをデフォルトに戻す
  state._hpfFreq = 20;
  state._lpfFreq = 20000;
  if (state._hpf) state._hpf.frequency.value = 20;
  if (state._lpf) state._lpf.frequency.value = 20000;
  // 各フィルターのパラメータをデフォルトに戻す
  state._bpFreq = 1000;
  state._bpQ = 1;
  if (state._bandpass) {
    state._bandpass.frequency.value = 1000;
    state._bandpass.Q.value = 1;
  }
  state._notchFreq = 1000;
  state._notchQ = 1;
  if (state._notch) {
    state._notch.frequency.value = 1000;
    state._notch.Q.value = 1;
  }
  state._peakFreq = 1000;
  state._peakQ = 1;
  state._peakGain = 0;
  if (state._peaking) {
    state._peaking.frequency.value = 1000;
    state._peaking.Q.value = 1;
    state._peaking.gain.value = 0;
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
    state._hpfFreq = hpfFreq;
    state._lpfFreq = lpfFreq;
    if (state._hpf) state._hpf.frequency.value = hpfFreq;
    if (state._lpf) state._lpf.frequency.value = lpfFreq;
    xyHpfLabel.textContent = `HPF: ${formatFreq(hpfFreq)}`;
    xyLpfLabel.textContent = `LPF: ${formatFreq(lpfFreq)}`;
  } else if (filterMode === 'bandpass') {
    const { freq, q } = xyPosToFreqQ(cx, cy, rect.width, rect.height);
    state._bpFreq = freq;
    state._bpQ = q;
    if (state._bandpass) {
      state._bandpass.frequency.value = freq;
      state._bandpass.Q.value = q;
    }
    xyHpfLabel.textContent = `Freq: ${formatFreq(freq)}`;
    xyLpfLabel.textContent = `Q: ${q.toFixed(1)}`;
  } else if (filterMode === 'notch') {
    const { freq, q } = xyPosToFreqQ(cx, cy, rect.width, rect.height);
    state._notchFreq = freq;
    state._notchQ = q;
    if (state._notch) {
      state._notch.frequency.value = freq;
      state._notch.Q.value = q;
    }
    xyHpfLabel.textContent = `Freq: ${formatFreq(freq)}`;
    xyLpfLabel.textContent = `Q: ${q.toFixed(1)}`;
  } else if (filterMode === 'peaking') {
    const { freq, gain } = xyPosToFreqGain(cx, cy, rect.width, rect.height);
    state._peakFreq = freq;
    state._peakGain = gain;
    state._peakQ = 2;
    if (state._peaking) {
      state._peaking.frequency.value = freq;
      state._peaking.gain.value = gain;
      state._peaking.Q.value = 2;
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
  if (state._hpf) state._hpf.Q.value = q;
});
lpfQSlider.addEventListener('input', () => {
  const q = Number(lpfQSlider.value);
  lpfQValue.textContent = q.toFixed(1);
  if (state._lpf) state._lpf.Q.value = q;
});

// メトロノーム
// --- ピッチシフト ---
const pitchShiftSlider = document.getElementById('pitch-shift');
const pitchShiftVal = document.getElementById('pitch-shift-val');
const pitchShiftReset = document.getElementById('pitch-shift-reset');
state._pitchShift = 0;

pitchShiftSlider.addEventListener('input', () => {
  const v = Number(pitchShiftSlider.value);
  state._pitchShift = v;
  pitchShiftVal.textContent = `${v >= 0 ? '+' : ''}${v} st`;
  if (typeof applyFreqShiftToActive === 'function') applyFreqShiftToActive();
});

pitchShiftReset.addEventListener('click', () => {
  pitchShiftSlider.value = 0;
  state._pitchShift = 0;
  pitchShiftVal.textContent = '0 st';
  if (typeof applyFreqShiftToActive === 'function') applyFreqShiftToActive();
});

// --- 周波数シフト ---
const freqShiftSlider = document.getElementById('freq-shift');
const freqShiftVal = document.getElementById('freq-shift-val');
const freqShiftReset = document.getElementById('freq-shift-reset');
state._freqShift = 0;

freqShiftSlider.addEventListener('input', () => {
  const v = Number(freqShiftSlider.value);
  state._freqShift = v;
  freqShiftVal.textContent = `${v >= 0 ? '+' : ''}${v} Hz`;
  if (typeof applyFreqShiftToActive === 'function') applyFreqShiftToActive();
});

freqShiftReset.addEventListener('click', () => {
  freqShiftSlider.value = 0;
  state._freqShift = 0;
  freqShiftVal.textContent = '0 Hz';
  if (typeof applyFreqShiftToActive === 'function') applyFreqShiftToActive();
});

// --- スケール変換 ---
const scaleConvertOn = document.getElementById('scale-convert-on');
const scaleKey = document.getElementById('scale-key');
const scaleFrom = document.getElementById('scale-from');
const scaleTo = document.getElementById('scale-to');

state._scaleConvert = { enabled: false, key: 0, from: 'major', to: 'minor' };

export function updateScaleConvert() {
  state._scaleConvert = {
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
  if (state._metronomeGain) {
    state._metronomeGain.gain.value = metronomeOn.checked ? Number(metronomeVol.value) / 100 : 0;
  }
});

metronomeVol.addEventListener('input', () => {
  metronomeVolVal.textContent = `${metronomeVol.value}%`;
  if (state._metronomeGain && metronomeOn.checked) {
    state._metronomeGain.gain.value = Number(metronomeVol.value) / 100;
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
  applyLimiterParams(state._limiter);
});

limiterThreshold.addEventListener('input', () => {
  limiterThresholdVal.textContent = `${limiterThreshold.value} dB`;
  applyLimiterParams(state._limiter);
});

limiterKnee.addEventListener('input', () => {
  limiterKneeVal.textContent = `${limiterKnee.value} dB`;
  applyLimiterParams(state._limiter);
});

// リミッターのゲインリダクション表示
let limiterMeterTimer = null;

export function startLimiterMeter() {
  if (limiterMeterTimer) return;
  limiterMeterTimer = setInterval(() => {
    if (state._limiter && !state._limiterBypassed) {
      const reduction = state._limiter.reduction;
      limiterReduction.textContent = `Reduction: ${reduction.toFixed(1)} dB`;
    } else {
      limiterReduction.textContent = 'Reduction: OFF';
    }
  }, 100);
}

export function stopLimiterMeter() {
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
  if (state._masterReverbWet) {
    state._masterReverbWet.gain.value = on ? Number(masterReverbMix.value) / 100 : 0;
  }
});

masterReverbMix.addEventListener('input', () => {
  masterReverbMixVal.textContent = `${masterReverbMix.value}%`;
  if (state._masterReverbWet && masterReverbOn.checked) {
    state._masterReverbWet.gain.value = Number(masterReverbMix.value) / 100;
  }
});

masterReverbDecay.addEventListener('input', () => {
  const decay = Number(masterReverbDecay.value) / 10;
  masterReverbDecayVal.textContent = `${decay.toFixed(1)}s`;
  if (state._masterReverbConvolver && state.audioCtx) {
    state._masterReverbConvolver.buffer = createReverbIR(state.audioCtx, decay, 2);
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
  if (state._masterChorusWet) {
    state._masterChorusWet.gain.value = on ? Number(masterChorusMix.value) / 100 : 0;
  }
});

masterChorusRate.addEventListener('input', () => {
  const rate = Number(masterChorusRate.value) / 10;
  masterChorusRateVal.textContent = `${rate.toFixed(1)} Hz`;
  if (state._masterChorusLfo) {
    state._masterChorusLfo.frequency.value = rate;
  }
});

masterChorusDepth.addEventListener('input', () => {
  const depth = Number(masterChorusDepth.value);
  masterChorusDepthVal.textContent = `${depth} ms`;
  if (state._masterChorusLfoGain) {
    state._masterChorusLfoGain.gain.value = depth / 1000;
  }
});

masterChorusMix.addEventListener('input', () => {
  masterChorusMixVal.textContent = `${masterChorusMix.value}%`;
  if (state._masterChorusWet && masterChorusOn.checked) {
    state._masterChorusWet.gain.value = Number(masterChorusMix.value) / 100;
  }
});

// Lucide アイコン初期化
if (typeof lucide !== 'undefined') {
  lucide.createIcons();
}
