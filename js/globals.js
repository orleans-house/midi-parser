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
// チャンネル別エフェクト状態
const channelFxState = {};

function getChannelFx(ch) {
  if (!channelFxState[ch]) {
    channelFxState[ch] = {
      customWave: false,
      waveType: 'triangle',
      distortion: { enabled: false, amount: 50 },
      delay: { enabled: false, time: 300 },
      reverb: { enabled: false, mix: 40 },
    };
  }
  return channelFxState[ch];
}

// CSS変数からテーマカラーを取得するヘルパー
function getThemeColor(varName, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}
