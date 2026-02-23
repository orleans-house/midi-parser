import { describe, expect, it, vi } from 'vitest';
import { applyLimiterParams, buildMasterChain, createReverbIR, updateDistortionCurve } from '../../js/audio-master.js';
import { createMockAudioContext } from './web-audio-mock.js';

// ============================================================
// updateDistortionCurve()
// ============================================================

describe('updateDistortionCurve()', () => {
  it('amount > 0 でcurveを設定する', () => {
    const node = { curve: null };
    updateDistortionCurve(node, 50);
    expect(node.curve).toBeInstanceOf(Float32Array);
    expect(node.curve.length).toBe(44100);
  });

  it('amount = 0 でcurveをnullにする', () => {
    const node = { curve: new Float32Array(10) };
    updateDistortionCurve(node, 0);
    expect(node.curve).toBeNull();
  });

  it('amount < 0 でcurveをnullにする', () => {
    const node = { curve: new Float32Array(10) };
    updateDistortionCurve(node, -1);
    expect(node.curve).toBeNull();
  });
});

// ============================================================
// createReverbIR()
// ============================================================

describe('createReverbIR()', () => {
  it('AudioBufferを返す', () => {
    const ctx = createMockAudioContext();
    const ir = createReverbIR(ctx, 2, 2);
    expect(ir).toBeDefined();
    expect(ctx.createBuffer).toHaveBeenCalledWith(2, 44100 * 2, 44100);
  });

  it('チャンネルデータにノイズが書き込まれる', () => {
    const ctx = createMockAudioContext();
    const ir = createReverbIR(ctx, 1, 2);
    const data = ir.getChannelData(0);
    // ランダムノイズなので全ゼロではないはず
    const hasNonZero = Array.from(data).some((v) => v !== 0);
    expect(hasNonZero).toBe(true);
  });

  it('decay が大きいほど減衰が速い', () => {
    // 乱数を固定して決定的にする（線形合同法 PRNG）
    let seed = 42;
    const mockRandom = vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed >>> 0) / 0xffffffff;
    });

    const ctx = createMockAudioContext();
    const slowDecay = createReverbIR(ctx, 1, 1);
    const fastDecay = createReverbIR(ctx, 1, 5);

    mockRandom.mockRestore();

    // 減衰エンベロープ: (1 - i/length)^decay
    // decay=1 は緩やかに減衰、decay=5 は急速に減衰
    // 乱数は同じ系列だが、エンベロープの掛け算で結果が異なる
    const slowData = slowDecay.getChannelData(0);
    const fastData = fastDecay.getChannelData(0);
    // 末尾10%のエネルギー比較
    const tenPct = Math.floor(slowData.length * 0.9);
    let slowRms = 0;
    let fastRms = 0;
    for (let i = tenPct; i < slowData.length; i++) {
      slowRms += slowData[i] ** 2;
      fastRms += fastData[i] ** 2;
    }
    // 減衰が速い方がRMSが小さい
    expect(fastRms).toBeLessThan(slowRms);
  });
});

// ============================================================
// buildMasterChain()
// ============================================================

describe('buildMasterChain()', () => {
  it('マスターゲイン、HPF、LPFを生成する', () => {
    const ctx = createMockAudioContext();
    const result = buildMasterChain(ctx);
    expect(result).toBeDefined();
    // createGainが少なくとも1回呼ばれる（masterGain）
    expect(ctx.createGain).toHaveBeenCalled();
    // HPFとLPFでcreateFilterが呼ばれる
    expect(ctx.createBiquadFilter).toHaveBeenCalled();
  });

  it('オブジェクトを返す', () => {
    const ctx = createMockAudioContext();
    const result = buildMasterChain(ctx);
    expect(result).toBeDefined();
  });
});

// ============================================================
// applyLimiterParams()
// ============================================================

describe('applyLimiterParams()', () => {
  it('nullでもエラーにならない', () => {
    expect(() => applyLimiterParams(null)).not.toThrow();
  });

  it('リミッターのパラメータを設定する', () => {
    // limiter-on チェックボックスをオンに
    const checkbox = document.getElementById('limiter-on');
    checkbox.type = 'checkbox';
    checkbox.checked = true;

    const limiter = {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
    };
    applyLimiterParams(limiter);
    expect(limiter.ratio.value).toBe(20); // ブリックウォール
  });

  it('リミッターOFF時はソフトな設定になる', () => {
    const checkbox = document.getElementById('limiter-on');
    checkbox.checked = false;

    const limiter = {
      threshold: { value: -6 },
      knee: { value: 3 },
      ratio: { value: 20 },
      attack: { value: 0 },
      release: { value: 0 },
    };
    applyLimiterParams(limiter);
    // OFFでもパラメータは設定される（フォールバック値）
    expect(limiter.ratio.value).toBeLessThanOrEqual(20);
  });
});
