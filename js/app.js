// ============================================================
// UI
// ============================================================

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');


// ドラッグ&ドロップ
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) loadFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) loadFile(fileInput.files[0]);
});

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      processMidi(e.target.result, file.name);
    } catch (err) {
      alert('MIDIパースエラー: ' + err.message);
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

  // ヘッダー情報表示
  document.getElementById('info-format').textContent = `Type ${parsed.header.format}`;
  document.getElementById('info-tracks').textContent = parsed.header.numTracks;
  document.getElementById('info-division').textContent = parsed.header.timeDivision + ' ticks/beat';
  document.getElementById('info-tempo').textContent = `${bpm} BPM (${tempo} μs/beat)`;
  document.getElementById('info-notes').textContent = notes.length;
  // document.getElementById('header-info').style.display = 'block';

  // テンポ表示
  document.getElementById('tempo-display').textContent = `${bpm} BPM | ${fileName}`;

  // チャンネルUI構築
  buildChannelUI(currentChannels);
  document.getElementById('visualizer-section').style.display = 'block';

  // セクション表示
  document.getElementById('controls').style.display = 'flex';
  btnPlay.disabled = false;
  btnStop.disabled = true;

  // 全体の長さを事前計算
  currentTotalDuration = notes.length > 0
    ? Math.max(...notes.map(n => n.startTime + n.duration))
    : 0;

  // 可視化セクションを先に表示（Canvas描画にclientWidth必要）
  document.getElementById('piano-roll-section').style.display = 'block';

  // 描画（表示後に実行）
  requestAnimationFrame(() => {
    drawPianoRoll();
  });
}

// 再生コントロール
btnPlay.addEventListener('click', () => playNotes(currentNotes, currentBpm));
btnStop.addEventListener('click', () => stopPlayback());

