// ============================================================
// チャンネル管理
// ============================================================

import { getChannelFx, getThemeColor, resolveVoice } from './globals.js';
import { getInstrumentName } from './midi-parser.js';
import { invalidatePianoRollCache } from './piano-roll.js';
import state from './state/audioState.js';
import { CUSTOM_WAVEFORMS } from './waveforms.js';

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

export { CHANNEL_COLORS };

function getChannelLabel(ch) {
  const num = ch + 1;
  if (num === 10) return 'Ch.10 (Drums)';
  const voice = resolveVoice(ch);
  const voiceName = getVoiceDisplayName(ch);
  if (voiceName) return `Ch.${num} - ${voiceName}`;
  return `Ch.${num}`;
}

export function getChannelColor(ch) {
  return CHANNEL_COLORS[ch % CHANNEL_COLORS.length];
}

export function detectChannels(notes) {
  const channels = new Set();
  for (const n of notes) channels.add(n.channel);
  return [...channels].sort((a, b) => a - b);
}

export function buildChannelUI(channels) {
  const container = document.getElementById('visualizer-container');
  container.innerHTML = '';
  state.channelStates = {};

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
    state.channelStates[ch] = {
      muted: !isActive,
      soloed: false,
      gainNode: null,
      analyser: null,
      active: isActive,
    };

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
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      // Mute/Soloボタンのクリックは除外
      if (e.target.closest('.btn-ch')) return;
      showChannelDetail(ch);
    });
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

  // エフェクターモジュールグリッド
  buildFxModules(allChannels, channels);

  // Lucide アイコン再初期化
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function buildFxModules(allChannels, activeChannels) {
  let fxContainer = document.getElementById('fx-module-container');
  if (!fxContainer) {
    fxContainer = document.createElement('div');
    fxContainer.id = 'fx-module-container';
    fxContainer.className = 'fx-module-grid';
    const vizSection = document.getElementById('visualizer-section');
    vizSection.appendChild(fxContainer);
  }
  fxContainer.innerHTML = '';

  // ケーブル接続SVG（既存を再利用 or 新規作成）
  let cableSection = document.getElementById('cable-section');
  if (!cableSection) {
    cableSection = document.createElement('div');
    cableSection.id = 'cable-section';
    cableSection.className = 'cable-section';
    fxContainer.before(cableSection);
  }
  cableSection.innerHTML = '';

  for (const ch of allChannels) {
    const isActive = activeChannels.includes(ch);
    const mod = document.createElement('div');
    mod.className = `fx-module${isActive ? '' : ' fx-module-inactive'}`;
    mod.id = `fx-module-${ch}`;

    const header = document.createElement('div');
    header.className = 'fx-module-header';
    header.innerHTML = `<span class="fx-module-label" style="color:${getChannelColor(ch)}">Ch.${ch + 1}</span>
`;

    const body = document.createElement('div');
    body.className = 'fx-module-body';
    body.style.display = 'block';

    // 波形選択
    const waveSection = document.createElement('div');
    waveSection.className = 'fx-mod-section';
    waveSection.innerHTML = `<span class="fx-mod-title">Wave</span>
      <div class="fx-wave-btns">
        <button class="fx-wave-btn active" data-ch="${ch}" data-wave="triangle"><svg class="wave-icon" role="img" aria-hidden="true" viewBox="0 0 24 16"><polyline points="0,12 6,4 12,12 18,4 24,12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"/></svg></button>
        <button class="fx-wave-btn" data-ch="${ch}" data-wave="sine"><svg class="wave-icon" role="img" aria-hidden="true" viewBox="0 0 24 16"><path d="M0,8 C3,2 6,2 8,8 C10,14 13,14 16,8 C18,2 21,2 24,8" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
        <button class="fx-wave-btn" data-ch="${ch}" data-wave="square"><svg class="wave-icon" role="img" aria-hidden="true" viewBox="0 0 24 16"><polyline points="0,12 0,4 6,4 6,12 12,12 12,4 18,4 18,12 24,12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"/></svg></button>
        <button class="fx-wave-btn" data-ch="${ch}" data-wave="sawtooth"><svg class="wave-icon" role="img" aria-hidden="true" viewBox="0 0 24 16"><polyline points="0,12 12,4 12,12 24,4 24,12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"/></svg></button>
      </div>`;

    // ディストーション
    const distSection = document.createElement('div');
    distSection.className = 'fx-mod-section';
    distSection.innerHTML = `<label class="fx-mod-row"><input type="checkbox" class="ch-fx-toggle" data-ch="${ch}" data-fx="distortion"> <span>Dist</span>
      <input type="range" class="ch-fx-slider slider-h" data-ch="${ch}" data-fx="distortion" min="0" max="100" value="50" disabled>
      <span class="ch-fx-val">50</span></label>`;

    // ディレイ
    const delaySection = document.createElement('div');
    delaySection.className = 'fx-mod-section';
    delaySection.innerHTML = `<label class="fx-mod-row"><input type="checkbox" class="ch-fx-toggle" data-ch="${ch}" data-fx="delay"> <span>Delay</span>
      <input type="range" class="ch-fx-slider slider-h" data-ch="${ch}" data-fx="delay" min="50" max="800" value="300" disabled>
      <span class="ch-fx-val">300</span></label>`;

    // リバーブ
    const reverbSection = document.createElement('div');
    reverbSection.className = 'fx-mod-section';
    reverbSection.innerHTML = `<label class="fx-mod-row"><input type="checkbox" class="ch-fx-toggle" data-ch="${ch}" data-fx="reverb"> <span>Reverb</span>
      <input type="range" class="ch-fx-slider slider-h" data-ch="${ch}" data-fx="reverb" min="0" max="100" value="40" disabled>
      <span class="ch-fx-val">40</span></label>`;

    body.append(waveSection, distSection, delaySection, reverbSection);
    mod.append(header, body);
    fxContainer.appendChild(mod);
  }

  // channelFxState からUI状態を復元
  restoreFxUI(allChannels);

  // ケーブルSVG描画
  requestAnimationFrame(() => drawCables(allChannels));
}

// channelFxState の値をFXモジュールUIに反映
function restoreFxUI(channels) {
  for (const ch of channels) {
    const chFx = getChannelFx(ch);
    const mod = document.getElementById(`fx-module-${ch}`);
    if (!mod) continue;

    // 波形ボタン
    for (const btn of mod.querySelectorAll('.fx-wave-btn')) {
      btn.classList.toggle('active', btn.dataset.wave === chFx.waveType);
    }

    // エフェクトトグル＋スライダー
    const fxMap = {
      distortion: {
        val: chFx.distortion.amount,
        enabled: chFx.distortion.enabled,
      },
      delay: { val: chFx.delay.time, enabled: chFx.delay.enabled },
      reverb: { val: chFx.reverb.mix, enabled: chFx.reverb.enabled },
    };
    for (const [fx, cfg] of Object.entries(fxMap)) {
      const toggle = mod.querySelector(`.ch-fx-toggle[data-fx="${fx}"]`);
      const slider = mod.querySelector(`.ch-fx-slider[data-fx="${fx}"]`);
      const valDisplay = mod.querySelector(`.ch-fx-slider[data-fx="${fx}"] ~ .ch-fx-val`);
      if (toggle) {
        toggle.checked = cfg.enabled;
      }
      if (slider) {
        slider.value = cfg.val;
        slider.disabled = !cfg.enabled;
      }
      if (valDisplay) {
        valDisplay.textContent = cfg.val;
      }
    }
  }
}

function drawCables(allChannels) {
  const cableSection = document.getElementById('cable-section');
  if (!cableSection) return;
  cableSection.innerHTML = '';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cable-svg');
  svg.style.width = '100%';
  svg.style.height = '32px';
  svg.style.overflow = 'visible';

  // 16本の縦線ケーブル（各チャンネル、均等配置）
  const svgRect = cableSection.getBoundingClientRect();
  const totalWidth = svgRect.width;
  for (let i = 0; i < allChannels.length; i++) {
    const ch = allChannels[i];
    const x = ((i + 0.5) / allChannels.length) * totalWidth;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x);
    line.setAttribute('y1', 0);
    line.setAttribute('x2', x);
    line.setAttribute('y2', 32);
    line.setAttribute('stroke', getChannelColor(ch));
    line.setAttribute('stroke-width', '2');
    line.setAttribute('opacity', '0.4');
    svg.appendChild(line);
  }

  cableSection.appendChild(svg);
}

export function toggleMute(ch) {
  const chState = state.channelStates[ch];
  chState.muted = !chState.muted;
  const btn = document.querySelector(`#channel-card-${ch} .btn-mute`);
  btn.classList.toggle('active', chState.muted);
  updateChannelGains();
  if (typeof invalidatePianoRollCache === 'function') invalidatePianoRollCache();
}

export function toggleSolo(ch) {
  const chState = state.channelStates[ch];
  chState.soloed = !chState.soloed;
  const btn = document.querySelector(`#channel-card-${ch} .btn-solo`);
  btn.classList.toggle('active', chState.soloed);
  updateChannelGains();
  if (typeof invalidatePianoRollCache === 'function') invalidatePianoRollCache();
}

export function updateChannelGains() {
  const anySolo = Object.values(state.channelStates).some((s) => s.soloed);
  for (const [ch, chState] of Object.entries(state.channelStates)) {
    if (!chState.gainNode) continue;
    const shouldPlay = anySolo ? chState.soloed && !chState.muted : !chState.muted;
    chState.playGate = shouldPlay ? 1 : 0;
    applyChannelGain(chState);
  }
}

// waveGain × playGate を gainNode に適用
export function applyChannelGain(chState) {
  if (!chState.gainNode) return;
  const waveGain = chState.waveGain ?? 1;
  const playGate = chState.playGate ?? 1;
  chState.gainNode.gain.value = waveGain * playGate;
}

// --- チャンネル詳細パネル ---
const BASIC_WAVES = ['sine', 'square', 'sawtooth', 'triangle'];

function getVoiceDisplayName(ch) {
  const voice = resolveVoice(ch);
  if (voice.type === 'sf2') {
    const key = `${voice.bank}-${voice.preset}`;
    const preset = state._sf2PresetMap?.[key];
    return preset ? `🎹 ${preset.name}` : `SF2 B${voice.bank}:P${voice.preset}`;
  }
  if (voice.type === 'custom' || voice.type === 'waveform') {
    const custom = CUSTOM_WAVEFORMS[voice.waveType];
    if (custom) return `🎵 ${custom.label}`;
    return `〜 ${voice.waveType}`;
  }
  return '';
}

export function updateVoiceLabels() {
  for (let ch = 0; ch < 16; ch++) {
    const card = document.getElementById(`channel-card-${ch}`);
    if (!card) continue;
    const label = card.querySelector('.channel-label');
    if (label) label.textContent = getChannelLabel(ch);
  }
  // 再生中なら即時反映（動的importで循環依存を回避）
  if (state.isPlaying) {
    import('./audio-engine.js').then((m) => m.reschedulePlayback());
  }
}

function showChannelDetail(ch) {
  // 既存のパネルがあれば閉じる
  const existing = document.getElementById('channel-detail-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'channel-detail-overlay';
  overlay.className = 'modal-overlay';

  const panel = document.createElement('div');
  panel.className = 'modal-content channel-detail-panel';

  // ヘッダー
  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('h3');
  title.textContent = getChannelLabel(ch);
  title.style.color = getChannelColor(ch);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => overlay.remove());
  header.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = 'modal-body';

  // MIDI意図（GM楽器名）
  const program = state.channelPrograms[ch];
  if (program !== undefined) {
    const midiIntent = document.createElement('div');
    midiIntent.className = 'channel-detail-midi-intent';
    midiIntent.textContent = `MIDI楽器: ${getInstrumentName(program)}`;
    body.appendChild(midiIntent);
  }

  // 現在の音色
  const currentVoice = document.createElement('div');
  currentVoice.className = 'channel-detail-current';
  currentVoice.textContent = `現在の音色: ${getVoiceDisplayName(ch)}`;
  body.appendChild(currentVoice);

  // デフォルトに戻す
  const resetBtn = document.createElement('button');
  resetBtn.className = 'channel-detail-reset';
  resetBtn.textContent = '↩ デフォルトに戻す';
  resetBtn.addEventListener('click', () => {
    const chFx = getChannelFx(ch);
    chFx.voiceSource = { type: 'global' };
    currentVoice.textContent = `現在の音色: ${getVoiceDisplayName(ch)}`;
    updateVoiceLabels();
  });
  body.appendChild(resetBtn);

  // 基本波形
  addVoiceSection(
    body,
    '基本波形',
    BASIC_WAVES.map((w) => ({
      label: `〜 ${w}`,
      onClick: () => {
        getChannelFx(ch).voiceSource = { type: 'waveform', waveType: w };
        currentVoice.textContent = `現在の音色: ${getVoiceDisplayName(ch)}`;
        updateVoiceLabels();
      },
    })),
  );

  // カスタム波形
  const customEntries = Object.entries(CUSTOM_WAVEFORMS);
  if (customEntries.length > 0) {
    addVoiceSection(
      body,
      'カスタム波形',
      customEntries.map(([key, cw]) => ({
        label: `🎵 ${cw.label}`,
        onClick: () => {
          getChannelFx(ch).voiceSource = { type: 'custom', waveType: key };
          currentVoice.textContent = `現在の音色: ${getVoiceDisplayName(ch)}`;
          updateVoiceLabels();
        },
      })),
    );
  }

  // SF2プリセット
  if (state._useSF && state._sf2PresetMap) {
    const presets = Object.values(state._sf2PresetMap).sort((a, b) => a.bank - b.bank || a.preset - b.preset);
    addVoiceSection(
      body,
      `SF2: ${state._sf?.info?.INAM || 'SoundFont'}`,
      presets.map((p) => ({
        label: `🎹 B${p.bank}:P${p.preset} ${p.name}`,
        onClick: () => {
          getChannelFx(ch).voiceSource = { type: 'sf2', bank: p.bank, preset: p.preset };
          currentVoice.textContent = `現在の音色: ${getVoiceDisplayName(ch)}`;
          updateVoiceLabels();
        },
      })),
    );
  }

  panel.append(header, body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // オーバーレイクリックで閉じる
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function addVoiceSection(container, title, items) {
  const section = document.createElement('div');
  section.className = 'sf2-info-section';
  const h4 = document.createElement('h4');
  h4.textContent = title;
  section.appendChild(h4);

  const grid = document.createElement('div');
  grid.className = 'voice-grid';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.className = 'voice-grid-btn';
    btn.textContent = item.label;
    btn.addEventListener('click', item.onClick);
    grid.appendChild(btn);
  }
  section.appendChild(grid);
  container.appendChild(section);
}
