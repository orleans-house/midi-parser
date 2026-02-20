// ============================================================
// ============================================================
// チャンネル管理
// ============================================================

const CHANNEL_COLORS = [
  '#b39ddb', // パステル紫
  '#ef9a9a', // パステルレッド
  '#81c784', // パステルグリーン
  '#fff59d', // パステルイエロー
  '#ce93d8', // ライトパープル
  '#ffcc80', // パステルオレンジ
  '#80cbc4', // パステルティール
  '#9fa8da', // パステルインディゴ
  '#f48fb1', // パステルピンク
  '#c5e1a5', // パステルライム
  '#80deea', // パステルシアン
  '#ffab91', // パステルコーラル
  '#a5d6a7', // パステルミント
  '#ffe082', // パステルアンバー
  '#b39ddb', // パステル紫（リピート）
  '#90caf9', // パステルブルー
];

function getChannelLabel(ch) {
  const num = ch + 1;
  if (num === 10) return 'Ch.10 (Drums)';
  const program = channelPrograms[ch];
  if (program !== undefined) {
    return `Ch.${num} - ${getInstrumentName(program)}`;
  }
  return `Ch.${num}`;
}

function getChannelColor(ch) {
  return CHANNEL_COLORS[ch % CHANNEL_COLORS.length];
}

function detectChannels(notes) {
  const channels = new Set();
  for (const n of notes) channels.add(n.channel);
  return [...channels].sort((a, b) => a - b);
}

function buildChannelUI(channels) {
  const container = document.getElementById('visualizer-container');
  container.innerHTML = '';
  channelStates = {};

  // マスター合成波カード（4列幅）
  const masterCard = document.createElement('div');
  masterCard.className = 'channel-card';
  masterCard.style.gridColumn = '1 / -1';
  const masterHeader = document.createElement('div');
  masterHeader.className = 'channel-header';
  const masterLabel = document.createElement('span');
  masterLabel.className = 'channel-label';
  masterLabel.innerHTML = '<i data-lucide="volume-2"></i> Master';
  masterHeader.append(masterLabel);
  const masterCanvas = document.createElement('canvas');
  masterCanvas.id = 'waveform-master';
  masterCanvas.height = 80;
  masterCanvas.style.width = '100%';
  masterCanvas.style.background = getThemeColor('--bg-canvas', '#140f1a');
  masterCanvas.style.borderRadius = '4px';
  masterCanvas.style.display = 'block';
  masterCard.append(masterHeader, masterCanvas);
  container.appendChild(masterCard);

  // 全16チャンネル表示（0-15）
  const allChannels = Array.from({ length: 16 }, (_, i) => i);

  for (const ch of allChannels) {
    const isActive = channels.includes(ch);
    channelStates[ch] = { muted: !isActive, soloed: false, gainNode: null, analyser: null, active: isActive };

    const card = document.createElement('div');
    card.className = `channel-card${isActive ? '' : ' channel-inactive'}`;
    card.id = `channel-card-${ch}`;

    const header = document.createElement('div');
    header.className = 'channel-header';

    const label = document.createElement('span');
    label.className = 'channel-label';
    label.style.color = getChannelColor(ch);
    label.textContent = getChannelLabel(ch);

    const btnMute = document.createElement('button');
    btnMute.className = 'btn-ch btn-mute';
    btnMute.textContent = 'M';
    btnMute.title = 'Mute';
    btnMute.addEventListener('click', () => toggleMute(ch));

    const btnSolo = document.createElement('button');
    btnSolo.className = 'btn-ch btn-solo';
    btnSolo.textContent = 'S';
    btnSolo.title = 'Solo';
    btnSolo.addEventListener('click', () => toggleSolo(ch));

    header.append(label, btnMute, btnSolo);

    const canvas = document.createElement('canvas');
    canvas.id = `waveform-${ch}`;
    canvas.height = 80;
    canvas.style.width = '100%';
    canvas.style.background = getThemeColor('--bg-canvas', '#140f1a');
    canvas.style.borderRadius = '4px';
    canvas.style.display = 'block';

    card.append(header, canvas);
    container.appendChild(card);

    // NO SIGNAL表示
    if (!isActive) {
      requestAnimationFrame(() => {
        canvas.width = canvas.offsetWidth;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = getThemeColor('--bg-canvas', '#140f1a');
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = getThemeColor('--border', '#3a2e4a');
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO SIGNAL', canvas.width / 2, canvas.height / 2 + 4);
      });
    }
  }

  // Lucide アイコン再初期化
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function toggleMute(ch) {
  const state = channelStates[ch];
  state.muted = !state.muted;
  const btn = document.querySelector(`#channel-card-${ch} .btn-mute`);
  btn.classList.toggle('active', state.muted);
  updateChannelGains();
}

function toggleSolo(ch) {
  const state = channelStates[ch];
  state.soloed = !state.soloed;
  const btn = document.querySelector(`#channel-card-${ch} .btn-solo`);
  btn.classList.toggle('active', state.soloed);
  updateChannelGains();
}

function updateChannelGains() {
  const anySolo = Object.values(channelStates).some((s) => s.soloed);
  for (const [ch, state] of Object.entries(channelStates)) {
    if (!state.gainNode) continue;
    const shouldPlay = anySolo ? state.soloed && !state.muted : !state.muted;
    state.gainNode.gain.value = shouldPlay ? 1 : 0;
  }
}
