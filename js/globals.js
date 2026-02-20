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

// CSS変数からテーマカラーを取得するヘルパー
function getThemeColor(varName, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}
