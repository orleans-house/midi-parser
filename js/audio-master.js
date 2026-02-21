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

  // HPF / LPF (常時接続、XYパッドで操作)
  const hpf = audioCtx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = window._hpfFreq || 20;
  hpf.Q.value = 0.7;
  window._hpf = hpf;

  const lpf = audioCtx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = window._lpfFreq || 20000;
  lpf.Q.value = 0.7;
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

  // MasterGain → HPF → LPF → EQ chain
  masterGain.connect(hpf);
  hpf.connect(lpf);
  let prevNode = lpf;
  for (const filter of eqFilters) {
    prevNode.connect(filter);
    prevNode = filter;
  }

  // EQ → FX Trim
  const fxTrim = audioCtx.createGain();
  const fxTrimSlider = document.getElementById('fx-trim');
  fxTrim.gain.value = fxTrimSlider ? Number(fxTrimSlider.value) / 100 : 1;
  window._fxTrim = fxTrim;

  prevNode.connect(fxTrim);

  return { masterGain, fxTrim };
}
