// カスタム波形定義: PeriodicWave用の倍音構成
// real = cosine成分, imag = sine成分（0番目はDCオフセットで常に0）

const CUSTOM_WAVEFORMS = {
  // --- オルガン系 ---
  organ: {
    label: 'Organ',
    // ドローバーオルガン風: 基音+2倍+3倍+4倍+6倍+8倍
    real: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    imag: [0, 1, 0.8, 0.6, 0.4, 0, 0.3, 0, 0.2],
  },
  // --- ピアノ風 ---
  piano: {
    label: 'Piano',
    // 減衰する倍音列: リアルなピアノに近い倍音構成
    real: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    imag: [0, 1, 0.5, 0.33, 0.2, 0.13, 0.08, 0.05, 0.03, 0.02, 0.01],
  },
  // --- フルート風 ---
  flute: {
    label: 'Flute',
    // ほぼ正弦波+わずかな奇数倍音
    real: [0, 0, 0, 0, 0, 0],
    imag: [0, 1, 0, 0.1, 0, 0.02],
  },
  // --- クラリネット風 ---
  clarinet: {
    label: 'Clarinet',
    // 奇数倍音が強い（閉管楽器の特徴）
    real: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    imag: [0, 1, 0, 0.75, 0, 0.5, 0, 0.14, 0, 0.05],
  },
  // --- ブラス風 ---
  brass: {
    label: 'Brass',
    // 多くの倍音が均一に出る
    real: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    imag: [0, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.15, 0.1, 0.05],
  },
  // --- ストリングス風 ---
  strings: {
    label: 'Strings',
    // 鋸波に近いが高次倍音が抑えめ
    real: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    imag: [0, 1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.14, 0.12],
  },
  // --- ベル風 ---
  bell: {
    label: 'Bell',
    // 非整数倍音を含む金属的な響き（近似）
    real: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    imag: [0, 1, 0.6, 0, 0.4, 0.3, 0, 0.2, 0.15],
  },
  // --- パッド風 ---
  pad: {
    label: 'Pad',
    // 柔らかい偶数・奇数倍音ミックス
    real: [0, 0, 0, 0, 0, 0, 0],
    imag: [0, 1, 0.7, 0.4, 0.3, 0.15, 0.08],
  },
  // --- チップチューン風 ---
  chiptune: {
    label: 'Chiptune',
    // 矩形波の25%デューティサイクル風
    real: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    imag: [0, 1, 0.7, 0, -0.5, 0, 0.3, 0, -0.2],
  },
  // --- リード風 ---
  reed: {
    label: 'Reed',
    // オーボエ・リード系: 偶数・奇数倍音ともに豊か
    real: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    imag: [0, 1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.22, 0.15, 0.1, 0.06],
  },
};

// PeriodicWaveオブジェクトを生成してキャッシュ
const periodicWaveCache = {};

function getPeriodicWave(audioCtx, name) {
  if (!periodicWaveCache[name]) {
    const def = CUSTOM_WAVEFORMS[name];
    if (!def) return null;
    periodicWaveCache[name] = audioCtx.createPeriodicWave(new Float32Array(def.real), new Float32Array(def.imag), {
      disableNormalization: false,
    });
  }
  return periodicWaveCache[name];
}

// AudioContext変更時にキャッシュをクリア
function clearPeriodicWaveCache() {
  for (const key of Object.keys(periodicWaveCache)) {
    delete periodicWaveCache[key];
  }
}

// 標準波形かカスタム波形かを判定
function isCustomWaveform(name) {
  return name in CUSTOM_WAVEFORMS;
}

// オシレーターに波形を適用
function applyWaveform(osc, waveName, audioCtx) {
  if (isCustomWaveform(waveName)) {
    const pw = getPeriodicWave(audioCtx, waveName);
    if (pw) osc.setPeriodicWave(pw);
  } else {
    osc.type = waveName;
  }
}
