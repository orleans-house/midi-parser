// ============================================================
// グローバル変数・定数
// ============================================================

import state from './state/audioState.js';

// window.* ブリッジ（後方互換: main.js や typeof ガード用）
// state module の値を window に同期
for (const key of Object.keys(state)) {
  window[key] = state[key];
}

export function getChannelFx(ch) {
  if (!state.channelFxState[ch]) {
    state.channelFxState[ch] = {
      waveType: 'triangle',
      distortion: { enabled: false, amount: 50 },
      delay: { enabled: false, time: 300 },
      reverb: { enabled: false, mix: 40 },
    };
  }
  return state.channelFxState[ch];
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
