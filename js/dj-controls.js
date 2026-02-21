// ============================================================
// DJ Controls: Hot Cue, A-B Loop, Beat Jump
// ============================================================

// --- Hot Cue ---
const hotCues = [null, null, null, null, null, null, null, null];

function getCurrentPlaybackTime() {
  if (!isPlaying || !playbackStartReal) return 0;
  const pause = isPaused ? performance.now() - pauseStartTime + pauseDuration : pauseDuration;
  return (performance.now() - playbackStartReal - pause) / 1000 + playbackStartOffset;
}

document.getElementById('hot-cue-pads').addEventListener('click', (e) => {
  const pad = e.target.closest('.hot-cue-pad');
  if (!pad || !currentNotes.length) return;
  const slot = Number(pad.dataset.slot);

  if (hotCues[slot] === null) {
    // Set cue at current position
    const time = isPlaying ? getCurrentPlaybackTime() : 0;
    hotCues[slot] = time;
    pad.classList.add('set');
    pad.title = `${time.toFixed(1)}s`;
  } else {
    // Jump to cue
    stopPlayback();
    playNotesFrom(currentNotes, currentBpm, hotCues[slot]);
  }
});

// Right-click to clear a hot cue
document.getElementById('hot-cue-pads').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const pad = e.target.closest('.hot-cue-pad');
  if (!pad) return;
  const slot = Number(pad.dataset.slot);
  hotCues[slot] = null;
  pad.classList.remove('set');
  pad.title = '';
});

// --- A-B Loop ---
let loopA = null;
let loopB = null;
let loopTimerId = null;

const btnLoopA = document.getElementById('btn-loop-a');
const btnLoopB = document.getElementById('btn-loop-b');
const btnLoopClear = document.getElementById('btn-loop-clear');
const abLoopInfo = document.getElementById('ab-loop-info');

btnLoopA.addEventListener('click', () => {
  if (!currentNotes.length) return;
  loopA = isPlaying ? getCurrentPlaybackTime() : 0;
  btnLoopA.classList.add('active');
  btnLoopB.disabled = false;
  abLoopInfo.textContent = `A: ${loopA.toFixed(1)}s`;
});

btnLoopB.addEventListener('click', () => {
  if (loopA === null || !currentNotes.length) return;
  loopB = isPlaying ? getCurrentPlaybackTime() : currentTotalDuration;
  if (loopB <= loopA) return;
  btnLoopB.classList.add('active');
  abLoopInfo.textContent = `A: ${loopA.toFixed(1)}s → B: ${loopB.toFixed(1)}s`;
  startABLoop();
});

btnLoopClear.addEventListener('click', clearABLoop);

function startABLoop() {
  clearLoopTimer();
  // Jump to A point
  stopPlayback();
  playNotesFrom(currentNotes, currentBpm, loopA);

  // Schedule loop back to A when reaching B
  const loopDuration = loopB - loopA;
  loopTimerId = setTimeout(() => {
    if (loopA !== null && loopB !== null) {
      startABLoop();
    }
  }, loopDuration * 1000);
}

function clearABLoop() {
  loopA = null;
  loopB = null;
  clearLoopTimer();
  btnLoopA.classList.remove('active');
  btnLoopB.classList.remove('active');
  btnLoopB.disabled = true;
  abLoopInfo.textContent = '';
}

function clearLoopTimer() {
  if (loopTimerId) {
    clearTimeout(loopTimerId);
    loopTimerId = null;
  }
}

// --- Beat Jump ---
document.getElementById('beat-jump-controls').addEventListener('click', (e) => {
  const btn = e.target.closest('.beat-jump-btn');
  if (!btn || !isPlaying || !currentNotes.length) return;
  const beats = Number(btn.dataset.beats);
  const beatDuration = 60 / currentBpm;
  const jumpTime = beats * beatDuration;
  const current = getCurrentPlaybackTime();
  const target = Math.max(0, Math.min(current + jumpTime, currentTotalDuration));
  stopPlayback();
  playNotesFrom(currentNotes, currentBpm, target);
});

// --- Piano Roll Markers ---
function drawDJMarkers(ctx, W, H, paddingLeft = 0) {
  const dur = currentTotalDuration || 1;
  const plotW = W - paddingLeft;

  // Hot Cue markers
  for (let i = 0; i < hotCues.length; i++) {
    if (hotCues[i] === null) continue;
    const x = paddingLeft + (hotCues[i] / dur) * plotW;
    ctx.save();
    ctx.strokeStyle = '#b39ddb';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.setLineDash([]);
    // Label
    ctx.fillStyle = '#b39ddb';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText(`${i + 1}`, x + 2, 10);
    ctx.restore();
  }

  // A-B Loop region
  if (loopA !== null) {
    const xA = paddingLeft + (loopA / dur) * plotW;
    ctx.save();
    ctx.strokeStyle = '#81c784';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xA, 0);
    ctx.lineTo(xA, H);
    ctx.stroke();
    ctx.fillStyle = '#81c784';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('A', xA + 2, H - 4);
    ctx.restore();

    if (loopB !== null) {
      const xB = paddingLeft + (loopB / dur) * plotW;
      // Shaded region
      ctx.save();
      ctx.fillStyle = 'rgba(129, 199, 132, 0.1)';
      ctx.fillRect(xA, 0, xB - xA, H);
      ctx.strokeStyle = '#81c784';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xB, 0);
      ctx.lineTo(xB, H);
      ctx.stroke();
      ctx.fillStyle = '#81c784';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('B', xB + 2, H - 4);
      ctx.restore();
    }
  }
}

// Reset hot cues when new file is loaded
function resetDJControls() {
  for (let i = 0; i < hotCues.length; i++) hotCues[i] = null;
  for (const pad of document.querySelectorAll('.hot-cue-pad')) {
    pad.classList.remove('set');
    pad.title = '';
  }
  clearABLoop();
}
