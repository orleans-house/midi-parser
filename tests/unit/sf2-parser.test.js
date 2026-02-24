import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildSF2PresetMap,
  clearSF2BufferCache,
  findSF2Sample,
  getInstrumentZones,
  SF2Parser,
} from '../../src/js/sf2-parser.js';

// ============================================================
// ヘルパー: SF2バイナリ構築
// ============================================================

/** 文字列をバイト配列に変換（指定長でパディング） */
function strBytes(s, len) {
  const arr = new Uint8Array(len);
  for (let i = 0; i < Math.min(s.length, len); i++) {
    arr[i] = s.charCodeAt(i);
  }
  return arr;
}

/** FourCC文字列を4バイトに */
function fourCC(s) {
  return strBytes(s, 4);
}

/** Uint32 (little-endian) をバイト配列に */
function u32le(v) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, v, true);
  return new Uint8Array(buf);
}

/** Uint16 (little-endian) をバイト配列に */
function u16le(v) {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setUint16(0, v, true);
  return new Uint8Array(buf);
}

/** Int16 (little-endian) をバイト配列に */
function i16le(v) {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setInt16(0, v, true);
  return new Uint8Array(buf);
}

/** 複数のUint8Array/配列を結合 */
function concat(...arrays) {
  const parts = arrays.map((a) => (a instanceof Uint8Array ? a : new Uint8Array(a)));
  const totalLen = parts.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of parts) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/** LISTチャンクを構築 */
function listChunk(type, ...subChunks) {
  const body = concat(fourCC(type), ...subChunks);
  return concat(fourCC('LIST'), u32le(body.length), body);
}

/** サブチャンクを構築 */
function subChunk(id, data) {
  const d = data instanceof Uint8Array ? data : new Uint8Array(data);
  return concat(fourCC(id), u32le(d.length), d);
}

/** Preset Header (38 bytes): name(20) + preset(2) + bank(2) + bagIndex(2) + library(4) + genre(4) + morphology(4) */
function phdr(name, preset, bank, bagIndex) {
  return concat(strBytes(name, 20), u16le(preset), u16le(bank), u16le(bagIndex), u32le(0), u32le(0), u32le(0));
}

/** Bag (4 bytes): genIndex(2) + modIndex(2) */
function bag(genIndex, modIndex = 0) {
  return concat(u16le(genIndex), u16le(modIndex));
}

/** Generator (4 bytes): oper(2) + amount(2) */
function gen(oper, amount) {
  return concat(u16le(oper), i16le(amount));
}

/** Instrument (22 bytes): name(20) + bagIndex(2) */
function inst(name, bagIndex) {
  return concat(strBytes(name, 20), u16le(bagIndex));
}

/** Sample Header (46 bytes) */
function shdr(
  name,
  start,
  end,
  loopStart,
  loopEnd,
  sampleRate,
  originalPitch,
  pitchCorrection = 0,
  sampleLink = 0,
  sampleType = 1,
) {
  return concat(
    strBytes(name, 20),
    u32le(start),
    u32le(end),
    u32le(loopStart),
    u32le(loopEnd),
    u32le(sampleRate),
    new Uint8Array([originalPitch]),
    new Uint8Array([pitchCorrection & 0xff]),
    u16le(sampleLink),
    u16le(sampleType),
  );
}

/** keyRange generator (oper=43): lo | (hi << 8) */
function keyRangeGen(lo, hi) {
  return gen(43, lo | (hi << 8));
}

/** velRange generator (oper=44): lo | (hi << 8) */
function velRangeGen(lo, hi) {
  return gen(44, lo | (hi << 8));
}

/** instrument generator (oper=41) */
function instrumentGen(id) {
  return gen(41, id);
}

/** sampleID generator (oper=53) */
function sampleIdGen(id) {
  return gen(53, id);
}

/**
 * 最小限のSF2ファイルバイナリを生成
 * Piano (bank=0, program=0) の1プリセットを持つ
 */
function buildMinimalSF2() {
  // smpl: 100サンプルの16bit PCMデータ (200 bytes)
  const sampleCount = 100;
  const smplData = new Uint8Array(sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    const val = Math.round(Math.sin((i / sampleCount) * Math.PI * 2) * 16000);
    new DataView(smplData.buffer).setInt16(i * 2, val, true);
  }

  const infoChunk = listChunk(
    'INFO',
    subChunk('ifil', concat(u16le(2), u16le(1))),
    subChunk('isng', strBytes('EMU8000', 8)),
    subChunk('INAM', strBytes('Test SF2', 10)),
  );

  const sdtaChunk = listChunk('sdta', subChunk('smpl', smplData));

  // pdta: 1 preset (Piano), 1 instrument, 1 sample
  const pdtaChunk = listChunk(
    'pdta',
    // phdr: Piano + terminal
    subChunk('phdr', concat(phdr('Piano', 0, 0, 0), phdr('EOP', 0, 0, 1))),
    // pbag: 1 zone + terminal
    subChunk('pbag', concat(bag(0), bag(1))),
    // pgen: instrument=0
    subChunk('pgen', instrumentGen(0)),
    // inst: TestInst + terminal
    subChunk('inst', concat(inst('TestInst', 0), inst('EOI', 1))),
    // ibag: 1 zone + terminal
    subChunk('ibag', concat(bag(0), bag(2))),
    // igen: keyRange(0-127), sampleID=0
    subChunk('igen', concat(keyRangeGen(0, 127), sampleIdGen(0))),
    // shdr: TestSample + terminal
    subChunk(
      'shdr',
      concat(shdr('TestSample', 0, sampleCount, 0, sampleCount, 44100, 60), shdr('EOS', 0, 0, 0, 0, 0, 0, 0, 0, 0)),
    ),
  );

  const sfbkBody = concat(fourCC('sfbk'), infoChunk, sdtaChunk, pdtaChunk);
  return concat(fourCC('RIFF'), u32le(sfbkBody.length), sfbkBody);
}

// ============================================================
// SF2Parser.parse()
// ============================================================

describe('SF2Parser.parse()', () => {
  it('最小限のSF2ファイルをパースできる', () => {
    const buf = buildMinimalSF2();
    const result = new SF2Parser(buf.buffer).parse();
    expect(result).toHaveProperty('info');
    expect(result).toHaveProperty('sdta');
    expect(result).toHaveProperty('pdta');
  });

  it('INFO チャンクを正しく読む', () => {
    const buf = buildMinimalSF2();
    const result = new SF2Parser(buf.buffer).parse();
    expect(result.info.INAM).toBe('Test SF2');
    expect(result.info.isng).toBe('EMU8000');
  });

  it('sdta からFloat32サンプルデータを取得する', () => {
    const buf = buildMinimalSF2();
    const result = new SF2Parser(buf.buffer).parse();
    expect(result.sdta).toBeInstanceOf(Float32Array);
    expect(result.sdta.length).toBe(100);
    // 値が-1〜1の範囲
    for (let i = 0; i < result.sdta.length; i++) {
      expect(result.sdta[i]).toBeGreaterThanOrEqual(-1);
      expect(result.sdta[i]).toBeLessThanOrEqual(1);
    }
  });

  it('pdta のプリセットヘッダーをパースする', () => {
    const buf = buildMinimalSF2();
    const result = new SF2Parser(buf.buffer).parse();
    expect(result.pdta.presetHeaders).toBeDefined();
    expect(result.pdta.presetHeaders.length).toBe(2); // Piano + terminal
    expect(result.pdta.presetHeaders[0].name).toBe('Piano');
    expect(result.pdta.presetHeaders[0].preset).toBe(0);
    expect(result.pdta.presetHeaders[0].bank).toBe(0);
  });

  it('pdta のインストゥルメントをパースする', () => {
    const buf = buildMinimalSF2();
    const result = new SF2Parser(buf.buffer).parse();
    expect(result.pdta.instruments).toBeDefined();
    expect(result.pdta.instruments[0].name).toBe('TestInst');
  });

  it('pdta のサンプルヘッダーをパースする', () => {
    const buf = buildMinimalSF2();
    const result = new SF2Parser(buf.buffer).parse();
    const hdr = result.pdta.sampleHeaders[0];
    expect(hdr.name).toBe('TestSample');
    expect(hdr.start).toBe(0);
    expect(hdr.end).toBe(100);
    expect(hdr.sampleRate).toBe(44100);
    expect(hdr.originalPitch).toBe(60);
  });

  it('不正なRIFFヘッダーでエラーを投げる', () => {
    const buf = new ArrayBuffer(12);
    const dv = new DataView(buf);
    // "WAVE" instead of "RIFF"
    dv.setUint8(0, 0x57);
    dv.setUint8(1, 0x41);
    dv.setUint8(2, 0x56);
    dv.setUint8(3, 0x45);
    expect(() => new SF2Parser(buf).parse()).toThrow('Not a RIFF file');
  });

  it('sfbkでないRIFFファイルでエラーを投げる', () => {
    const buf = new ArrayBuffer(12);
    const dv = new DataView(buf);
    // "RIFF"
    dv.setUint8(0, 0x52);
    dv.setUint8(1, 0x49);
    dv.setUint8(2, 0x46);
    dv.setUint8(3, 0x46);
    dv.setUint32(4, 4, true);
    // "WAVE" instead of "sfbk"
    dv.setUint8(8, 0x57);
    dv.setUint8(9, 0x41);
    dv.setUint8(10, 0x56);
    dv.setUint8(11, 0x45);
    expect(() => new SF2Parser(buf).parse()).toThrow('Not a SoundFont file');
  });
});

// ============================================================
// buildSF2PresetMap()
// ============================================================

describe('buildSF2PresetMap()', () => {
  let sf2;

  beforeEach(() => {
    const buf = buildMinimalSF2();
    sf2 = new SF2Parser(buf.buffer).parse();
  });

  it('プリセットマップを構築できる', () => {
    const map = buildSF2PresetMap(sf2);
    expect(map).toBeDefined();
    expect(Object.keys(map).length).toBeGreaterThan(0);
  });

  it('bank-programキーでアクセスできる', () => {
    const map = buildSF2PresetMap(sf2);
    expect(map['0-0']).toBeDefined();
    expect(map['0-0'].name).toBe('Piano');
    expect(map['0-0'].bank).toBe(0);
    expect(map['0-0'].preset).toBe(0);
  });

  it('ゾーン情報を含む', () => {
    const map = buildSF2PresetMap(sf2);
    const piano = map['0-0'];
    expect(piano.zones).toBeDefined();
    expect(piano.zones.length).toBeGreaterThan(0);
  });

  it('ゾーンにinstrumentIdがある', () => {
    const map = buildSF2PresetMap(sf2);
    const zone = map['0-0'].zones[0];
    expect(zone.instrumentId).toBe(0);
  });
});

// ============================================================
// getInstrumentZones()
// ============================================================

describe('getInstrumentZones()', () => {
  let sf2;

  beforeEach(() => {
    const buf = buildMinimalSF2();
    sf2 = new SF2Parser(buf.buffer).parse();
  });

  it('インストゥルメントゾーンを取得できる', () => {
    const zones = getInstrumentZones(sf2, 0);
    expect(zones.length).toBeGreaterThan(0);
  });

  it('ゾーンにkeyRangeがある', () => {
    const zones = getInstrumentZones(sf2, 0);
    expect(zones[0].keyRange).toEqual([0, 127]);
  });

  it('ゾーンにsampleIdがある', () => {
    const zones = getInstrumentZones(sf2, 0);
    expect(zones[0].sampleId).toBe(0);
  });

  it('範囲外のinstrumentIdで空配列を返す', () => {
    expect(getInstrumentZones(sf2, -1)).toEqual([]);
    expect(getInstrumentZones(sf2, 999)).toEqual([]);
  });
});

// ============================================================
// findSF2Sample()
// ============================================================

describe('findSF2Sample()', () => {
  let sf2;
  let presetMap;

  beforeEach(() => {
    const buf = buildMinimalSF2();
    sf2 = new SF2Parser(buf.buffer).parse();
    presetMap = buildSF2PresetMap(sf2);
  });

  it('指定bank/program/noteでサンプルを見つける', () => {
    const result = findSF2Sample(sf2, presetMap, 0, 0, 60, 100);
    expect(result).not.toBeNull();
    expect(result.shdr).toBeDefined();
    expect(result.shdr.name).toBe('TestSample');
  });

  it('rootKeyを返す', () => {
    const result = findSF2Sample(sf2, presetMap, 0, 0, 60, 100);
    expect(result.rootKey).toBe(60);
  });

  it('keyRange外のnoteではnullを返す', () => {
    // keyRange を 48-72 に絞ったプリセットマップを手動構築
    const narrowMap = {
      '0-0': {
        name: 'Narrow',
        bank: 0,
        preset: 0,
        zones: [
          {
            keyRange: [48, 72],
            velRange: [0, 127],
            instrumentId: 0,
            generators: {},
          },
        ],
      },
    };
    // 範囲内: 見つかる
    const found = findSF2Sample(sf2, narrowMap, 0, 0, 60, 100);
    expect(found).not.toBeNull();
    // 範囲外: null
    const low = findSF2Sample(sf2, narrowMap, 0, 0, 30, 100);
    expect(low).toBeNull();
    const high = findSF2Sample(sf2, narrowMap, 0, 0, 100, 100);
    expect(high).toBeNull();
  });

  it('存在しないプリセットで0-0にフォールバックする', () => {
    const result = findSF2Sample(sf2, presetMap, 99, 99, 60, 100);
    if (presetMap['0-0']) {
      expect(result).not.toBeNull();
    }
  });

  it('プリセットマップが完全に空ならnullを返す', () => {
    const result = findSF2Sample(sf2, {}, 0, 0, 60, 100);
    expect(result).toBeNull();
  });

  it('境界値: velocity 0', () => {
    const result = findSF2Sample(sf2, presetMap, 0, 0, 60, 0);
    // velRange [0,127] なので見つかるはず
    expect(result).not.toBeNull();
  });

  it('境界値: note 0 と 127', () => {
    const result0 = findSF2Sample(sf2, presetMap, 0, 0, 0, 100);
    const result127 = findSF2Sample(sf2, presetMap, 0, 0, 127, 100);
    expect(result0).not.toBeNull();
    expect(result127).not.toBeNull();
  });
});

// ============================================================
// clearSF2BufferCache()
// ============================================================

describe('clearSF2BufferCache()', () => {
  it('呼び出してもエラーにならない', () => {
    expect(() => clearSF2BufferCache()).not.toThrow();
  });
});
