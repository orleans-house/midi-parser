// ============================================================
// グローバル変数・定数
// ============================================================

let currentNotes = [];
let currentBpm = 120;
let currentTotalDuration = 0;
let playbackStartReal = 0;
let playbackStartOffset = 0;
let channelStates = {};
let channelPrograms = {};
let currentChannels = [];
let repeatEnabled = false;
// チャンネル別エフェクト状態
const channelFxState = {};

function getChannelFx(ch) {
  if (!channelFxState[ch]) {
    channelFxState[ch] = {
      waveType: 'triangle',
      distortion: { enabled: false, amount: 50 },
      delay: { enabled: false, time: 300 },
      reverb: { enabled: false, mix: 40 },
    };
  }
  return channelFxState[ch];
}

// 対数スケール変換 (スライダー0-100 ↔ 周波数20-20000Hz)
const FREQ_MIN = 20;
const FREQ_MAX = 20000;

function sliderToFreq(val) {
  return FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** (val / 100);
}

function freqToSlider(freq) {
  return (100 * Math.log(freq / FREQ_MIN)) / Math.log(FREQ_MAX / FREQ_MIN);
}

// CSS変数からテーマカラーを取得するヘルパー
function getThemeColor(varName, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}
