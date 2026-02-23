// ============================================================
// ES Modules エントリポイント
// 全モジュールをimportし、公開APIをwindowに代入
// ============================================================

import * as app from './app.js';
import * as audioChannel from './audio-channel.js';
import * as audioEngine from './audio-engine.js';
import * as audioFileEngine from './audio-file-engine.js';
import * as audioMaster from './audio-master.js';
import * as audioOutput from './audio-output.js';
import * as audioSource from './audio-source.js';
import * as djControls from './dj-controls.js';
import * as globals from './globals.js';
import * as midiParser from './midi-parser.js';
import * as pianoRoll from './piano-roll.js';
import * as playlist from './playlist.js';
import * as sf2Parser from './sf2-parser.js';
import * as visualizer from './visualizer.js';
import * as waveforms from './waveforms.js';

// --- windowへの公開 ---
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
    if (typeof value === 'function' || typeof value === 'object') {
      window[key] = value;
    } else {
      window[key] = value;
    }
  }
}
