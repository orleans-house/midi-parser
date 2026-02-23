import { beforeEach, describe, expect, it } from 'vitest';
import {
  detectKeyScale,
  extractChannelPrograms,
  extractNotes,
  GM_INSTRUMENTS,
  getInstrumentName,
  MidiParser,
  midiToFreq,
  noteName,
  remapNote,
  SCALES,
} from '../../js/midi-parser.js';

// ============================================================
// ヘルパー: MIDIバイナリ構築
// ============================================================

/** 可変長数値をバイト配列に変換 */
function varLen(value) {
  if (value < 0x80) return [value];
  const bytes = [];
  bytes.unshift(value & 0x7f);
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes;
}

/** 最小限のMIDIファイルバイナリを生成 */
function buildMidi({ format = 0, ticksPerBeat = 480, tracks = [] } = {}) {
  const chunks = [];

  // MThd
  const header = new ArrayBuffer(14);
  const hv = new DataView(header);
  // "MThd"
  hv.setUint8(0, 0x4d);
  hv.setUint8(1, 0x54);
  hv.setUint8(2, 0x68);
  hv.setUint8(3, 0x64);
  hv.setUint32(4, 6); // header length
  hv.setUint16(8, format);
  hv.setUint16(10, tracks.length);
  hv.setUint16(12, ticksPerBeat);
  chunks.push(new Uint8Array(header));

  // MTrk for each track
  for (const trackEvents of tracks) {
    const data = [];
    for (const ev of trackEvents) {
      data.push(...(ev.bytes || []));
    }
    const trkHeader = new ArrayBuffer(8);
    const tv = new DataView(trkHeader);
    tv.setUint8(0, 0x4d);
    tv.setUint8(1, 0x54);
    tv.setUint8(2, 0x72);
    tv.setUint8(3, 0x6b);
    tv.setUint32(4, data.length);
    chunks.push(new Uint8Array(trkHeader));
    chunks.push(new Uint8Array(data));
  }

  // concat
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result.buffer;
}

/** Note On イベントバイト列 */
function noteOn(delta, channel, note, velocity) {
  return { bytes: [...varLen(delta), 0x90 | channel, note, velocity] };
}

/** Note Off イベントバイト列 */
function noteOff(delta, channel, note, velocity = 0) {
  return { bytes: [...varLen(delta), 0x80 | channel, note, velocity] };
}

/** Program Change イベントバイト列 */
function programChange(delta, channel, program) {
  return { bytes: [...varLen(delta), 0xc0 | channel, program] };
}

/** メタイベント: テンポ設定 */
function tempoEvent(delta, bpm) {
  const usPerBeat = Math.round(60000000 / bpm);
  return {
    bytes: [...varLen(delta), 0xff, 0x51, 0x03, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff],
  };
}

/** メタイベント: End of Track */
function endOfTrack(delta = 0) {
  return { bytes: [...varLen(delta), 0xff, 0x2f, 0x00] };
}

// ============================================================
// MidiParser.parse()
// ============================================================

describe('MidiParser.parse()', () => {
  it('最小限のMIDIファイルをパースできる', () => {
    const buf = buildMidi({
      tracks: [[noteOn(0, 0, 60, 100), noteOff(480, 0, 60), endOfTrack(0)]],
    });
    const result = new MidiParser(buf).parse();
    expect(result.header.format).toBe(0);
    expect(result.header.ticksPerBeat).toBe(480);
    expect(result.tracks).toHaveLength(1);
  });

  it('Note On/Off イベントを正しく抽出する', () => {
    const buf = buildMidi({
      tracks: [[noteOn(0, 0, 60, 100), noteOff(480, 0, 60), endOfTrack(0)]],
    });
    const result = new MidiParser(buf).parse();
    const events = result.tracks[0];
    const noteOns = events.filter((e) => e.type === 'noteOn');
    const noteOffs = events.filter((e) => e.type === 'noteOff');
    expect(noteOns).toHaveLength(1);
    expect(noteOns[0]).toMatchObject({ channel: 0, note: 60, velocity: 100 });
    expect(noteOffs).toHaveLength(1);
    expect(noteOffs[0]).toMatchObject({ channel: 0, note: 60, delta: 480 });
  });

  it('Program Change イベントを正しくパースする', () => {
    const buf = buildMidi({
      tracks: [[programChange(0, 3, 42), endOfTrack(0)]],
    });
    const result = new MidiParser(buf).parse();
    const pc = result.tracks[0].find((e) => e.type === 'programChange');
    expect(pc).toMatchObject({ channel: 3, program: 42 });
  });

  it('テンポメタイベントをパースする', () => {
    const buf = buildMidi({
      tracks: [[tempoEvent(0, 140), endOfTrack(0)]],
    });
    const result = new MidiParser(buf).parse();
    const meta = result.tracks[0].find((e) => e.type === 'meta' && e.metaType === 0x51);
    expect(meta).toBeDefined();
    expect(meta.data).toHaveLength(3);
    // テンポ値を復元して検証
    const us = (meta.data[0] << 16) | (meta.data[1] << 8) | meta.data[2];
    expect(Math.round(60000000 / us)).toBe(140);
  });

  it('フォーマット1（複数トラック）をパースする', () => {
    const buf = buildMidi({
      format: 1,
      tracks: [
        [tempoEvent(0, 120), endOfTrack(0)],
        [noteOn(0, 0, 60, 80), noteOff(480, 0, 60), endOfTrack(0)],
        [noteOn(0, 1, 72, 90), noteOff(240, 1, 72), endOfTrack(0)],
      ],
    });
    const result = new MidiParser(buf).parse();
    expect(result.header.format).toBe(1);
    expect(result.tracks).toHaveLength(3);
  });

  it('不正なヘッダーでエラーを投げる', () => {
    const buf = new ArrayBuffer(14);
    const dv = new DataView(buf);
    // "RIFF" instead of "MThd"
    dv.setUint8(0, 0x52);
    dv.setUint8(1, 0x49);
    dv.setUint8(2, 0x46);
    dv.setUint8(3, 0x46);
    expect(() => new MidiParser(buf).parse()).toThrow('MIDIファイルではありません');
  });

  it('空のトラックをパースできる', () => {
    const buf = buildMidi({
      tracks: [[endOfTrack(0)]],
    });
    const result = new MidiParser(buf).parse();
    expect(result.tracks).toHaveLength(1);
    // End of Track のメタイベントのみ
    expect(result.tracks[0].every((e) => e.type === 'meta')).toBe(true);
  });

  it('大きなデルタタイム（可変長）を正しく読む', () => {
    const buf = buildMidi({
      tracks: [
        [
          noteOn(0, 0, 60, 100),
          // delta = 10000 (> 127, 可変長2バイト以上)
          noteOff(10000, 0, 60),
          endOfTrack(0),
        ],
      ],
    });
    const result = new MidiParser(buf).parse();
    const off = result.tracks[0].find((e) => e.type === 'noteOff');
    expect(off.delta).toBe(10000);
  });
});

// ============================================================
// extractNotes()
// ============================================================

describe('extractNotes()', () => {
  it('単一ノートの開始時刻と長さを計算する', () => {
    const buf = buildMidi({
      tracks: [
        [
          tempoEvent(0, 120), // 120BPM = 0.5s/beat
          noteOn(0, 0, 60, 100),
          noteOff(480, 0, 60), // 1 beat = 0.5s
          endOfTrack(0),
        ],
      ],
    });
    const parsed = new MidiParser(buf).parse();
    const { notes, bpm } = extractNotes(parsed);
    expect(bpm).toBe(120);
    expect(notes).toHaveLength(1);
    expect(notes[0].startTime).toBeCloseTo(0, 5);
    expect(notes[0].duration).toBeCloseTo(0.5, 5);
    expect(notes[0].note).toBe(60);
    expect(notes[0].channel).toBe(0);
    expect(notes[0].velocity).toBe(100);
  });

  it('velocity 0 の Note On を Note Off として扱う', () => {
    const buf = buildMidi({
      tracks: [
        [
          noteOn(0, 0, 60, 100),
          // velocity 0 = Note Off
          { bytes: [...varLen(480), 0x90, 60, 0] },
          endOfTrack(0),
        ],
      ],
    });
    const parsed = new MidiParser(buf).parse();
    const { notes } = extractNotes(parsed);
    expect(notes).toHaveLength(1);
    expect(notes[0].duration).toBeGreaterThan(0);
  });

  it('テンポ変更を反映する', () => {
    // 120 BPM で1拍 → 60 BPM に変更 → さらに1拍
    const buf = buildMidi({
      format: 1,
      tracks: [
        [
          tempoEvent(0, 120),
          tempoEvent(480, 60), // tick 480 でテンポ変更
          endOfTrack(0),
        ],
        [
          noteOn(0, 0, 60, 100),
          noteOff(960, 0, 60), // tick 960 = 1拍@120BPM + 1拍@60BPM
          endOfTrack(0),
        ],
      ],
    });
    const parsed = new MidiParser(buf).parse();
    const { notes } = extractNotes(parsed);
    // 1拍@120BPM = 0.5s, 1拍@60BPM = 1.0s → total 1.5s
    expect(notes[0].duration).toBeCloseTo(1.5, 3);
  });

  it('デフォルトテンポ（120BPM）を使用する', () => {
    const buf = buildMidi({
      tracks: [[noteOn(0, 0, 60, 100), noteOff(480, 0, 60), endOfTrack(0)]],
    });
    const parsed = new MidiParser(buf).parse();
    const { notes, bpm } = extractNotes(parsed);
    expect(bpm).toBe(120);
    expect(notes[0].duration).toBeCloseTo(0.5, 5);
  });

  it('複数チャンネルのノートを正しく分離する', () => {
    const buf = buildMidi({
      tracks: [[noteOn(0, 0, 60, 100), noteOn(0, 1, 72, 90), noteOff(480, 0, 60), noteOff(0, 1, 72), endOfTrack(0)]],
    });
    const parsed = new MidiParser(buf).parse();
    const { notes } = extractNotes(parsed);
    expect(notes).toHaveLength(2);
    expect(notes.find((n) => n.channel === 0).note).toBe(60);
    expect(notes.find((n) => n.channel === 1).note).toBe(72);
  });

  it('時間順にソートされる', () => {
    const buf = buildMidi({
      format: 1,
      tracks: [
        [noteOn(480, 0, 60, 100), noteOff(480, 0, 60), endOfTrack(0)],
        [noteOn(0, 1, 72, 90), noteOff(480, 1, 72), endOfTrack(0)],
      ],
    });
    const parsed = new MidiParser(buf).parse();
    const { notes } = extractNotes(parsed);
    expect(notes[0].startTime).toBeLessThanOrEqual(notes[1].startTime);
  });

  it('ノートがない場合は空配列を返す', () => {
    const buf = buildMidi({
      tracks: [[tempoEvent(0, 120), endOfTrack(0)]],
    });
    const parsed = new MidiParser(buf).parse();
    const { notes } = extractNotes(parsed);
    expect(notes).toHaveLength(0);
  });
});

// ============================================================
// noteName()
// ============================================================

describe('noteName()', () => {
  it('C4 (MIDI 60)', () => expect(noteName(60)).toBe('C4'));
  it('A4 (MIDI 69)', () => expect(noteName(69)).toBe('A4'));
  it('C-1 (MIDI 0)', () => expect(noteName(0)).toBe('C-1'));
  it('G9 (MIDI 127)', () => expect(noteName(127)).toBe('G9'));
  it('C#5 (MIDI 73)', () => expect(noteName(73)).toBe('C#5'));
});

// ============================================================
// getInstrumentName()
// ============================================================

describe('getInstrumentName()', () => {
  it('有効なプログラム番号で楽器名を返す', () => {
    expect(getInstrumentName(0)).toBe('Acoustic Grand Piano');
    expect(getInstrumentName(127)).toBe('Gunshot');
  });

  it('範囲外のプログラム番号でフォールバック文字列を返す', () => {
    expect(getInstrumentName(128)).toBe('Program 128');
    expect(getInstrumentName(-1)).toBe('Program -1');
  });

  it('GM音色は128種類定義されている', () => {
    expect(GM_INSTRUMENTS).toHaveLength(128);
  });
});

// ============================================================
// extractChannelPrograms()
// ============================================================

describe('extractChannelPrograms()', () => {
  it('チャンネルごとのプログラム番号を抽出する', () => {
    const buf = buildMidi({
      tracks: [[programChange(0, 0, 10), programChange(0, 3, 42), endOfTrack(0)]],
    });
    const parsed = new MidiParser(buf).parse();
    const programs = extractChannelPrograms(parsed);
    expect(programs[0]).toBe(10);
    expect(programs[3]).toBe(42);
  });

  it('Program Change がない場合は空オブジェクトを返す', () => {
    const buf = buildMidi({
      tracks: [[endOfTrack(0)]],
    });
    const parsed = new MidiParser(buf).parse();
    const programs = extractChannelPrograms(parsed);
    expect(Object.keys(programs)).toHaveLength(0);
  });

  it('同一チャンネルの後勝ち', () => {
    const buf = buildMidi({
      tracks: [[programChange(0, 0, 10), programChange(480, 0, 25), endOfTrack(0)]],
    });
    const parsed = new MidiParser(buf).parse();
    const programs = extractChannelPrograms(parsed);
    expect(programs[0]).toBe(25);
  });
});

// ============================================================
// remapNote()
// ============================================================

describe('remapNote()', () => {
  beforeEach(() => {
    // スケール変換を無効化
    window._scaleConvert = null;
  });

  it('スケール変換が無効なら入力をそのまま返す', () => {
    window._scaleConvert = null;
    expect(remapNote(60)).toBe(60);
  });

  it('enabled=false なら入力をそのまま返す', () => {
    window._scaleConvert = { enabled: false, from: 'major', to: 'minor', key: 0 };
    expect(remapNote(60)).toBe(60);
  });

  it('同じスケール間なら入力をそのまま返す', () => {
    window._scaleConvert = { enabled: true, from: 'major', to: 'major', key: 0 };
    expect(remapNote(60)).toBe(60);
  });

  it('major → minor でC4(60)のE(64)がEb(63)になる', () => {
    window._scaleConvert = { enabled: true, from: 'major', to: 'minor', key: 0 };
    // E4 = 64, major の 3rd (E) → minor の 3rd (Eb=63)
    expect(remapNote(64)).toBe(63);
  });

  it('キー指定が反映される', () => {
    // key=2 (D major → D minor)
    window._scaleConvert = { enabled: true, from: 'major', to: 'minor', key: 2 };
    // D major の 3rd = F# (66) → D minor の 3rd = F (65)
    expect(remapNote(66)).toBe(65);
  });

  it('結果が0-127にクランプされる', () => {
    window._scaleConvert = { enabled: true, from: 'major', to: 'minor', key: 0 };
    expect(remapNote(0)).toBeGreaterThanOrEqual(0);
    expect(remapNote(127)).toBeLessThanOrEqual(127);
  });
});

// ============================================================
// detectKeyScale()
// ============================================================

describe('detectKeyScale()', () => {
  /** 指定スケールに沿ったノート列を生成 */
  function makeScaleNotes(key, scaleName, count = 50) {
    const intervals = SCALES[scaleName];
    const notes = [];
    for (let i = 0; i < count; i++) {
      const deg = i % intervals.length;
      const oct = Math.floor(i / intervals.length);
      notes.push({
        note: key + oct * 12 + intervals[deg],
        duration: 0.5,
      });
    }
    return notes;
  }

  it('Cメジャーを検出する', () => {
    const notes = makeScaleNotes(0, 'major');
    const result = detectKeyScale(notes);
    expect(result.key).toBe(0);
    expect(result.scale).toBe('major');
  });

  it('Aマイナーを検出する（Cメジャーと相対調で同一音階のため許容）', () => {
    const notes = makeScaleNotes(9, 'minor');
    const result = detectKeyScale(notes);
    // A minor と C major は同じ構成音なので、どちらが検出されても正しい
    const isAMinor = result.key === 9 && result.scale === 'minor';
    const isCMajor = result.key === 0 && result.scale === 'major';
    expect(isAMinor || isCMajor).toBe(true);
  });

  it('ペンタトニックを検出する', () => {
    const notes = makeScaleNotes(0, 'pentatonic', 100);
    const result = detectKeyScale(notes);
    expect(result.key).toBe(0);
    // ペンタトニックはmajorのサブセットなので、majorが検出される可能性あり
    expect(['pentatonic', 'major']).toContain(result.scale);
  });

  it('空のノートでもクラッシュしない', () => {
    const result = detectKeyScale([]);
    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('scale');
  });
});

// ============================================================
// midiToFreq()
// ============================================================

describe('midiToFreq()', () => {
  beforeEach(() => {
    window._scaleConvert = null;
    window._pitchShift = 0;
    window._freqShift = 0;
  });

  it('A4 (MIDI 69) = 440Hz', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 2);
  });

  it('C4 (MIDI 60) ≈ 261.63Hz', () => {
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });

  it('pitchShift +12 で1オクターブ上', () => {
    window._pitchShift = 12;
    expect(midiToFreq(69)).toBeCloseTo(880, 2);
  });

  it('pitchShift -12 で1オクターブ下', () => {
    window._pitchShift = -12;
    expect(midiToFreq(69)).toBeCloseTo(220, 2);
  });

  it('freqShift +100Hz', () => {
    window._freqShift = 100;
    expect(midiToFreq(69)).toBeCloseTo(540, 2);
  });

  it('結果が1Hz未満にならない（下限クランプ）', () => {
    window._freqShift = -10000;
    expect(midiToFreq(0)).toBe(1);
  });

  it('pitchShift + freqShift の組み合わせ', () => {
    window._pitchShift = 12;
    window._freqShift = -100;
    // A4+12 = A5 = 880Hz - 100 = 780Hz
    expect(midiToFreq(69)).toBeCloseTo(780, 2);
  });
});

// ============================================================
// SCALES 定義の整合性
// ============================================================

describe('SCALES', () => {
  it('14種類のスケールが定義されている', () => {
    expect(Object.keys(SCALES)).toHaveLength(14);
  });

  it('全スケールのインターバルが0始まりで昇順', () => {
    for (const [name, intervals] of Object.entries(SCALES)) {
      expect(intervals[0]).toBe(0);
      for (let i = 1; i < intervals.length; i++) {
        expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
      }
    }
  });

  it('全インターバルが0-11の範囲内', () => {
    for (const intervals of Object.values(SCALES)) {
      for (const v of intervals) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(11);
      }
    }
  });

  it('chromaticは12音すべて含む', () => {
    expect(SCALES.chromatic).toHaveLength(12);
  });
});
