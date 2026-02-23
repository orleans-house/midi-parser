// ============================================================
// ES Modules エントリポイント
// 全モジュールをimportし、公開APIをwindowに代入
// ============================================================

// biome-ignore assist/source/organizeImports: globals.js は最初に import する必要がある（window.* state 初期化）
import * as globals from './globals.js';

import * as app from './app.js';
import * as audioChannel from './audio-channel.js';
import * as audioEngine from './audio-engine.js';
import * as audioFileEngine from './audio-file-engine.js';
import * as audioMaster from './audio-master.js';
import * as audioOutput from './audio-output.js';
import * as audioSource from './audio-source.js';
import * as djControls from './dj-controls.js';
// 各モジュールから関数・クラス・定数をimport
import * as midiParser from './midi-parser.js';
import * as pianoRoll from './piano-roll.js';
import * as playlist from './playlist.js';
import * as sf2Parser from './sf2-parser.js';
import * as visualizer from './visualizer.js';
import * as waveforms from './waveforms.js';

// --- 関数・クラス・定数を window に公開 ---
// state は globals.js で window に直接初期化済みなので、ここでは関数のみ
const modules = [
  globals,
  midiParser,
  waveforms,
  sf2Parser,
  audioMaster,
  audioSource,
  audioChannel,
  audioOutput,
  audioEngine,
  audioFileEngine,
  visualizer,
  pianoRoll,
  djControls,
  playlist,
  app,
];

for (const mod of modules) {
  for (const [key, value] of Object.entries(mod)) {
    window[key] = value;
  }
}
