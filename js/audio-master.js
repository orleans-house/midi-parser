// ============================================================
// Master層: MasterGain, GlobalFilter, EQ, Global FX, FX Trim
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

// マスターチェーン構築: masterGain → GlobalFilter → EQ → Global FX → FX Trim
function buildMasterChain(audioCtx) {
  const masterGain = audioCtx.createGain();
  const masterSlider = document.getElementById('master-volume');
  const mVol = masterSlider ? masterSlider.value / 100 : 1.0;
  masterGain.gain.value = mVol;
  window._masterGain = masterGain;
  window._audioCtxSampleRate = audioCtx.sampleRate;

  // グローバルフィルター
  const globalFilter = audioCtx.createBiquadFilter();
  globalFilter.type = document.getElementById('filter-type').value;
  globalFilter.frequency.value = sliderToFreq(Number(document.getElementById('filter-freq').value));
  globalFilter.Q.value = Number(document.getElementById('filter-q').value);
  window._globalFilter = globalFilter;
  window._globalFilterEnabled = document.getElementById('filter-enabled').checked;

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

  // GlobalFilter → EQ chain 接続
  if (!window._globalFilterEnabled) {
    globalFilter.type = 'lowpass';
    globalFilter.frequency.value = 20000;
    globalFilter.Q.value = 0.1;
  }
  masterGain.connect(globalFilter);
  let prevNode = globalFilter;
  for (const filter of eqFilters) {
    prevNode.connect(filter);
    prevNode = filter;
  }

  // Distortion
  const distortion = audioCtx.createWaveShaper();
  distortion.oversample = '4x';
  window._fxDistortion = distortion;
  window._fxDistortionEnabled = document.getElementById('fx-distortion-on').checked;
  if (window._fxDistortionEnabled) {
    updateDistortionCurve(distortion, Number(document.getElementById('fx-distortion').value));
  }

  // Delay
  const delay = audioCtx.createDelay(1.0);
  delay.delayTime.value = Number(document.getElementById('fx-delay-time').value) / 1000;
  const delayFeedback = audioCtx.createGain();
  delayFeedback.gain.value = 0.3;
  const delayWet = audioCtx.createGain();
  delayWet.gain.value = 0;
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(delayWet);
  window._fxDelay = delay;
  window._fxDelayFeedback = delayFeedback;
  window._fxDelayWet = delayWet;
  window._fxDelayEnabled = document.getElementById('fx-delay-on').checked;
  if (window._fxDelayEnabled) delayWet.gain.value = 0.5;

  // Reverb
  const reverbWet = audioCtx.createGain();
  reverbWet.gain.value = 0;
  const convolver = audioCtx.createConvolver();
  convolver.buffer = createReverbIR(audioCtx, 2, 2);
  convolver.connect(reverbWet);
  window._fxConvolver = convolver;
  window._fxReverbWet = reverbWet;
  window._fxReverbEnabled = document.getElementById('fx-reverb-on').checked;
  if (window._fxReverbEnabled) {
    reverbWet.gain.value = Number(document.getElementById('fx-reverb').value) / 100;
  }

  // EQ → Distortion → Delay, EQ → Convolver
  prevNode.connect(distortion);
  distortion.connect(delay);
  prevNode.connect(convolver);

  // FX Master Trim
  const fxTrim = audioCtx.createGain();
  const fxTrimSlider = document.getElementById('fx-trim');
  fxTrim.gain.value = fxTrimSlider ? Number(fxTrimSlider.value) / 100 : 1;
  window._fxTrim = fxTrim;

  distortion.connect(fxTrim);
  delayWet.connect(fxTrim);
  reverbWet.connect(fxTrim);

  return { masterGain, fxTrim };
}
