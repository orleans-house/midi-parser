/**
 * ユニットテスト用 DOM セットアップ
 * トップレベルで document.getElementById を呼ぶモジュールのために
 * 必要最小限のDOM要素を生成する
 */

const elements = [
  // dj-controls.js
  'hot-cue-pads',
  'btn-loop-a',
  'btn-loop-b',
  'btn-loop-clear',
  'ab-loop-info',
  'beat-jump-controls',
  // piano-roll.js
  'piano-roll-canvas',
  // playlist.js
  'btn-playlist-toggle',
  'playlist-panel',
  'playlist-items',
  'btn-playlist-add',
  'playlist-file-input',
  'btn-playlist-clear',
  'btn-prev',
  'btn-next',
  // visualizer.js
  'visualizer-container',
  // app.js — 全DOM要素
  'file-input',
  'btn-open',
  'btn-play',
  'btn-stop',
  'wave-type',
  'custom-waveform-select',
  'drag-overlay',
  'folder-input',
  'btn-open-folder',
  'vol-slider',
  'bpm-display',
  'current-file',
  'playback-time',
  'pitch-shift',
  'pitch-shift-val',
  'pitch-shift-reset',
  'freq-shift',
  'freq-shift-val',
  'freq-shift-reset',
  'scale-convert-on',
  'scale-from',
  'scale-to',
  'scale-key',
  'detected-key',
  'drop-zone',
  'spectrum-canvas',
  'master-volume',
  'master-vol-pct',
  'master-reverb-on',
  'master-reverb-mix',
  'master-reverb-mix-val',
  'master-reverb-decay',
  'master-reverb-decay-val',
  'master-chorus-on',
  'master-chorus-rate',
  'master-chorus-rate-val',
  'master-chorus-depth',
  'master-chorus-depth-val',
  'master-chorus-mix',
  'master-chorus-mix-val',
  'hpf-slider',
  'hpf-freq',
  'lpf-slider',
  'lpf-freq',
  'hpf-q',
  'hpf-q-value',
  'lpf-q',
  'lpf-q-value',
  'xy-pad',
  'xy-cursor',
  'filter-mode',
  'xy-hpf-label',
  'xy-lpf-label',
  'metronome-on',
  'metronome-vol',
  'metronome-vol-val',
  'metronome-type',
  'limiter-on',
  'limiter-threshold',
  'limiter-threshold-val',
  'limiter-knee',
  'limiter-knee-val',
  'limiter-reduction',
  'btn-load-sf2',
  'sf2-input',
  'sf2-name',
  'btn-sf2-info',
  'sf2-info-modal',
  'sf2-info-title',
  'sf2-channel-assignments',
  'sf2-preset-list',
  'btn-sf2-info-close',
  'btn-repeat',
  'position-display',
  'info-filename',
  'info-format',
  'info-tracks',
  'info-division',
  'info-tempo',
  'info-notes',
  'info-key',
];

for (const id of elements) {
  if (!document.getElementById(id)) {
    const canvasIds = ['piano-roll-canvas', 'spectrum-canvas', 'xy-pad'];
    const tag =
      canvasIds.includes(id) || id.includes('canvas')
        ? 'canvas'
        : id.includes('slider') ||
            id.includes('vol') ||
            id.includes('shift') ||
            id.includes('threshold') ||
            id.includes('knee') ||
            id.includes('-q')
          ? 'input'
          : id.includes('select') ||
              id.includes('type') ||
              id.includes('from') ||
              id.includes('to') ||
              id.includes('key') ||
              id.includes('mode')
            ? 'select'
            : id.includes('-on') || id.includes('enable') || id.includes('repeat')
              ? 'input'
              : 'div';
    const el = document.createElement(tag);
    el.id = id;
    if (tag === 'canvas') {
      el.getContext = () => ({
        clearRect() {},
        fillRect() {},
        strokeRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fill() {},
        fillText() {},
        measureText: () => ({ width: 0 }),
        arc() {},
        closePath() {},
        canvas: el,
      });
      el.width = 800;
      el.height = 400;
    }
    if (tag === 'input') {
      el.type = id.includes('enable') ? 'checkbox' : 'range';
      el.value = '50';
    }
    if (tag === 'select') {
      const opt = document.createElement('option');
      opt.value = '';
      el.appendChild(opt);
    }
    document.body.appendChild(el);
  }
}
