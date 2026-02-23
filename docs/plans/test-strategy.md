# テスト戦略ドキュメント

## 1. 概要

3種類のテストで全export関数をカバーする。各テスト種別の責務を明確に分離し、重複を最小限にする。

| テスト種別 | ツール | 対象 | 実行速度 |
|-----------|--------|------|---------|
| **ユニットテスト** | Vitest | 純粋関数・ロジック | 最速（ms単位） |
| **統合テスト** | Vitest + モック | モジュール間連携・Web Audio API依存 | 速い（数百ms） |
| **E2Eテスト** | Playwright | ユーザー操作フロー・UI表示 | 遅い（秒単位） |

### テストピラミッド

```
        /   E2E   \          ← 少数（ユーザーフロー検証）
       / 統合テスト \         ← 中程度（モジュール連携）
      / ユニットテスト \      ← 大量（純粋ロジック）
```

### 原則

- **ユニット**: 関数単体の入出力を検証。外部依存なし。境界値・異常系を重点的に
- **統合**: 複数モジュールの連携を検証。Web Audio APIやDOMはモックで
- **E2E**: ブラウザ上の実際の動作を検証。ユーザー操作の再現
- **重複回避**: 下位のテストでカバーできるものを上位で再テストしない

### 品質基準

- カバレッジ: branch カバレッジ重視
- バグ再発: 必ず回帰テストを追加
- PR必須: lint + unit（Tier 1完了後）

---

## 2. 全export関数のカバレッジマップ

**ステータス凡例:**
- ⬜ 未着手 — テスト未実装
- 🔧 実装中 — テスト作成中
- ✅ 完了 — ユニット/統合テスト実装済み
- ✅ E2Eカバー済み — 既存E2Eテストでカバー（ユニット/統合テスト対象外）

### globals.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `getChannelFx(ch)` | ユニット | ✅ 完了 | 純粋な状態初期化・取得ロジック |
| `sliderToFreq(val)` | ユニット | ✅ 完了 | 純粋な数学変換 |
| `freqToSlider(freq)` | ユニット | ✅ 完了 | 純粋な数学変換（往復誤差検証含む） |
| `getThemeColor(varName, fallback)` | E2E | ✅ E2Eカバー済み | `getComputedStyle` 依存（DOM必須） |

### midi-parser.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `MidiParser.parse()` | ユニット | ✅ 完了 | バイナリパース（純粋ロジック）。正常系・不正データ・エッジケース |
| `extractNotes(parsed)` | ユニット | ✅ 完了 | パース結果からのノート抽出。複雑度高 |
| `extractChannelPrograms(parsed)` | ユニット | ✅ 完了 | チャンネル→楽器マッピング |
| `noteName(midi)` | ユニット | ✅ 完了 | 数値→文字列変換 |
| `getInstrumentName(program)` | ユニット | ✅ 完了 | 範囲チェック込み |
| `remapNote(note)` | ユニット | ✅ 完了 | 全スケール×全キーの変換。`state._scaleConvert` 依存 |
| `detectKeyScale(notes)` | ユニット | ✅ 完了 | 統計的キー検出。代表パターン＋境界ケース |
| `midiToFreq(midi)` | ユニット | ✅ 完了 | シフト組合せ（pitch/freq/scale）、下限クランプ1Hz |

### waveforms.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `CUSTOM_WAVEFORMS` | ユニット | ✅ 完了 | 全波形の real/imag 配列長一致、定義整合性 |
| `isCustomWaveform(name)` | ユニット | ✅ 完了 | 文字列判定 |
| `getPeriodicWave(audioCtx, name)` | 統合 | ✅ 完了 | AudioContext.createPeriodicWave 呼び出し |
| `clearPeriodicWaveCache()` | ユニット | ✅ 完了 | キャッシュクリアの副作用検証 |
| `applyWaveform(osc, name, ctx)` | 統合 | ✅ 完了 | OscillatorNode操作 |

### sf2-parser.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `SF2Parser.parse()` | ユニット | ✅ 完了 | RIFFバイナリ解析。正常系・不正ヘッダー・空チャンク |
| `buildSF2PresetMap(sf2)` | ユニット | ✅ 完了 | プリセットマッピング構築 |
| `getInstrumentZones(sf2, preset)` | ユニット | ✅ 完了 | ゾーン抽出ロジック |
| `findSF2Sample(sf2, presetMap, bank, program, key, vel)` | ユニット | ✅ 完了 | キー/ベロシティ範囲マッチング。境界値重要 |
| `getSF2AudioBuffer(audioCtx, sf2, shdr)` | 統合 | ✅ 完了 | AudioBuffer生成（AudioContext依存） |
| `clearSF2BufferCache()` | ユニット | ✅ 完了 | キャッシュクリア |

### audio-master.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `makeDistortionCurve(amount)` | ユニット | ✅ 完了 | Float32Array生成（純粋関数） |
| `updateDistortionCurve(node, amount)` | 統合 | ✅ 完了 | WaveShaperNode操作 |
| `createReverbIR(audioCtx, decay, channels)` | 統合 | ✅ 完了 | AudioBuffer生成 |
| `buildMasterChain(audioCtx)` | 統合 | ✅ 完了 | ノード接続チェーン構築 |
| `applyLimiterParams(limiter)` | 統合 | ✅ 完了 | DynamicsCompressorNode パラメータ設定 |

### audio-source.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `buildMetronome(audioCtx, dest)` | 統合 | ✅ 完了 | メトロノームGainNode構築 |
| `createMetroClick(audioCtx, gain, time, accent, type)` | 統合 | ✅ 完了 | OscillatorNode生成 |

### audio-channel.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `buildChannelChain(audioCtx, ch, masterGain)` | 統合 | ✅ 完了 | チャンネルFXチェーン構築（複数ノード接続） |

### audio-output.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `buildOutputChain(audioCtx, eqOut)` | 統合 | ✅ 完了 | Analyserノード構築 |
| `drawWaveforms()` | E2E | ✅ E2Eカバー済み | Canvas描画（DOM+requestAnimationFrame） |

### audio-engine.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `applyFreqShiftToActive()` | 統合 | ⬜ 未着手 | scheduledNodes操作 |
| `playNotes(notes, bpm, seekOffset)` | 統合 | ⬜ 未着手 | 再生オーケストレーション全体 |
| `pausePlayback()` | 統合 | ⬜ 未着手 | AudioContext.suspend |
| `resumePlayback()` | 統合 | ⬜ 未着手 | AudioContext.resume |
| `stopPlayback()` | 統合 | ⬜ 未着手 | 全ノード停止・クリーンアップ |
| `playNotesFrom(notes, bpm, fromTime)` | 統合 | ⬜ 未着手 | シーク再生 |

### audio-file-engine.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `playAudioFile(buffer, seekOffset)` | 統合 | ⬜ 未着手 | AudioBufferSourceNode再生 |
| `pauseAudioFile()` | 統合 | ⬜ 未着手 | suspend |
| `resumeAudioFile()` | 統合 | ⬜ 未着手 | resume + シーク再開 |

### visualizer.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `getChannelColor(ch)` | ユニット | ✅ 完了 | インデックス→色文字列（純粋関数） |
| `detectChannels(notes)` | ユニット | ✅ 完了 | ノート配列→チャンネル番号配列（純粋関数） |
| `buildChannelUI(channels)` | E2E | ✅ E2Eカバー済み | DOM生成 |
| `toggleMute(ch)` | E2E | ✅ E2Eカバー済み | DOM操作 + state変更 |
| `toggleSolo(ch)` | E2E | ✅ E2Eカバー済み | DOM操作 + state変更 |
| `updateChannelGains()` | 統合 | ⬜ 未着手 | GainNode操作（ロジックはテスト可能） |
| `applyChannelGain(chState)` | ユニット | ✅ 完了 | waveGain × playGate 計算（GainNode設定） |

### piano-roll.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `invalidatePianoRollCache()` | ユニット | ✅ 完了 | キャッシュフラグ操作 |
| `drawPianoRoll()` | E2E | ✅ E2Eカバー済み | Canvas描画 |
| `updatePlayhead(elapsed)` | E2E | ✅ E2Eカバー済み | Canvas描画 + クリックシーク |

### dj-controls.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `getCurrentPlaybackTime()` | ユニット | ⚠️ 非export（内部関数のため直接テスト不可） | state から再生位置計算（純粋ロジック） |
| `clearLoopTimer()` | ユニット | ✅ 完了 | タイマークリア |
| `clearABLoop()` | E2E | ✅ E2Eカバー済み | DOM操作込み |
| `drawDJMarkers(ctx, W, H, pad)` | E2E | ✅ E2Eカバー済み | Canvas描画 |
| `resetDJControls()` | E2E | ✅ E2Eカバー済み | DOM操作 |

### playlist.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `addFilesToPlaylist(files)` | E2E | ✅ E2Eカバー済み | FileList操作 + DOM更新 |
| `clearPlaylist()` | E2E | ✅ E2Eカバー済み | DOM更新 |
| `selectTrack(index)` | E2E | ✅ E2Eカバー済み | FileReader + DOM更新 |
| `playNextTrack()` | E2E | ✅ E2Eカバー済み | 再生遷移フロー |
| `playPrevTrack()` | E2E | ✅ E2Eカバー済み | 再生遷移フロー |

### app.js

| 関数 | テスト種別 | ステータス | 理由 |
|------|-----------|----------|------|
| `isAudioFile(fileName)` | ユニット | ✅ 完了 | 拡張子判定（純粋関数） |
| `loadFile(file)` | E2E | ✅ E2Eカバー済み | FileReader + 分岐処理 |
| `loadFiles(fileList)` | E2E | ✅ E2Eカバー済み | プレイリスト連携 |
| `processAudioFile(buffer, name)` | E2E | ✅ E2Eカバー済み | 複合処理（state + DOM + Audio） |
| `processMidi(buffer, name)` | E2E | ✅ E2Eカバー済み | 複合処理（parse + UI構築） |
| `startSpectrumDraw()` | E2E | ✅ E2Eカバー済み | requestAnimationFrame + Canvas |
| `stopSpectrumDraw()` | E2E | ✅ E2Eカバー済み | アニメーション停止 |
| `updateScaleConvert()` | E2E | ✅ E2Eカバー済み | DOM読み取り + state更新 |
| `startLimiterMeter()` | E2E | ✅ E2Eカバー済み | requestAnimationFrame + Canvas |
| `stopLimiterMeter()` | E2E | ✅ E2Eカバー済み | アニメーション停止 |

---

## 3. テスト数の見積もり

| テスト種別 | 対象関数数 | 推定テスト数 | 備考 |
|-----------|-----------|-------------|------|
| ユニット | ~25 | 80-120 | 境界値・異常系で1関数あたり3-5ケース |
| 統合 | ~20 | 30-50 | Web Audio モック使用、正常系中心 |
| E2E | ~20 | 57（既存） | 現行テストで主要フローはカバー済み |

---

## 4. 実装順序

### Phase A: Tier 1A（最優先 — 複雑度高・影響大）
- `tests/unit/midi-parser.test.js`
- `tests/unit/sf2-parser.test.js`

### Phase B: Tier 1B（純粋関数の残り）
- `tests/unit/globals.test.js`
- `tests/unit/waveforms.test.js`
- `tests/unit/visualizer.test.js`（`getChannelColor`, `detectChannels`）
- `tests/unit/dj-controls.test.js`（`getCurrentPlaybackTime`）
- `tests/unit/app.test.js`（`isAudioFile`）

### Phase C: Tier 2（統合テスト）
- `tests/integration/audio-master.test.js`
- `tests/integration/audio-engine.test.js`
- `tests/integration/audio-channel.test.js`
- Web Audio API は `vi.fn()` + 軽量スタブで対応

### Phase D: E2E拡充（必要に応じて）
- 既存57件で主要フローはカバー済み
- バグ再発時に回帰テストとして追加

---

## 5. ディレクトリ構成

```
tests/
  unit/                    # ユニットテスト（Vitest）
    midi-parser.test.js
    sf2-parser.test.js
    globals.test.js
    waveforms.test.js
    visualizer.test.js
    dj-controls.test.js
    app.test.js
  integration/             # 統合テスト（Vitest + モック）
    audio-master.test.js
    audio-engine.test.js
    audio-channel.test.js
    audio-source.test.js
    audio-output.test.js
  e2e.spec.js              # E2Eテスト（Playwright、既存）
```

---

## 6. CI設定

```yaml
# ci.yml に追加
unit:
  name: Unit + Integration (Vitest)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm
    - run: npm ci
    - run: npm run test:unit -- --coverage
```

PR必須チェック: lint + unit（Tier 1完了後に有効化）

---

## 7. Web Audio API モック方針

Tier 2 では `vi.fn()` ベースの軽量スタブを使用：

```js
function createMockAudioContext() {
  const ctx = {
    sampleRate: 44100,
    currentTime: 0,
    state: 'running',
    destination: { connect: vi.fn() },
    createGain: vi.fn(() => ({
      gain: { value: 1, setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createOscillator: vi.fn(() => ({
      frequency: { value: 440, setValueAtTime: vi.fn() },
      type: 'sine',
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: 'lowpass',
      frequency: { value: 350 },
      Q: { value: 1 },
      gain: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createDynamicsCompressor: vi.fn(() => ({
      threshold: { value: -24 },
      knee: { value: 30 },
      ratio: { value: 12 },
      attack: { value: 0.003 },
      release: { value: 0.25 },
      connect: vi.fn(),
    })),
    createAnalyser: vi.fn(() => ({
      fftSize: 2048,
      connect: vi.fn(),
    })),
    createBuffer: vi.fn((ch, len, rate) => ({
      numberOfChannels: ch,
      length: len,
      sampleRate: rate,
      getChannelData: vi.fn(() => new Float32Array(len)),
    })),
    createConvolver: vi.fn(() => ({
      buffer: null,
      connect: vi.fn(),
    })),
    suspend: vi.fn(),
    resume: vi.fn(),
  };
  return ctx;
}
```

Adapter層の導入は Tier 2 の実装時に必要性を再評価する。現時点では `vi.fn()` で十分と判断。
