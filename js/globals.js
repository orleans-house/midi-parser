// ============================================================
// グローバル変数・定数
// ============================================================

window.currentNotes = [];
window.currentBpm = 120;
window.currentTotalDuration = 0;
window.playbackStartReal = 0;
window.playbackStartOffset = 0;
window.channelStates = {};
window.channelPrograms = {};
window.currentChannels = [];
window.repeatEnabled = false;
// チャンネル別エフェクト状態
window.channelFxState = {};
// オーディオエンジン共有状態
window.audioCtx = null;
window.isPlaying = false;
window.isPaused = false;
window.pauseDuration = 0;
window.pauseStartTime = 0;
// オーディオファイルエンジン共有状態
window.audioFileSource = null;
window.audioFileBuffer = null;
window.audioFileMode = false;
// スケジュール済みノード（波形切替用）
window.scheduledNodes = [];

export function getChannelFx(ch) {
  if (!window.channelFxState[ch]) {
    window.channelFxState[ch] = {
      waveType: 'triangle',
      distortion: { enabled: false, amount: 50 },
      delay: { enabled: false, time: 300 },
      reverb: { enabled: false, mix: 40 },
    };
  }
  return window.channelFxState[ch];
}

// 対数スケール変換 (スライダー0-100 ↔ 周波数20-20000Hz)
export const FREQ_MIN = 20;
export const FREQ_MAX = 20000;

export function sliderToFreq(val) {
  return FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** (val / 100);
}

export function freqToSlider(freq) {
  return (100 * Math.log(freq / FREQ_MIN)) / Math.log(FREQ_MAX / FREQ_MIN);
}

// CSS変数からテーマカラーを取得するヘルパー
export function getThemeColor(varName, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}
