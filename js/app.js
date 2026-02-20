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

  // テンポ表示
  document.getElementById('tempo-display').textContent = `${bpm} BPM | ${fileName}`;

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
btnPlay.addEventListener('click', () => playNotes(currentNotes, currentBpm));
btnStop.addEventListener('click', () => stopPlayback());
