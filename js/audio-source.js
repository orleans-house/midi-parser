// ============================================================
// Source層: メトロノーム生成
// ============================================================

export function buildMetronome(audioCtx, destination) {
  const metronomeGain = audioCtx.createGain();
  const metroVolSlider = document.getElementById('metronome-vol');
  metronomeGain.gain.value = document.getElementById('metronome-on').checked
    ? metroVolSlider
      ? Number(metroVolSlider.value) / 100
      : 0.5
    : 0;
  metronomeGain.connect(destination);
  window._metronomeGain = metronomeGain;
  return metronomeGain;
}

export function createMetroClick(audioCtx, metronomeGain, time, isAccent, type) {
  if (type === 'hihat') {
    const bufSize = audioCtx.sampleRate * 0.03;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = isAccent ? 10000 : 8000;
    filter.Q.value = 1;
    const env = audioCtx.createGain();
    env.gain.setValueAtTime(isAccent ? 0.8 : 0.5, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    noise.connect(filter);
    filter.connect(env);
    env.connect(metronomeGain);
    noise.start(time);
    noise.stop(time + 0.05);
  } else {
    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();
    const vol = isAccent ? 0.8 : 0.5;

    if (type === 'wood') {
      osc.type = 'sine';
      osc.frequency.value = isAccent ? 1800 : 1500;
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(vol, time + 0.0005);
      env.gain.exponentialRampToValueAtTime(0.001, time + 0.008);
    } else if (type === 'rim') {
      osc.type = 'triangle';
      osc.frequency.value = isAccent ? 1600 : 1200;
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(vol, time + 0.001);
      env.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    } else if (type === 'beep') {
      osc.type = 'square';
      osc.frequency.value = isAccent ? 1000 : 700;
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(vol * 0.4, time + 0.001);
      env.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
    } else {
      // click (default)
      osc.type = 'sine';
      osc.frequency.value = isAccent ? 1200 : 800;
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(vol, time + 0.001);
      env.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    }

    osc.connect(env);
    env.connect(metronomeGain);
    osc.start(time);
    osc.stop(time + 0.06);
  }
}
