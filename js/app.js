// ============================================================
// UI
// ============================================================

const fileInput = document.getElementById('file-input');
const btnOpen = document.getElementById('btn-open');
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const masterVolume = document.getElementById('master-volume');
const volumeDisplay = document.getElementById('volume-display');

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

// 波形リアルタイム切替
const waveType = document.getElementById('wave-type');
waveType.addEventListener('change', () => {
  const newType = waveType.value;
  if (typeof scheduledNodes !== 'undefined') {
    for (const osc of scheduledNodes) {
      try {
        osc.type = newType;
      } catch (_) {
        /* already stopped */
      }
    }
  }
});

// ボリュームコントロール
masterVolume.addEventListener('input', () => {
  const val = masterVolume.value;
  volumeDisplay.textContent = `${val}%`;
  if (window._masterGain) {
    window._masterGain.gain.value = val / 100;
  }
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
