// ============================================================
// Audio Engine — オーケストレーター
// 各層を呼び出して再生を管理する
//
// Signal Chain:
//   [Source層]  Osc → Envelope ─┐
//   [Channel層] ChGain(waveVol×playGate) → ChDist → ChDelay → ChReverb → ChAnalyser
//   [Master層]  MasterGain → HPF → LPF → EQ
//   [Output層]  → SpectrumAnalyser (visual) / MasterAnalyser → destination
//   [Source層]  Metronome → destination (独立経路)
// ============================================================

import { buildChannelChain } from './audio-channel.js';
import { buildMasterChain } from './audio-master.js';
import { buildOutputChain, drawWaveforms } from './audio-output.js';
import { buildMetronome, createMetroClick } from './audio-source.js';
import { getChannelFx } from './globals.js';
import { midiToFreq, remapNote } from './midi-parser.js';
import { clearSF2BufferCache, findSF2Sample, getSF2AudioBuffer } from './sf2-parser.js';
import { updateChannelGains } from './visualizer.js';
import { applyWaveform, clearPeriodicWaveCache } from './waveforms.js';

let animationTimer = null;
let schedulerTimer = null;
let stopTimerId = null;

// ピッチ/周波数/スケール変更時に再生中のノードを即時更新
export function applyFreqShiftToActive() {
  const pitchShift = window._pitchShift || 0;
  for (const node of window.scheduledNodes) {
    if (node._baseMidi == null) continue;
    try {
      if (node._isSF2) {
        // SF2: playbackRateでピッチシフト+スケール変換を反映
        const remapped = remapNote(node._baseMidi);
        const semitones = remapped - node._rootKey + node._sampleTuning + pitchShift;
        node.playbackRate.value = 2 ** (semitones / 12);
      } else {
        // オシレーター: frequency.valueで反映
        node.frequency.value = midiToFreq(node._baseMidi);
      }
    } catch {}
  }
}

export async function playNotes(notes, bpm, seekOffset = 0) {
  stopPlayback();
  window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (window.audioCtx.state === 'suspended') {
    await window.audioCtx.resume();
  }
  window.isPlaying = true;
  window.scheduledNodes = [];

  const audioCtx = window.audioCtx;

  // === Master層 ===
  const { masterGain, eqOut } = buildMasterChain(audioCtx);

  // === Output層 ===
  buildOutputChain(audioCtx, eqOut);

  // === Channel層 ===
  for (const ch of window.currentChannels) {
    buildChannelChain(audioCtx, ch, masterGain);
  }

  // ミュート/ソロ状態を適用
  updateChannelGains();

  // === Output層: 波形描画開始 ===
  drawWaveforms();

  // === Source層: スケジューラ ===
  const startOffset = audioCtx.currentTime + 0.1;
  const LOOK_AHEAD = 15;
  const CHECK_INTERVAL = 200;
  let chunkIndex = 0;

  // メトロノーム
  const metronomeGain = buildMetronome(audioCtx, audioCtx.destination);
  const beatInterval = 60 / bpm;
  let nextMetroBeat = startOffset;
  let metroBeatCount = 0;

  // メトロノームは短い先読みで独立スケジュール（音色リアルタイム切替対応）
  const METRO_LOOK_AHEAD = 0.3;

  function scheduleMetronome() {
    if (!document.getElementById('metronome-on').checked) return;
    const metroType = document.getElementById('metronome-type').value;
    const metroHorizon = audioCtx.currentTime + METRO_LOOK_AHEAD;
    while (nextMetroBeat < metroHorizon) {
      if (nextMetroBeat >= startOffset) {
        const isAccent = metroBeatCount % 4 === 0;
        createMetroClick(audioCtx, metronomeGain, nextMetroBeat, isAccent, metroType);
      }
      nextMetroBeat += beatInterval;
      metroBeatCount++;
    }
  }

  function scheduler() {
    if (!window.isPlaying || !window.audioCtx) return;
    const horizon = audioCtx.currentTime + LOOK_AHEAD;
    scheduleMetronome();

    while (chunkIndex < notes.length) {
      const t = startOffset + notes[chunkIndex].startTime;
      if (t > horizon) break;

      const n = notes[chunkIndex];
      const dur = Math.max(n.duration, 0.05);
      const vel = n.velocity / 127;

      // SF2モード: サンプルベース再生
      let sourceNode;

      if (window._useSF2 && window._sf2Data && window._sf2PresetMap) {
        const sf2Data = window._sf2Data;
        const sf2PresetMap = window._sf2PresetMap;
        const bank = n.channel === 9 ? 128 : 0; // Ch10=ドラム
        const program = window.channelPrograms[n.channel] || 0;
        const sample = findSF2Sample(sf2Data, sf2PresetMap, bank, program, n.note, n.velocity);

        if (sample) {
          const buf = getSF2AudioBuffer(audioCtx, sf2Data, sample.shdr);
          if (buf) {
            const src = audioCtx.createBufferSource();
            src.buffer = buf;

            // スケール変換 + ピッチシフト適用
            const remapped = remapNote(n.note);
            const pitchShift = window._pitchShift || 0;
            const semitones = remapped - sample.rootKey + sample.tuning + pitchShift;
            src.playbackRate.value = 2 ** (semitones / 12);

            // ループ設定
            if (sample.loopMode === 1 || sample.loopMode === 3) {
              src.loop = true;
              const loopStart = (sample.shdr.loopStart - sample.shdr.start) / sample.shdr.sampleRate;
              const loopEnd = (sample.shdr.loopEnd - sample.shdr.start) / sample.shdr.sampleRate;
              if (loopEnd > loopStart) {
                src.loopStart = loopStart;
                src.loopEnd = loopEnd;
              }
            }

            const env = audioCtx.createGain();
            const attenGain = 10 ** (-sample.attenuation / 20);
            env.gain.setValueAtTime(0, t);
            env.gain.linearRampToValueAtTime(vel * attenGain * 0.3, t + 0.01);
            env.gain.setValueAtTime(vel * attenGain * 0.3, t + dur - Math.min(0.05, dur * 0.3));
            env.gain.linearRampToValueAtTime(0, t + dur);

            src.connect(env);
            const chState = window.channelStates[n.channel];
            if (chState?.gainNode) {
              env.connect(chState.gainNode);
            } else {
              env.connect(masterGain);
            }

            src._channel = n.channel;
            src._baseMidi = n.note;
            src._isSF2 = true;
            src._rootKey = sample.rootKey;
            src._sampleTuning = sample.tuning;
            src.start(t);
            src.stop(t + dur + 0.05);
            sourceNode = src;
          }
        }
      }

      // フォールバック: オシレーター再生（SF2なし or サンプル見つからず）
      if (!sourceNode) {
        const freq = midiToFreq(n.note);
        const osc = audioCtx.createOscillator();
        const env = audioCtx.createGain();

        const chFx = getChannelFx(n.channel);
        const waveType = chFx.waveType;
        applyWaveform(osc, waveType, audioCtx);
        osc.frequency.value = freq;
        osc._baseMidi = n.note;

        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(vel * 0.15, t + 0.01);
        env.gain.setValueAtTime(vel * 0.15, t + dur - Math.min(0.05, dur * 0.3));
        env.gain.linearRampToValueAtTime(0, t + dur);

        osc.connect(env);
        const chState = window.channelStates[n.channel];
        if (chState?.gainNode) {
          env.connect(chState.gainNode);
        } else {
          env.connect(masterGain);
        }

        osc._channel = n.channel;
        osc.start(t);
        osc.stop(t + dur + 0.01);
        sourceNode = osc;
      }

      window.scheduledNodes.push(sourceNode);
      chunkIndex++;
    }

    if (chunkIndex < notes.length && window.isPlaying) {
      schedulerTimer = setTimeout(scheduler, CHECK_INTERVAL);
    }
  }

  scheduler();

  // 再生終了検知
  const totalDuration = notes.length > 0 ? Math.max(...notes.map((n) => n.startTime + n.duration)) : 0;

  if (seekOffset === 0) window.currentTotalDuration = totalDuration;

  const btnPlay = document.getElementById('btn-play');
  const btnStop = document.getElementById('btn-stop');
  btnPlay.innerHTML = '<i data-lucide="pause"></i>';
  btnPlay.title = '一時停止';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
  btnPlay.disabled = false;
  if (typeof window.startSpectrumDraw === 'function') window.startSpectrumDraw();
  if (typeof window.startLimiterMeter === 'function') window.startLimiterMeter();
  btnStop.disabled = false;

  // シークバー表示・設定
  const posDisplay = document.getElementById('position-display');
  const startReal = performance.now();
  window.playbackStartReal = startReal;
  window.playbackStartOffset = seekOffset;

  animationTimer = setInterval(() => {
    const elapsed = (performance.now() - startReal - window.pauseDuration) / 1000 + seekOffset;
    posDisplay.textContent = `${elapsed.toFixed(1)}s / ${window.currentTotalDuration.toFixed(1)}s`;
    if (typeof window.updatePlayhead === 'function') window.updatePlayhead(elapsed);
  }, 100);

  stopTimerId = setTimeout(
    () => {
      if (window.isPlaying) {
        if (window.repeatEnabled && window.currentNotes.length > 0) {
          playNotes(window.currentNotes, window.currentBpm);
        } else {
          stopPlayback();
          if (typeof window.playNextTrack === 'function') window.playNextTrack();
        }
      }
    },
    (totalDuration + 1.0) * 1000,
  );
}

export function pausePlayback() {
  if (!window.isPlaying || !window.audioCtx || window.isPaused) return;
  window.isPaused = true;
  window.pauseStartTime = performance.now();
  window.audioCtx.suspend();
  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
  if (stopTimerId) {
    clearTimeout(stopTimerId);
    stopTimerId = null;
  }
  const btnPlay = document.getElementById('btn-play');
  btnPlay.innerHTML = '<i data-lucide="play"></i>';
  btnPlay.title = '再生';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
  btnPlay.disabled = false;
}

export function resumePlayback() {
  if (!window.isPlaying || !window.audioCtx || !window.isPaused) return;
  window.isPaused = false;
  window.pauseDuration += performance.now() - window.pauseStartTime;
  window.audioCtx.resume();
  const posDisplay = document.getElementById('position-display');
  animationTimer = setInterval(() => {
    const elapsed =
      (performance.now() - window.playbackStartReal - window.pauseDuration) / 1000 + window.playbackStartOffset;
    posDisplay.textContent = `${elapsed.toFixed(1)}s / ${window.currentTotalDuration.toFixed(1)}s`;
    if (typeof window.updatePlayhead === 'function') window.updatePlayhead(elapsed);
  }, 100);
  const currentElapsed =
    (performance.now() - window.playbackStartReal - window.pauseDuration) / 1000 + window.playbackStartOffset;
  const remaining = window.currentTotalDuration - currentElapsed;
  if (remaining > 0) {
    stopTimerId = setTimeout(
      () => {
        if (window.isPlaying) stopPlayback();
      },
      (remaining + 1.0) * 1000,
    );
  }
  const btnPlay = document.getElementById('btn-play');
  btnPlay.innerHTML = '<i data-lucide="pause"></i>';
  btnPlay.title = '一時停止';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
}

export function stopPlayback() {
  if (typeof window.stopSpectrumDraw === 'function') window.stopSpectrumDraw();
  if (typeof window.stopLimiterMeter === 'function') window.stopLimiterMeter();
  window.isPaused = false;
  window.pauseDuration = 0;
  window.pauseStartTime = 0;
  window.isPlaying = false;
  if (typeof window.clearLoopTimer === 'function') window.clearLoopTimer();
  if (stopTimerId) {
    clearTimeout(stopTimerId);
    stopTimerId = null;
  }
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
  // オーディオファイルソースの停止
  if (window.audioFileSource) {
    try {
      window.audioFileSource.stop();
    } catch {}
    window.audioFileSource = null;
  }

  for (const osc of window.scheduledNodes) {
    try {
      osc.stop();
    } catch {}
  }
  window.scheduledNodes = [];
  // チャンネルオーディオノードのクリーンアップ
  for (const ch of Object.keys(window.channelStates)) {
    window.channelStates[ch].gainNode = null;
    window.channelStates[ch].analyser = null;
  }
  if (window.audioCtx) {
    window.audioCtx.close().catch(() => {});
    clearPeriodicWaveCache();
    clearSF2BufferCache();
    window.audioCtx = null;
  }
  const btnPlay = document.getElementById('btn-play');
  const btnStop = document.getElementById('btn-stop');
  btnPlay.innerHTML = '<i data-lucide="play"></i>';
  btnPlay.title = '再生';
  lucide.createIcons({ nameAttr: 'data-lucide', node: btnPlay });
  btnPlay.disabled = false;
  btnStop.disabled = true;
  document.getElementById('position-display').textContent = '-';
}

export function playNotesFrom(notes, bpm, fromTime) {
  const offsetNotes = notes
    .filter((n) => n.startTime + n.duration > fromTime)
    .map((n) => ({
      ...n,
      startTime: Math.max(0, n.startTime - fromTime),
      duration: n.startTime < fromTime ? n.duration - (fromTime - n.startTime) : n.duration,
    }));
  playNotes(offsetNotes, bpm, fromTime);
}

// Export scheduledNodes for app.js wave switching
