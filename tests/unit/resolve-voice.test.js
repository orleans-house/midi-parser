import { beforeEach, describe, expect, it } from 'vitest';
import { getChannelFx, resolveVoice } from '../../src/js/globals.js';
import state from '../../src/js/state/audioState.js';

describe('resolveVoice', () => {
  beforeEach(() => {
    // stateをリセット
    state._useSF = false;
    state._sf = null;
    state._sf2PresetMap = null;
    state.channelPrograms = {};
    state.channelFxState = {};
  });

  describe('グローバル設定（デフォルト）', () => {
    it('SF2無効時は波形を返す', () => {
      const voice = resolveVoice(0);
      expect(voice.type).toBe('waveform');
      expect(voice.waveType).toBe('triangle'); // デフォルト波形
    });

    it('SF2有効時はSF2を返す（Bank 0）', () => {
      state._useSF = true;
      state._sf = { info: {} };
      state._sf2PresetMap = { '0-0': { name: 'Piano', bank: 0, preset: 0 } };
      state.channelPrograms = { 0: 25 };

      const voice = resolveVoice(0);
      expect(voice.type).toBe('sf2');
      expect(voice.bank).toBe(0);
      expect(voice.preset).toBe(25);
    });

    it('Ch10（ドラム）はBank 128を返す', () => {
      state._useSF = true;
      state._sf = { info: {} };
      state._sf2PresetMap = { '128-0': { name: 'Drums', bank: 128, preset: 0 } };

      const voice = resolveVoice(9); // Ch10 = index 9
      expect(voice.type).toBe('sf2');
      expect(voice.bank).toBe(128);
      expect(voice.preset).toBe(0);
    });
  });

  describe('チャンネル個別設定', () => {
    it('波形を個別設定すると優先される', () => {
      const chFx = getChannelFx(0);
      chFx.voiceSource = { type: 'waveform', waveType: 'sine' };

      const voice = resolveVoice(0);
      expect(voice.type).toBe('waveform');
      expect(voice.waveType).toBe('sine');
    });

    it('カスタム波形を個別設定すると優先される', () => {
      const chFx = getChannelFx(3);
      chFx.voiceSource = { type: 'custom', waveType: 'organ' };

      const voice = resolveVoice(3);
      expect(voice.type).toBe('custom');
      expect(voice.waveType).toBe('organ');
    });

    it('SF2プリセットを個別設定すると優先される', () => {
      state._useSF = true;
      state._sf = { info: {} };
      state._sf2PresetMap = { '0-5': { name: 'Guitar', bank: 0, preset: 5 } };

      const chFx = getChannelFx(2);
      chFx.voiceSource = { type: 'sf2', bank: 0, preset: 5 };

      const voice = resolveVoice(2);
      expect(voice.type).toBe('sf2');
      expect(voice.bank).toBe(0);
      expect(voice.preset).toBe(5);
    });

    it('globalタイプはグローバル設定にフォールバック', () => {
      const chFx = getChannelFx(0);
      chFx.voiceSource = { type: 'global' };

      const voice = resolveVoice(0);
      expect(voice.type).toBe('waveform');
      expect(voice.waveType).toBe('triangle');
    });
  });

  describe('SF2フォールバック', () => {
    it('SF2プリセット設定だがSF2無効 → 波形にフォールバック', () => {
      state._useSF = false;
      const chFx = getChannelFx(0);
      chFx.voiceSource = { type: 'sf2', bank: 0, preset: 0 };

      const voice = resolveVoice(0);
      expect(voice.type).toBe('waveform');
      expect(voice.waveType).toBe('triangle');
    });

    it('SF2プリセット設定でSF2有効 → SF2を返す', () => {
      state._useSF = true;
      state._sf = { info: {} };
      state._sf2PresetMap = { '0-0': { name: 'Piano', bank: 0, preset: 0 } };

      const chFx = getChannelFx(0);
      chFx.voiceSource = { type: 'sf2', bank: 0, preset: 0 };

      const voice = resolveVoice(0);
      expect(voice.type).toBe('sf2');
    });
  });

  describe('優先順位', () => {
    it('チャンネル個別設定 > MIDI Program Change > グローバル', () => {
      state._useSF = true;
      state._sf = { info: {} };
      state._sf2PresetMap = { '0-0': {}, '0-10': {} };
      state.channelPrograms = { 0: 10 }; // MIDI says program 10

      // 個別設定なし → Program Change(10)を使う
      let voice = resolveVoice(0);
      expect(voice.type).toBe('sf2');
      expect(voice.preset).toBe(10);

      // 個別設定あり → 個別設定を使う
      const chFx = getChannelFx(0);
      chFx.voiceSource = { type: 'waveform', waveType: 'square' };
      voice = resolveVoice(0);
      expect(voice.type).toBe('waveform');
      expect(voice.waveType).toBe('square');
    });
  });
});
