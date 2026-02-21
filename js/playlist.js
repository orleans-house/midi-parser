// ============================================================
// Playlist — 複数ファイル管理
// ============================================================

const SUPPORTED_EXTENSIONS = ['.mid', '.midi', '.wav', '.mp3', '.ogg', '.flac', '.aac', '.m4a', '.webm'];

const playlist = {
  tracks: [], // { name, file, buffer }
  currentIndex: -1,
  autoAdvance: true,
};

function isSupportedFile(fileName) {
  const ext = fileName.toLowerCase().replace(/^.*(\.[^.]+)$/, '$1');
  return SUPPORTED_EXTENSIONS.includes(ext);
}

function addFilesToPlaylist(fileList) {
  const files = Array.from(fileList).filter((f) => isSupportedFile(f.name));
  if (files.length === 0) return;

  // 名前順にソート
  files.sort((a, b) => a.name.localeCompare(b.name));

  for (const file of files) {
    playlist.tracks.push({ name: file.name, file, buffer: null });
  }

  renderPlaylist();

  // 最初のファイルが追加された場合は自動選択
  if (playlist.currentIndex === -1) {
    selectTrack(0);
  }
}

function clearPlaylist() {
  playlist.tracks = [];
  playlist.currentIndex = -1;
  renderPlaylist();
}

function selectTrack(index) {
  if (index < 0 || index >= playlist.tracks.length) return Promise.resolve();
  playlist.currentIndex = index;
  renderPlaylist();

  const track = playlist.tracks[index];
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      track.buffer = e.target.result;
      if (isAudioFile(track.name)) {
        processAudioFile(e.target.result, track.name);
      } else {
        processMidi(e.target.result, track.name);
      }
      resolve();
    };
    reader.readAsArrayBuffer(track.file);
  });
}

async function playNextTrack() {
  if (!playlist.autoAdvance) return;
  const next = playlist.currentIndex + 1;
  if (next < playlist.tracks.length) {
    await selectTrack(next);
    if (audioFileMode) {
      playAudioFile(window._audioFileRawBuffer);
    } else {
      playNotes(currentNotes, currentBpm);
    }
  }
}

async function playPrevTrack() {
  const prev = playlist.currentIndex - 1;
  if (prev >= 0) {
    await selectTrack(prev);
    if (audioFileMode) {
      playAudioFile(window._audioFileRawBuffer);
    } else {
      playNotes(currentNotes, currentBpm);
    }
  }
}

function renderPlaylist() {
  const section = document.getElementById('playlist-section');
  const ul = document.getElementById('playlist');
  const countSpan = document.getElementById('playlist-count');

  if (playlist.tracks.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  countSpan.textContent = `(${playlist.tracks.length})`;
  ul.innerHTML = '';

  for (let i = 0; i < playlist.tracks.length; i++) {
    const li = document.createElement('li');
    li.textContent = playlist.tracks[i].name;
    li.classList.add('playlist-item');
    if (i === playlist.currentIndex) {
      li.classList.add('active');
    }
    li.addEventListener('click', () => selectTrack(i));
    ul.appendChild(li);
  }
}
