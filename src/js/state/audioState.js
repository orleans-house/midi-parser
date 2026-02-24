// ============================================================
// 共有オーディオ状態
// 全モジュールからimportして使用する一元管理モジュール
// ============================================================

const audioState = {
  // --- 再生状態 ---
  audioCtx: null,
  isPlaying: false,
  isPaused: false,
  pauseDuration: 0,
  pauseStartTime: 0,

  // --- MIDI データ ---
  currentNotes: [],
  currentBpm: 120,
  currentTotalDuration: 0,
  playbackStartReal: 0,
  playbackStartOffset: 0,
  channelStates: {},
  channelPrograms: {},
  currentChannels: [],
  repeatEnabled: false,

  // --- チャンネルFX ---
  channelFxState: {},
  scheduledNodes: [],

  // --- オーディオファイル ---
  audioFileSource: null,
  audioFileBuffer: null,
  audioFileMode: false,

  // --- オーディオノード参照 ---
  _masterGain: null,
  _hpf: null,
  _lpf: null,
  _bandpass: null,
  _notch: null,
  _peaking: null,
  _eqFilters: null,
  _limiter: null,
  _limiterBypassed: false,
  _spectrumAnalyser: null,
  _masterAnalyser: null,
  _metronomeGain: null,
  _masterReverbConvolver: null,
  _masterReverbWet: null,
  _masterChorusLfo: null,
  _masterChorusLfoGain: null,
  _masterChorusWet: null,
  _switchFilterChain: null,

  // --- フィルターパラメータ ---
  _filterMode: 'direct',
  _hpfFreq: 20,
  _lpfFreq: 20000,
  _bpFreq: 1000,
  _bpQ: 1,
  _notchFreq: 1000,
  _notchQ: 1,
  _peakFreq: 1000,
  _peakGain: 0,
  _peakQ: 1,

  // --- ピッチ/周波数/スケール ---
  _pitchShift: 0,
  _freqShift: 0,
  _scaleConvert: { enabled: false, key: 0, from: 'major', to: 'minor' },

  // --- SF2 ---
  _sf: null,
  _useSF: false,
  _sf2PresetMap: null,

  // --- オーディオファイル再生 ---
  _audioFileRawBuffer: null,
  _audioCtxSampleRate: 44100,
  _audioFileAnimTimer: null,
};

export default audioState;
