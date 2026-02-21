// ============================================================
// ピアノロール描画（オフスクリーンキャッシュ方式）
// ============================================================

const PIANO_PADDING_LEFT = 0;

// オフスクリーンCanvasにノート+ラベルをキャッシュ
let pianoRollCache = null;
let pianoRollCacheW = 0;
let pianoRollCacheH = 0;

function buildPianoRollCache() {
  const canvas = document.getElementById('piano-roll-canvas');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;

  if (!W || !H || !currentNotes.length) {
    pianoRollCache = null;
    return;
  }

  // オフスクリーンCanvas作成
  const offscreen = document.createElement('canvas');
  offscreen.width = W * dpr;
  offscreen.height = H * dpr;
  const ctx = offscreen.getContext('2d');
  ctx.scale(dpr, dpr);

  const dur = currentTotalDuration || Math.max(...currentNotes.map((n) => n.startTime + n.duration));

  // 音域検出（パディング付き）
  let minNote = 127;
  let maxNote = 0;
  for (const n of currentNotes) {
    if (n.note < minNote) minNote = n.note;
    if (n.note > maxNote) maxNote = n.note;
  }
  minNote = Math.max(0, minNote - 4);
  maxNote = Math.min(127, maxNote + 4);
  const noteRange = maxNote - minNote + 1;

  // ノート描画
  for (const n of currentNotes) {
    const isMuted = channelStates[n.channel]?.muted;
    const anySolo = Object.values(channelStates).some((s) => s.soloed);
    const isSoloed = channelStates[n.channel]?.soloed;
    const hidden = anySolo ? !isSoloed : isMuted;

    const x = (n.startTime / dur) * W;
    const w = Math.max(1, (n.duration / dur) * W);
    const y = H - ((n.note - minNote + 1) / noteRange) * H;
    const h = Math.max(1, H / noteRange);

    const color = CHANNEL_COLORS[n.channel] || getThemeColor('--text-secondary', '#a89bb5');
    ctx.globalAlpha = hidden ? 0.15 : 0.85;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
  ctx.globalAlpha = 1;

  // Y軸ラベル（C音のみ）
  ctx.fillStyle = getThemeColor('--text-muted', '#6b5f7a');
  ctx.font = '9px monospace';
  for (let note = minNote; note <= maxNote; note++) {
    if (note % 12 === 0) {
      const y = H - ((note - minNote + 0.5) / noteRange) * H;
      ctx.fillText(`C${Math.floor(note / 12) - 1}`, 2, y + 3);
    }
  }

  pianoRollCache = offscreen;
  pianoRollCacheW = W;
  pianoRollCacheH = H;
}

// キャッシュを無効化（mute/solo変更時、ファイル再読み込み時に呼ぶ）
function invalidatePianoRollCache() {
  pianoRollCache = null;
}

function drawPianoRoll() {
  const canvas = document.getElementById('piano-roll-canvas');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, W, H);
  if (!currentNotes.length) return;

  // キャッシュがなければ構築
  if (!pianoRollCache || pianoRollCacheW !== W || pianoRollCacheH !== H) {
    buildPianoRollCache();
  }

  // キャッシュを貼り付け
  if (pianoRollCache) {
    ctx.drawImage(pianoRollCache, 0, 0, W, H);
  }

  // DJ markers (hot cues, A-B loop) — 動的要素なのでキャッシュ外
  if (typeof drawDJMarkers === 'function') {
    drawDJMarkers(ctx, W, H, PIANO_PADDING_LEFT);
  }
}

// ピアノロールクリックでシーク
document.getElementById('piano-roll-canvas').addEventListener('click', (e) => {
  if (!currentNotes.length && !audioFileMode) return;
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const PADDING_LEFT = PIANO_PADDING_LEFT;
  const plotW = canvas.clientWidth - PADDING_LEFT;
  const ratio = (x - PADDING_LEFT) / plotW;
  if (ratio < 0 || ratio > 1) return;
  const seekTime = ratio * (currentTotalDuration || 1);
  stopPlayback();
  if (audioFileMode) {
    playAudioFile(window._audioFileRawBuffer, seekTime);
  } else {
    playNotesFrom(currentNotes, currentBpm, seekTime);
  }
});

// ============================================================
// 再生ヘッド統合更新
// ============================================================

function updatePlayhead(elapsed) {
  const prCanvas = document.getElementById('piano-roll-canvas');
  if (prCanvas.clientWidth <= 0) return;

  // キャッシュから再描画（ノート部分はキャッシュ済み）
  drawPianoRoll();

  const ctx = prCanvas.getContext('2d');
  const W = prCanvas.clientWidth;
  const H = prCanvas.clientHeight;
  const PADDING_LEFT = PIANO_PADDING_LEFT;
  const plotW = W - PADDING_LEFT;
  const dur = currentTotalDuration || 1;
  const x = PADDING_LEFT + (elapsed / dur) * plotW;

  // Playhead
  ctx.save();
  ctx.strokeStyle = getThemeColor('--accent-green', '#81c784');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, H);
  ctx.stroke();
  ctx.restore();
}
