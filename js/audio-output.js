// ============================================================
// Output層: SpectrumAnalyser, MasterAnalyser, 波形描画
// ============================================================

// Output分岐構築: fxTrim → spectrumAnalyser (表示用)
//                fxTrim → masterAnalyser → destination
function buildOutputChain(audioCtx, fxTrim) {
  // スペクトラム表示用Analyser
  const spectrumAnalyser = audioCtx.createAnalyser();
  spectrumAnalyser.fftSize = 4096;
  spectrumAnalyser.smoothingTimeConstant = 0.8;
  window._spectrumAnalyser = spectrumAnalyser;

  // マスター波形用Analyser → 音声出力
  const masterAnalyser = audioCtx.createAnalyser();
  masterAnalyser.fftSize = 2048;
  window._masterAnalyser = masterAnalyser;

  fxTrim.connect(spectrumAnalyser);
  fxTrim.connect(masterAnalyser);
  masterAnalyser.connect(audioCtx.destination);

  return { spectrumAnalyser, masterAnalyser };
}

// 波形描画ループ
function drawWaveforms() {
  if (!isPlaying) {
    // マスタークリア
    const mc = document.getElementById('waveform-master');
    if (mc) {
      const mctx = mc.getContext('2d');
      mctx.clearRect(0, 0, mc.width, mc.height);
    }
    for (const ch of currentChannels) {
      const canvas = document.getElementById(`waveform-${ch}`);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    return;
  }
  requestAnimationFrame(drawWaveforms);

  // マスター合成波描画
  if (window._masterAnalyser) {
    const mc = document.getElementById('waveform-master');
    if (mc) {
      mc.width = mc.offsetWidth;
      const mctx = mc.getContext('2d');
      const ma = window._masterAnalyser;
      const bufLen = ma.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      ma.getByteTimeDomainData(data);
      mctx.fillStyle = getThemeColor('--bg-canvas', '#140f1a');
      mctx.fillRect(0, 0, mc.width, mc.height);
      mctx.lineWidth = 2;
      mctx.strokeStyle = getThemeColor('--accent-purple', '#b39ddb');
      mctx.beginPath();
      const sw = mc.width / bufLen;
      let mx = 0;
      for (let i = 0; i < bufLen; i++) {
        const v = data[i] / 128.0;
        const y = (v * mc.height) / 2;
        if (i === 0) mctx.moveTo(mx, y);
        else mctx.lineTo(mx, y);
        mx += sw;
      }
      mctx.lineTo(mc.width, mc.height / 2);
      mctx.stroke();
    }
  }

  for (const ch of currentChannels) {
    const state = channelStates[ch];
    if (!state.analyser) continue;

    const canvas = document.getElementById(`waveform-${ch}`);
    if (!canvas) continue;

    const ctx = canvas.getContext('2d');
    const analyser = state.analyser;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    ctx.fillStyle = getThemeColor('--bg-canvas', '#140f1a');
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = getChannelColor(ch);
    ctx.beginPath();

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }
}
