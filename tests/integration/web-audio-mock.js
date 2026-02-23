import { vi } from 'vitest';

/**
 * Web Audio API 軽量モック
 * 統合テスト用: ノード生成・接続の検証に使用
 */

function createAudioParam(defaultValue = 0) {
  return {
    value: defaultValue,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function createBaseNode() {
  return {
    connect: vi.fn((dest) => dest),
    disconnect: vi.fn(),
  };
}

export function createMockAudioContext(options = {}) {
  const sampleRate = options.sampleRate || 44100;

  const ctx = {
    sampleRate,
    currentTime: 0,
    state: 'running',
    destination: { ...createBaseNode(), maxChannelCount: 2 },

    createGain: vi.fn(() => ({
      ...createBaseNode(),
      gain: createAudioParam(1),
    })),

    createOscillator: vi.fn(() => ({
      ...createBaseNode(),
      frequency: createAudioParam(440),
      detune: createAudioParam(0),
      type: 'sine',
      setPeriodicWave: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),

    createBiquadFilter: vi.fn(() => ({
      ...createBaseNode(),
      type: 'lowpass',
      frequency: createAudioParam(350),
      Q: createAudioParam(1),
      gain: createAudioParam(0),
      detune: createAudioParam(0),
    })),

    createDynamicsCompressor: vi.fn(() => ({
      ...createBaseNode(),
      threshold: createAudioParam(-24),
      knee: createAudioParam(30),
      ratio: createAudioParam(12),
      attack: createAudioParam(0.003),
      release: createAudioParam(0.25),
      reduction: 0,
    })),

    createAnalyser: vi.fn(() => ({
      ...createBaseNode(),
      fftSize: 2048,
      frequencyBinCount: 1024,
      smoothingTimeConstant: 0.8,
      getByteFrequencyData: vi.fn(),
      getByteTimeDomainData: vi.fn(),
      getFloatFrequencyData: vi.fn(),
      getFloatTimeDomainData: vi.fn(),
    })),

    createBuffer: vi.fn((channels, length, rate) => {
      const channelData = [];
      for (let i = 0; i < channels; i++) {
        channelData.push(new Float32Array(length));
      }
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: vi.fn((ch) => channelData[ch]),
      };
    }),

    createBufferSource: vi.fn(() => ({
      ...createBaseNode(),
      buffer: null,
      playbackRate: createAudioParam(1),
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    })),

    createConvolver: vi.fn(() => ({
      ...createBaseNode(),
      buffer: null,
      normalize: true,
    })),

    createWaveShaper: vi.fn(() => ({
      ...createBaseNode(),
      curve: null,
      oversample: 'none',
    })),

    createDelay: vi.fn(() => ({
      ...createBaseNode(),
      delayTime: createAudioParam(0),
    })),

    createPeriodicWave: vi.fn((real, imag, opts) => ({
      _real: real,
      _imag: imag,
    })),

    suspend: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };

  return ctx;
}
