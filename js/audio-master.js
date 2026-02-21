// ============================================================
// Master層: MasterGain, HPF/LPF, EQ
// ============================================================

// ディストーションカーブ生成
function makeDistortionCurve(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const k = amount;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function updateDistortionCurve(node, value) {
  node.curve = value > 0 ? makeDistortionCurve(value) : null;
}

// リバーブIR生成
function createReverbIR(ctx, duration, decay) {
  const length = ctx.sampleRate * duration;
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return ir;
}

// マスターチェーン構築: masterGain → HPF → LPF → EQ
function buildMasterChain(audioCtx) {
  const masterGain = audioCtx.createGain();
  const masterSlider = document.getElementById('master-volume');
  const mVol = masterSlider ? masterSlider.value / 100 : 1.0;
  masterGain.gain.value = mVol;
  window._masterGain = masterGain;
  window._audioCtxSampleRate = audioCtx.sampleRate;

  // HPF / LPF (常時接続、XYパッドで操作)
  const hpf = audioCtx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = window._hpfFreq || 20;
  const hpfQSlider = document.getElementById('hpf-q');
  hpf.Q.value = hpfQSlider ? Number(hpfQSlider.value) : 10;
  window._hpf = hpf;

  const lpf = audioCtx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = window._lpfFreq || 20000;
  const lpfQSlider = document.getElementById('lpf-q');
  lpf.Q.value = lpfQSlider ? Number(lpfQSlider.value) : 10;
  window._lpf = lpf;

  // EQ フィルターチェーン
  const eqBands = document.querySelectorAll('.eq-band');
  const eqFilters = [];
  eqBands.forEach((band, i) => {
    const freq = Number(band.dataset.freq);
    const filter = audioCtx.createBiquadFilter();
    filter.type = i === 0 ? 'lowshelf' : i === eqBands.length - 1 ? 'highshelf' : 'peaking';
    filter.frequency.value = freq;
    filter.gain.value = Number(band.querySelector('.eq-slider').value);
    if (filter.type === 'peaking') filter.Q.value = 1.4;
    eqFilters.push(filter);
  });
  window._eqFilters = eqFilters;

  // 追加フィルター（モード切替で動的に挿入/取り外し）
  const bandpass = audioCtx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = window._bpFreq || 1000;
  bandpass.Q.value = window._bpQ || 1;
  window._bandpass = bandpass;

  const notch = audioCtx.createBiquadFilter();
  notch.type = 'notch';
  notch.frequency.value = window._notchFreq || 1000;
  notch.Q.value = window._notchQ || 1;
  window._notch = notch;

  const peaking = audioCtx.createBiquadFilter();
  peaking.type = 'peaking';
  peaking.frequency.value = window._peakFreq || 1000;
  peaking.Q.value = window._peakQ || 1;
  peaking.gain.value = window._peakGain || 0;
  window._peaking = peaking;

  // EQチェーンの先頭ノードを取得
  const eqHead = eqFilters.length > 0 ? eqFilters[0] : null;

  // フィルターモード切替: LPF → [activeFilter | direct] → EQ先頭
  // デフォルトは HPF/LPF モード（追加フィルターなし）
  window._switchFilterChain = (mode) => {
    // 既存接続を切断
    lpf.disconnect();
    bandpass.disconnect();
    notch.disconnect();
    peaking.disconnect();

    const target = eqHead || masterGain; // EQがない場合のフォールバック
    if (mode === 'bandpass') {
      lpf.connect(bandpass);
      bandpass.connect(target);
    } else if (mode === 'notch') {
      lpf.connect(notch);
      notch.connect(target);
    } else if (mode === 'peaking') {
      lpf.connect(peaking);
      peaking.connect(target);
    } else {
      // hpf-lpf: 直結
      lpf.connect(target);
    }
  };

  // EQフィルター同士を直列接続
  for (let i = 0; i < eqFilters.length - 1; i++) {
    eqFilters[i].connect(eqFilters[i + 1]);
  }

  // MasterGain → HPF → LPF → EQ chain（デフォルト: 追加フィルターなし）
  masterGain.connect(hpf);
  hpf.connect(lpf);
  lpf.connect(eqHead || masterGain);
  let prevNode = eqFilters.length > 0 ? eqFilters[eqFilters.length - 1] : lpf;

  // === マスターリバーブ ===
  const reverbDry = audioCtx.createGain();
  const reverbWet = audioCtx.createGain();
  const reverbConvolver = audioCtx.createConvolver();
  const reverbOn = document.getElementById('master-reverb-on');
  const reverbMixSlider = document.getElementById('master-reverb-mix');
  const reverbDecaySlider = document.getElementById('master-reverb-decay');

  const reverbDecay = reverbDecaySlider ? Number(reverbDecaySlider.value) / 10 : 2.0;
  reverbConvolver.buffer = createReverbIR(audioCtx, reverbDecay, 2);

  const reverbEnabled = reverbOn && reverbOn.checked;
  reverbDry.gain.value = 1;
  reverbWet.gain.value = reverbEnabled ? (reverbMixSlider ? Number(reverbMixSlider.value) / 100 : 0.3) : 0;

  const reverbMerge = audioCtx.createGain();
  prevNode.connect(reverbDry);
  prevNode.connect(reverbConvolver);
  reverbConvolver.connect(reverbWet);
  reverbDry.connect(reverbMerge);
  reverbWet.connect(reverbMerge);

  window._masterReverbWet = reverbWet;
  window._masterReverbConvolver = reverbConvolver;
  prevNode = reverbMerge;

  // === マスターコーラス ===
  const chorusDry = audioCtx.createGain();
  const chorusWet = audioCtx.createGain();
  const chorusDelay = audioCtx.createDelay(0.05);
  const chorusLfo = audioCtx.createOscillator();
  const chorusLfoGain = audioCtx.createGain();
  const chorusOn = document.getElementById('master-chorus-on');
  const chorusRateSlider = document.getElementById('master-chorus-rate');
  const chorusDepthSlider = document.getElementById('master-chorus-depth');
  const chorusMixSlider = document.getElementById('master-chorus-mix');

  const chorusEnabled = chorusOn && chorusOn.checked;
  chorusDelay.delayTime.value = 0.015;
  chorusLfo.type = 'sine';
  chorusLfo.frequency.value = chorusRateSlider ? Number(chorusRateSlider.value) / 10 : 1.5;
  chorusLfoGain.gain.value = chorusDepthSlider ? Number(chorusDepthSlider.value) / 1000 : 0.005;
  chorusLfo.connect(chorusLfoGain);
  chorusLfoGain.connect(chorusDelay.delayTime);
  chorusLfo.start();

  chorusDry.gain.value = 1;
  chorusWet.gain.value = chorusEnabled ? (chorusMixSlider ? Number(chorusMixSlider.value) / 100 : 0.5) : 0;

  const chorusMerge = audioCtx.createGain();
  prevNode.connect(chorusDry);
  prevNode.connect(chorusDelay);
  chorusDelay.connect(chorusWet);
  chorusDry.connect(chorusMerge);
  chorusWet.connect(chorusMerge);

  window._masterChorusWet = chorusWet;
  window._masterChorusLfo = chorusLfo;
  window._masterChorusLfoGain = chorusLfoGain;
  prevNode = chorusMerge;

  // リミッター (DynamicsCompressorNode) — 常時チェーンに挿入
  const limiter = audioCtx.createDynamicsCompressor();
  limiter.attack.value = 0.003;
  limiter.release.value = 0.05;
  applyLimiterParams(limiter);
  prevNode.connect(limiter);
  window._limiter = limiter;

  return { masterGain, eqOut: limiter };
}

// リミッターのパラメータをUI状態に応じて適用
function applyLimiterParams(limiter) {
  if (!limiter) return;
  const limiterOn = document.getElementById('limiter-on');
  const isOn = limiterOn && limiterOn.checked;

  if (isOn) {
    const thresholdSlider = document.getElementById('limiter-threshold');
    const kneeSlider = document.getElementById('limiter-knee');
    limiter.threshold.value = thresholdSlider ? Number(thresholdSlider.value) : -6;
    limiter.knee.value = kneeSlider ? Number(kneeSlider.value) : 3;
    limiter.ratio.value = 20; // ほぼブリックウォール
  } else {
    // 実質バイパス: threshold=0dB, ratio=1 で圧縮なし
    limiter.threshold.value = 0;
    limiter.knee.value = 0;
    limiter.ratio.value = 1;
  }
  window._limiterBypassed = !isOn;
}
