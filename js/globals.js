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

/**
 * チャンネルの音色設定を解決する
 * 優先順位: チャンネル個別設定 > MIDI Program Change > グローバル設定
 * @param {number} ch - チャンネル番号 (0-15)
 * @returns {{ type: 'sf2', bank: number, preset: number } | { type: 'waveform', waveType: string } | { type: 'custom', waveType: string }}
 */
export function resolveVoice(ch) {
  const chFx = getChannelFx(ch);

  // 1. チャンネル個別設定
  if (chFx.voiceSource && chFx.voiceSource.type !== 'global') {
    // SF2プリセット指定だがSF2が無効な場合 → フォールバック
    if (chFx.voiceSource.type === 'sf2' && !(state._useSF && state._sf && state._sf2PresetMap)) {
      // グローバル波形設定にフォールバック
      return { type: 'waveform', waveType: chFx.waveType };
    }
    return chFx.voiceSource;
  }

  // 2. グローバル設定（SF2有効ならSF2、なければ波形）
  if (state._useSF && state._sf && state._sf2PresetMap) {
    const bank = ch === 9 ? 128 : 0;
    const program = state.channelPrograms[ch] || 0;
    return { type: 'sf2', bank, preset: program };
  }

  // 3. 波形フォールバック
  return { type: 'waveform', waveType: chFx.waveType };
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
