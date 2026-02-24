// SF2 (SoundFont 2) パーサー
// RIFF形式のSF2ファイルを解析し、プリセット・サンプル情報を抽出する

export class SF2Parser {
  constructor(buffer) {
    this.data = new DataView(buffer);
    this.offset = 0;
  }

  // --- 基本読み取り ---
  readFourCC() {
    const s = String.fromCharCode(
      this.data.getUint8(this.offset),
      this.data.getUint8(this.offset + 1),
      this.data.getUint8(this.offset + 2),
      this.data.getUint8(this.offset + 3),
    );
    this.offset += 4;
    return s;
  }

  readUint32() {
    const v = this.data.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readUint16() {
    const v = this.data.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  readInt16() {
    const v = this.data.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  readUint8() {
    const v = this.data.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  readString(len) {
    let s = '';
    for (let i = 0; i < len; i++) {
      const c = this.data.getUint8(this.offset + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    this.offset += len;
    return s.trim();
  }

  // --- RIFF チャンク解析 ---
  parse() {
    const riff = this.readFourCC();
    if (riff !== 'RIFF') throw new Error('Not a RIFF file');
    const fileSize = this.readUint32();
    const sfbk = this.readFourCC();
    if (sfbk !== 'sfbk') throw new Error('Not a SoundFont file');

    const result = { info: {}, sdta: null, pdta: {} };

    while (this.offset < this.data.byteLength) {
      const chunkId = this.readFourCC();
      const chunkSize = this.readUint32();
      const chunkEnd = this.offset + chunkSize;

      if (chunkId === 'LIST') {
        const listType = this.readFourCC();
        if (listType === 'INFO') {
          this.parseINFO(result.info, chunkEnd);
        } else if (listType === 'sdta') {
          result.sdta = this.parseSDTA(chunkEnd);
        } else if (listType === 'pdta') {
          this.parsePDTA(result.pdta, chunkEnd);
        } else {
          this.offset = chunkEnd;
        }
      } else {
        this.offset = chunkEnd;
      }
    }

    return result;
  }

  // --- INFO チャンク ---
  parseINFO(info, end) {
    while (this.offset < end) {
      const id = this.readFourCC();
      const size = this.readUint32();
      info[id] = this.readString(size);
      // パディング（偶数境界）
      if (size % 2 !== 0) this.offset += 1;
    }
  }

  // --- sdta チャンク（サンプルデータ）---
  parseSDTA(end) {
    let samples = null;
    while (this.offset < end) {
      const id = this.readFourCC();
      const size = this.readUint32();
      if (id === 'smpl') {
        // 16bit PCM → Float32に変換
        const numSamples = size / 2;
        samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          samples[i] = this.data.getInt16(this.offset + i * 2, true) / 32768;
        }
        this.offset += size;
      } else {
        this.offset += size;
      }
      if (size % 2 !== 0) this.offset += 1;
    }
    return samples;
  }

  // --- pdta チャンク（プリセット/楽器定義）---
  parsePDTA(pdta, end) {
    while (this.offset < end) {
      const id = this.readFourCC();
      const size = this.readUint32();
      const subEnd = this.offset + size;

      if (id === 'phdr') pdta.presetHeaders = this.parsePHDR(subEnd);
      else if (id === 'pbag') pdta.presetBags = this.parseBag(subEnd);
      else if (id === 'pgen') pdta.presetGenerators = this.parseGen(subEnd);
      else if (id === 'inst') pdta.instruments = this.parseINST(subEnd);
      else if (id === 'ibag') pdta.instrumentBags = this.parseBag(subEnd);
      else if (id === 'igen') pdta.instrumentGenerators = this.parseGen(subEnd);
      else if (id === 'shdr') pdta.sampleHeaders = this.parseSHDR(subEnd);
      else this.offset = subEnd;

      if (size % 2 !== 0 && this.offset < end) this.offset += 1;
    }
  }

  // Preset Header (phdr)
  parsePHDR(end) {
    const headers = [];
    while (this.offset < end) {
      headers.push({
        name: this.readString(20),
        preset: this.readUint16(),
        bank: this.readUint16(),
        bagIndex: this.readUint16(),
        library: this.readUint32(),
        genre: this.readUint32(),
        morphology: this.readUint32(),
      });
    }
    return headers;
  }

  // Bag (pbag / ibag)
  parseBag(end) {
    const bags = [];
    while (this.offset < end) {
      bags.push({
        genIndex: this.readUint16(),
        modIndex: this.readUint16(),
      });
    }
    return bags;
  }

  // Generator (pgen / igen)
  parseGen(end) {
    const gens = [];
    while (this.offset < end) {
      gens.push({
        oper: this.readUint16(),
        amount: this.readInt16(),
      });
    }
    return gens;
  }

  // Instrument (inst)
  parseINST(end) {
    const instruments = [];
    while (this.offset < end) {
      instruments.push({
        name: this.readString(20),
        bagIndex: this.readUint16(),
      });
    }
    return instruments;
  }

  // Sample Header (shdr)
  parseSHDR(end) {
    const headers = [];
    while (this.offset < end) {
      // shdr: name(20) + start(4) + end(4) + loopStart(4) + loopEnd(4)
      //       + sampleRate(4) + originalPitch(1) + pitchCorrection(1)
      //       + sampleLink(2) + sampleType(2) = 46 bytes
      const name = this.readString(20);
      const start = this.readUint32();
      const sampleEnd = this.readUint32();
      const loopStart = this.readUint32();
      const loopEnd = this.readUint32();
      const sampleRate = this.readUint32();
      const originalPitch = this.readUint8();
      const pitchCorrection = this.data.getInt8(this.offset);
      this.offset += 1;
      const sampleLink = this.readUint16();
      const sampleType = this.readUint16();
      headers.push({
        name,
        start,
        end: sampleEnd,
        loopStart,
        loopEnd,
        sampleRate,
        originalPitch,
        pitchCorrection,
        sampleLink,
        sampleType,
      });
    }
    return headers;
  }
}

// SF2データからプリセットマップを構築
// preset[bank][program] → zones[] → { keyRange, velRange, sampleId, generators }
export function buildSF2PresetMap(sf2) {
  const { pdta } = sf2;
  const presetMap = {};

  for (let p = 0; p < pdta.presetHeaders.length - 1; p++) {
    const ph = pdta.presetHeaders[p];
    const nextPh = pdta.presetHeaders[p + 1];
    const key = `${ph.bank}-${ph.preset}`;

    const zones = [];
    for (let b = ph.bagIndex; b < nextPh.bagIndex; b++) {
      const bag = pdta.presetBags[b];
      const nextBag = pdta.presetBags[b + 1] || {
        genIndex: pdta.presetGenerators.length,
      };

      const zone = {
        keyRange: [0, 127],
        velRange: [0, 127],
        instrumentId: -1,
        generators: {},
      };

      for (let g = bag.genIndex; g < nextBag.genIndex; g++) {
        const gen = pdta.presetGenerators[g];
        if (gen.oper === 43) {
          // keyRange
          zone.keyRange = [gen.amount & 0xff, (gen.amount >> 8) & 0xff];
        } else if (gen.oper === 44) {
          // velRange
          zone.velRange = [gen.amount & 0xff, (gen.amount >> 8) & 0xff];
        } else if (gen.oper === 41) {
          // instrument
          zone.instrumentId = gen.amount;
        } else {
          zone.generators[gen.oper] = gen.amount;
        }
      }
      zones.push(zone);
    }

    presetMap[key] = {
      name: ph.name,
      bank: ph.bank,
      preset: ph.preset,
      zones,
    };
  }

  return presetMap;
}

// インストゥルメントのゾーンを解析してサンプルマッピングを取得
export function getInstrumentZones(sf2, instrumentId) {
  const { pdta } = sf2;
  if (instrumentId < 0 || instrumentId >= pdta.instruments.length - 1) return [];

  const inst = pdta.instruments[instrumentId];
  const nextInst = pdta.instruments[instrumentId + 1];
  const zones = [];

  for (let b = inst.bagIndex; b < nextInst.bagIndex; b++) {
    const bag = pdta.instrumentBags[b];
    const nextBag = pdta.instrumentBags[b + 1] || {
      genIndex: pdta.instrumentGenerators.length,
    };

    const zone = {
      keyRange: [0, 127],
      velRange: [0, 127],
      sampleId: -1,
      rootKey: -1,
      tuning: 0,
      attenuation: 0,
      pan: 0,
      loopMode: 0,
      generators: {},
    };

    for (let g = bag.genIndex; g < nextBag.genIndex; g++) {
      const gen = pdta.instrumentGenerators[g];
      if (gen.oper === 43) {
        zone.keyRange = [gen.amount & 0xff, (gen.amount >> 8) & 0xff];
      } else if (gen.oper === 44) {
        zone.velRange = [gen.amount & 0xff, (gen.amount >> 8) & 0xff];
      } else if (gen.oper === 53) {
        zone.sampleId = gen.amount;
      } else if (gen.oper === 58) {
        zone.rootKey = gen.amount;
      } else if (gen.oper === 51) {
        zone.tuning = gen.amount; // coarseTune (semitones)
      } else if (gen.oper === 52) {
        zone.tuning += gen.amount / 100; // fineTune (cents)
      } else if (gen.oper === 48) {
        zone.attenuation = gen.amount / 10; // cB → dB
      } else if (gen.oper === 54) {
        zone.loopMode = gen.amount;
      } else {
        zone.generators[gen.oper] = gen.amount;
      }
    }
    zones.push(zone);
  }

  return zones;
}

// MIDIノート＋プログラムに対応するサンプルを検索
export function findSF2Sample(sf2, presetMap, bank, program, midiNote, velocity) {
  const key = `${bank}-${program}`;
  const preset = presetMap[key] || presetMap['0-0']; // フォールバック: Piano
  if (!preset) return null;

  // プリセットゾーンからインストゥルメントを探す
  for (const pZone of preset.zones) {
    if (midiNote < pZone.keyRange[0] || midiNote > pZone.keyRange[1]) continue;
    if (velocity < pZone.velRange[0] || velocity > pZone.velRange[1]) continue;
    if (pZone.instrumentId < 0) continue;

    // インストゥルメントゾーンからサンプルを探す
    const iZones = getInstrumentZones(sf2, pZone.instrumentId);
    for (const iZone of iZones) {
      if (midiNote < iZone.keyRange[0] || midiNote > iZone.keyRange[1]) continue;
      if (velocity < iZone.velRange[0] || velocity > iZone.velRange[1]) continue;
      if (iZone.sampleId < 0) continue;

      const shdr = sf2.pdta.sampleHeaders[iZone.sampleId];
      if (!shdr || shdr.sampleType === 0) continue;

      const rootKey = iZone.rootKey >= 0 ? iZone.rootKey : shdr.originalPitch;
      return {
        shdr,
        rootKey,
        tuning: iZone.tuning,
        attenuation: iZone.attenuation,
        loopMode: iZone.loopMode,
      };
    }
  }

  return null;
}

// サンプルデータからAudioBufferを生成（キャッシュ付き）
const sf2BufferCache = {};

export function getSF2AudioBuffer(audioCtx, sf2, shdr) {
  const cacheKey = `${shdr.name}-${shdr.start}-${shdr.end}`;
  if (sf2BufferCache[cacheKey]) return sf2BufferCache[cacheKey];

  const sampleLen = shdr.end - shdr.start;
  if (sampleLen <= 0 || !sf2.sdta) return null;

  const buffer = audioCtx.createBuffer(1, sampleLen, shdr.sampleRate);
  const channelData = buffer.getChannelData(0);
  channelData.set(sf2.sdta.subarray(shdr.start, shdr.end));

  sf2BufferCache[cacheKey] = buffer;
  return buffer;
}

export function clearSF2BufferCache() {
  for (const key of Object.keys(sf2BufferCache)) {
    delete sf2BufferCache[key];
  }
}
