// ============================================================
// ピアノロール描画
// ============================================================

const PIANO_PADDING_LEFT = 0;

function drawPianoRoll() {
  const canvas = document.getElementById('piano-roll-canvas');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.scale(dpr, dpr);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;

  ctx.clearRect(0, 0, W, H);
  if (!currentNotes.length) return;

  const dur = currentTotalDuration || Math.max(...currentNotes.map((n) => n.startTime + n.duration));
  // 音域検出（パディング付き）
  let minNote = 127,
    maxNote = 0;
  for (const n of currentNotes) {
    if (n.note < minNote) minNote = n.note;
    if (n.note > maxNote) maxNote = n.note;
  }
  minNote = Math.max(0, minNote - 4);
  maxNote = Math.min(127, maxNote + 4);
  const noteRange = maxNote - minNote + 1;

  const plotW = W;
  const plotH = H;

  // ノート描画
  for (const n of currentNotes) {
    const isMuted = channelStates[n.channel]?.muted;
    const anySolo = Object.values(channelStates).some((s) => s.soloed);
    const isSoloed = channelStates[n.channel]?.soloed;
    const hidden = anySolo ? !isSoloed : isMuted;

    const x = (n.startTime / dur) * plotW;
    const w = Math.max(1, (n.duration / dur) * plotW);
    const y = plotH - ((n.note - minNote + 1) / noteRange) * plotH;
    const h = Math.max(1, plotH / noteRange);

    const color = CHANNEL_COLORS[n.channel] || getThemeColor('--text-secondary', '#a89bb5');
    ctx.globalAlpha = hidden ? 0.15 : 0.85;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
  ctx.globalAlpha = 1;

  // DJ markers (hot cues, A-B loop)
  if (typeof drawDJMarkers === 'function') {
    drawDJMarkers(ctx, W, H, PIANO_PADDING_LEFT);
  }

  // Y軸ラベル（C音のみ）
  ctx.fillStyle = getThemeColor('--text-muted', '#6b5f7a');
  ctx.font = '9px monospace';
  for (let note = minNote; note <= maxNote; note++) {
    if (note % 12 === 0) {
      const y = plotH - ((note - minNote + 0.5) / noteRange) * plotH;
      ctx.fillText(`C${Math.floor(note / 12) - 1}`, 2, y + 3);
    }
  }
}

// ピアノロールクリックでシーク
document.getElementById('piano-roll-canvas').addEventListener('click', (e) => {
  if (!currentNotes.length) return;
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const PADDING_LEFT = PIANO_PADDING_LEFT;
  const plotW = canvas.clientWidth - PADDING_LEFT;
  const ratio = (x - PADDING_LEFT) / plotW;
  if (ratio < 0 || ratio > 1) return;
  const seekTime = ratio * (currentTotalDuration || 1);
  stopPlayback();
  playNotesFrom(currentNotes, currentBpm, seekTime);
});

// (removed: drum roll, density graph, donut chart, velocity histogram)

// ============================================================
// 再生ヘッド統合更新
// ============================================================

function updatePlayhead(elapsed) {
  // ピアノロール再描画 + ヘッド
  const prCanvas = document.getElementById('piano-roll-canvas');
  if (prCanvas.clientWidth > 0) {
    drawPianoRoll();
    const ctx = prCanvas.getContext('2d');
    const W = prCanvas.clientWidth;
    const H = prCanvas.clientHeight;
    const PADDING_LEFT = PIANO_PADDING_LEFT;
    const plotW = W - PADDING_LEFT;
    const dur = currentTotalDuration || 1;
    const x = PADDING_LEFT + (elapsed / dur) * plotW;
    // DJ markers (hot cues, A-B loop)
    if (typeof drawDJMarkers === 'function') {
      drawDJMarkers(ctx, W, H, PADDING_LEFT);
    }

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
}
