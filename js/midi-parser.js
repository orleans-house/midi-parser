// ============================================================
// MIDI バイナリパーサー
// ============================================================

class MidiParser {
  constructor(buffer) {
    this.data = new DataView(buffer);
    this.pos = 0;
  }

  // 読み取りヘルパー
  readUint8() {
    return this.data.getUint8(this.pos++);
  }
  readUint16() {
    const v = this.data.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  readUint32() {
    const v = this.data.getUint32(this.pos);
    this.pos += 4;
    return v;
  }
  readBytes(n) {
    const arr = new Uint8Array(this.data.buffer, this.pos, n);
    this.pos += n;
    return arr;
  }

  // 可変長数値
  readVarLen() {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.readUint8();
      value = (value << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return value;
  }

  // チャンク識別子を文字列で読む
  readChunkId() {
    return String.fromCharCode(...this.readBytes(4));
  }

  parse() {
    // ヘッダーチャンク
    const headerId = this.readChunkId();
    if (headerId !== 'MThd') throw new Error('MIDIファイルではありません');
    const headerLen = this.readUint32();
    const format = this.readUint16();
    const numTracks = this.readUint16();
    const timeDivision = this.readUint16();

    // ティックベースの場合のデフォルトテンポ（120 BPM = 500000 μs/beat）
    const ticksPerBeat = (timeDivision & 0x8000) === 0 ? timeDivision : 480;

    const header = { format, numTracks, timeDivision, ticksPerBeat };
    const tracks = [];

    for (let t = 0; t < numTracks; t++) {
      const trackId = this.readChunkId();
      const trackLen = this.readUint32();
      if (trackId !== 'MTrk') {
        // 不明なチャンクはスキップ
        this.pos += trackLen;
        continue;
      }
      const trackEnd = this.pos + trackLen;
      const events = [];
      let runningStatus = 0;

      try {
        while (this.pos < trackEnd) {
          const delta = this.readVarLen();
          let statusByte = this.data.getUint8(this.pos);

          // ランニングステータス
          if (statusByte < 0x80) {
            statusByte = runningStatus;
          } else {
            this.pos++;
            if (statusByte < 0xf0) runningStatus = statusByte;
          }

          const type = statusByte & 0xf0;
          const channel = statusByte & 0x0f;

          if (statusByte === 0xff) {
            // メタイベント
            const metaType = this.readUint8();
            const len = this.readVarLen();
            const metaData = this.readBytes(len);
            events.push({ delta, type: 'meta', metaType, data: metaData });
          } else if (statusByte === 0xf0 || statusByte === 0xf7) {
            // SysExイベント
            const len = this.readVarLen();
            this.pos += len;
            events.push({ delta, type: 'sysex' });
          } else if (type === 0x90) {
            // Note On
            const note = this.readUint8();
            const velocity = this.readUint8();
            events.push({ delta, type: 'noteOn', channel, note, velocity });
          } else if (type === 0x80) {
            // Note Off
            const note = this.readUint8();
            const velocity = this.readUint8();
            events.push({ delta, type: 'noteOff', channel, note, velocity });
          } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
            // Aftertouch, CC, Pitch Bend (2バイト)
            this.readUint8();
            this.readUint8();
            events.push({ delta, type: 'other' });
          } else if (type === 0xc0) {
            // Program Change (1バイト)
            const program = this.readUint8();
            events.push({ delta, type: 'programChange', channel, program });
          } else if (type === 0xd0) {
            // Channel Pressure (1バイト)
            this.readUint8();
            events.push({ delta, type: 'other' });
          } else {
            // 未知のイベントはスキップ（1バイト消費して進む）
            this.pos++;
            events.push({ delta, type: 'unknown' });
          }
        }
      } catch (e) {
        console.warn(`Track ${t} parse error:`, e.message);
      }
      this.pos = trackEnd;
      tracks.push(events);
    }

    return { header, tracks };
  }
}

// ============================================================
// MIDI データ → ノートリスト変換
// ============================================================

function extractNotes(parsed) {
  const { header, tracks } = parsed;
  const ticksPerBeat = header.ticksPerBeat;
  let tempo = 500000; // デフォルト 120 BPM
  const allNotes = [];

  // テンポマップを構築（全トラックから収集）
  const tempoMap = [];
  for (const events of tracks) {
    let tick = 0;
    for (const e of events) {
      tick += e.delta;
      if (e.type === 'meta' && e.metaType === 0x51 && e.data.length === 3) {
        const t = (e.data[0] << 16) | (e.data[1] << 8) | e.data[2];
        tempoMap.push({ tick, tempo: t });
      }
    }
  }
  tempoMap.sort((a, b) => a.tick - b.tick);
  if (tempoMap.length > 0) tempo = tempoMap[0].tempo;

  // ティック → 秒変換
  function tickToSec(targetTick) {
    let currentTempo = tempoMap.length > 0 ? tempoMap[0].tempo : 500000;
    let lastTick = 0;
    let time = 0;
    for (const tm of tempoMap) {
      if (tm.tick >= targetTick) break;
      time += ((tm.tick - lastTick) / ticksPerBeat) * (currentTempo / 1000000);
      lastTick = tm.tick;
      currentTempo = tm.tempo;
    }
    time += ((targetTick - lastTick) / ticksPerBeat) * (currentTempo / 1000000);
    return time;
  }

  // 各トラックからノートを抽出
  for (const events of tracks) {
    let tick = 0;
    const activeNotes = new Map(); // key: "ch-note"

    for (const e of events) {
      tick += e.delta;

      if (e.type === 'noteOn' && e.velocity > 0) {
        const key = `${e.channel}-${e.note}`;
        activeNotes.set(key, { tick, channel: e.channel, note: e.note, velocity: e.velocity });
      } else if (e.type === 'noteOff' || (e.type === 'noteOn' && e.velocity === 0)) {
        const key = `${e.channel}-${e.note}`;
        const start = activeNotes.get(key);
        if (start) {
          allNotes.push({
            channel: start.channel,
            note: start.note,
            velocity: start.velocity,
            startTick: start.tick,
            endTick: tick,
            startTime: tickToSec(start.tick),
            duration: tickToSec(tick) - tickToSec(start.tick),
          });
          activeNotes.delete(key);
        }
      }
    }
  }

  // 時間順ソート
  allNotes.sort((a, b) => a.startTime - b.startTime || a.note - b.note);

  const bpm = Math.round(60000000 / tempo);
  return { notes: allNotes, tempo, bpm };
}

// ============================================================
// 音名変換
// ============================================================

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteName(midiNote) {
  const octave = Math.floor(midiNote / 12) - 1;
  return NOTE_NAMES[midiNote % 12] + octave;
}

// ============================================================
// General MIDI 音色マップ（128種類）
// ============================================================

const GM_INSTRUMENTS = [
  // Piano (0-7)
  'Acoustic Grand Piano',
  'Bright Acoustic Piano',
  'Electric Grand Piano',
  'Honky-tonk Piano',
  'Electric Piano 1',
  'Electric Piano 2',
  'Harpsichord',
  'Clavinet',
  // Chromatic Percussion (8-15)
  'Celesta',
  'Glockenspiel',
  'Music Box',
  'Vibraphone',
  'Marimba',
  'Xylophone',
  'Tubular Bells',
  'Dulcimer',
  // Organ (16-23)
  'Drawbar Organ',
  'Percussive Organ',
  'Rock Organ',
  'Church Organ',
  'Reed Organ',
  'Accordion',
  'Harmonica',
  'Tango Accordion',
  // Guitar (24-31)
  'Acoustic Guitar (nylon)',
  'Acoustic Guitar (steel)',
  'Electric Guitar (jazz)',
  'Electric Guitar (clean)',
  'Electric Guitar (muted)',
  'Overdriven Guitar',
  'Distortion Guitar',
  'Guitar Harmonics',
  // Bass (32-39)
  'Acoustic Bass',
  'Electric Bass (finger)',
  'Electric Bass (pick)',
  'Fretless Bass',
  'Slap Bass 1',
  'Slap Bass 2',
  'Synth Bass 1',
  'Synth Bass 2',
  // Strings (40-47)
  'Violin',
  'Viola',
  'Cello',
  'Contrabass',
  'Tremolo Strings',
  'Pizzicato Strings',
  'Orchestral Harp',
  'Timpani',
  // Ensemble (48-55)
  'String Ensemble 1',
  'String Ensemble 2',
  'Synth Strings 1',
  'Synth Strings 2',
  'Choir Aahs',
  'Voice Oohs',
  'Synth Choir',
  'Orchestra Hit',
  // Brass (56-63)
  'Trumpet',
  'Trombone',
  'Tuba',
  'Muted Trumpet',
  'French Horn',
  'Brass Section',
  'Synth Brass 1',
  'Synth Brass 2',
  // Reed (64-71)
  'Soprano Sax',
  'Alto Sax',
  'Tenor Sax',
  'Baritone Sax',
  'Oboe',
  'English Horn',
  'Bassoon',
  'Clarinet',
  // Pipe (72-79)
  'Piccolo',
  'Flute',
  'Recorder',
  'Pan Flute',
  'Blown Bottle',
  'Shakuhachi',
  'Whistle',
  'Ocarina',
  // Synth Lead (80-87)
  'Lead 1 (square)',
  'Lead 2 (sawtooth)',
  'Lead 3 (calliope)',
  'Lead 4 (chiff)',
  'Lead 5 (charang)',
  'Lead 6 (voice)',
  'Lead 7 (fifths)',
  'Lead 8 (bass + lead)',
  // Synth Pad (88-95)
  'Pad 1 (new age)',
  'Pad 2 (warm)',
  'Pad 3 (polysynth)',
  'Pad 4 (choir)',
  'Pad 5 (bowed)',
  'Pad 6 (metallic)',
  'Pad 7 (halo)',
  'Pad 8 (sweep)',
  // Synth Effects (96-103)
  'FX 1 (rain)',
  'FX 2 (soundtrack)',
  'FX 3 (crystal)',
  'FX 4 (atmosphere)',
  'FX 5 (brightness)',
  'FX 6 (goblins)',
  'FX 7 (echoes)',
  'FX 8 (sci-fi)',
  // Ethnic (104-111)
  'Sitar',
  'Banjo',
  'Shamisen',
  'Koto',
  'Kalimba',
  'Bagpipe',
  'Fiddle',
  'Shanai',
  // Percussive (112-119)
  'Tinkle Bell',
  'Agogo',
  'Steel Drums',
  'Woodblock',
  'Taiko Drum',
  'Melodic Tom',
  'Synth Drum',
  'Reverse Cymbal',
  // Sound Effects (120-127)
  'Guitar Fret Noise',
  'Breath Noise',
  'Seashore',
  'Bird Tweet',
  'Telephone Ring',
  'Helicopter',
  'Applause',
  'Gunshot',
];

function getInstrumentName(program) {
  return GM_INSTRUMENTS[program] || `Program ${program}`;
}

// チャンネルごとのプログラム番号（楽器）

function extractChannelPrograms(parsed) {
  const programs = {};
  for (const events of parsed.tracks) {
    for (const e of events) {
      if (e.type === 'programChange') {
        programs[e.channel] = e.program;
      }
    }
  }
  return programs;
}

function midiToFreq(midiNote) {
  return 440 * 2 ** ((midiNote - 69) / 12);
}
