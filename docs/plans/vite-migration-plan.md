# Vite導入 & テスト戦略 設計ドキュメント

## 概要

midi-parserプロジェクトにViteバンドラーを導入し、ES Modules化とテスト基盤の整備を行う。

---

## 1. 現状の課題

### コード構成
- 全関数がグローバルスコープに定義（`<script>` タグで順序依存の読み込み）
- ファイル間の依存関係が暗黙的
- `export` / `import` なし

### テスト
- E2Eテスト（Playwright）のみ 57件
- ユニットテストなし
- ロジック検証は `page.evaluate()` 経由で間接的

### デプロイ
- GitHub Pages が静的ファイルをそのまま配信
- ビルドステップなし

---

## 2. Vite導入計画

### 2.1 技術選定
- **バンドラー**: Vite（開発サーバー内蔵、設定最小、Vitestとの相性◎）
- **テストフレームワーク**: Vitest（ユニット/インテグレーション）+ Playwright（E2E）
- **デプロイ**: GitHub Actions で `vite build` → GitHub Pages

### 2.2 移行ステップ

#### Phase 1: Vite初期化（既存動作を壊さない）
0. **移行ガード**: 現行E2Eテスト全パスを確認・固定（以降の各ステップ完了時にも再確認）
1. `npm init` → `package.json` 作成
2. `npm install -D vite vitest` 
3. `vite.config.js` 作成（最小構成）
4. `index.html` のスクリプトタグを `<script type="module">` に変更
5. `python -m http.server` → `vite dev` に移行
6. 動作確認（既存E2Eテスト全パス）

#### Phase 2: ES Modules化（段階的リファクタ）
- ファイルごとに `export` / `import` に書き換え
- 依存関係の明示化
- グローバル変数 → モジュールスコープ変数へ移行
- 優先順位：
  1. `midi-parser.js`（純粋ロジック、依存なし）
  2. `waveforms.js`（純粋データ定義）
  3. `sf2-parser.js`（純粋ロジック）
  4. `audio-master.js` / `audio-source.js` / `audio-channel.js` / `audio-output.js`
  5. `audio-engine.js`（統合レイヤー）
  6. `audio-file-engine.js`
  7. `playlist.js` / `dj-controls.js` / `visualizer.js` / `piano-roll.js`
  8. `app.js`（エントリポイント、最後に移行）

#### Phase 3: GitHub Actions デプロイ
1. `.github/workflows/deploy.yml` 作成
2. `vite build` → `dist/` 出力
3. GitHub Pages のソースを `gh-pages` ブランチまたは Actions artifact に変更

---

## 3. テスト戦略

### 3.1 テストピラミッド

```
        /  E2E  \          ← 少数（ユーザー操作フロー）
       / 統合テスト \       ← 中程度（モジュール間連携）
      / ユニットテスト \    ← 大量（純粋関数・ロジック）
```

### 3.2 ユニットテスト（Vitest）

対象：純粋関数、副作用のないロジック

#### midi-parser.js
- `midiToFreq()`: 各種シフト組み合わせ、下限クランプ、境界値
- `remapNote()`: 全スケール×全キーの変換検証
- `detectKeyScale()`: 既知のスケールパターンに対する検出精度
- `SCALES` 定義: 各スケールの音数・範囲の妥当性

#### sf2-parser.js
- `SF2Parser`: RIFFヘッダー解析、各チャンク解析
- `buildSF2PresetMap()`: プリセットマッピングの正確性
- `findSF2Sample()`: キーレンジ/ベロシティレンジのマッチング
- バイナリ解析のエッジケース（不正データ、空チャンクなど）

#### waveforms.js
- `CUSTOM_WAVEFORMS`: 全波形の `real` / `imag` 配列長一致
- `isCustomWaveform()`: 標準/カスタムの判定

#### audio-master.js
- `createReverbIR()`: IRバッファの生成（長さ、サンプルレート）
- `_switchFilterChain()`: モード切替後のノード接続状態

### 3.3 インテグレーションテスト（Vitest + jsdom or happy-dom）

対象：複数モジュールの連携、Web Audio APIのモック使用

- **シグナルチェーン構築**: `buildMasterChain()` の接続順序
- **フィルターモード切替**: `_switchFilterChain` 呼び出し後のノード状態
- **音源モード切替**: SF2 ↔ オシレーター ↔ カスタム波形
- **スケール変換 + ピッチシフト + 周波数シフトの組み合わせ**
- **プレイリスト + 自動再生の遷移**

### 3.4 E2Eテスト（Playwright、既存を維持・拡充）

対象：ユーザー操作フロー、UI状態の整合性

- 既存57件を維持
- 追加候補：
  - SF2ファイル読み込み → 再生フロー
  - プレイリスト操作フロー（ファイル追加→曲切替→自動再生）
  - フルリグレッション（MIDI読み込み→全機能操作→停止）

### 3.5 テスト実行環境

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:all": "vitest run && playwright test"
  }
}
```

---

## 4. ディレクトリ構成（移行後）

```
midi-parser/
├── index.html              ← エントリHTML（<script type="module">）
├── vite.config.js
├── package.json
├── js/
│   ├── app.js              ← エントリポイント（import で各モジュール読み込み）
│   ├── midi-parser.js      ← export { MidiParser, midiToFreq, remapNote, ... }
│   ├── sf2-parser.js       ← export { SF2Parser, buildSF2PresetMap, ... }
│   ├── waveforms.js        ← export { CUSTOM_WAVEFORMS, applyWaveform, ... }
│   ├── audio-master.js     ← export { buildMasterChain, ... }
│   ├── audio-engine.js     ← export { playNotes, stopPlayback, ... }
│   └── ...
├── tests/
│   ├── unit/
│   │   ├── midi-parser.test.js
│   │   ├── sf2-parser.test.js
│   │   ├── waveforms.test.js
│   │   └── scale-convert.test.js
│   ├── integration/
│   │   ├── signal-chain.test.js
│   │   ├── sound-mode.test.js
│   │   └── shift-combo.test.js
│   └── e2e/
│       └── e2e.spec.js     ← 既存Playwright テスト
├── docs/
│   └── audio-architecture.md
└── style.css
```

---

## 5. リスクと対策

| リスク | 対策 |
|--------|------|
| 移行中に既存機能が壊れる | Phase 1 で既存E2Eテスト全パスを確認してから次へ |
| ES Modules化で依存解決が複雑 | ファイル単位で段階的に移行、1ファイルずつPR |
| GitHub Pages デプロイが壊れる | Actions設定前にローカル `vite build` で確認 |
| 開発サーバー変更で混乱 | READMEに開発手順を明記 |

---

## 6. スケジュール感

- Phase 1（Vite初期化）: 1 PR
- Phase 2（ES Modules化）: 複数PR（ファイル単位で段階的）
- Phase 3（GitHub Actions）: 1 PR
- ユニットテスト: Phase 2 と並行で各モジュールごとに追加

---

## 議論ポイント（レビュー結論）

### 1. Web Audio API のモック方針
**結論:** 完全モックではなく「薄いAdapter層 + 部分モック」方式を採用。
- `audio-adapter.ts` のような境界モジュールを作り、テストではその境界をstub
- 純ロジック（ピッチ計算・スケール変換・ルーティング判定）はNode環境でユニットテスト
- 実ノード挙動（音そのもの）はPlaywright E2Eで保証

### 2. グローバル状態の扱い
**結論:** `state/audioState.ts` に集約し、getter/setter経由に移行。
- `window._pitchShift` / `_freqShift` / `_scaleConvert` 等の直書きをやめる
- UIは state 更新、engineは state 参照の一方向フローに寄せる
- 既存互換のため当面は `window` ブリッジを残して段階移行

### 3. CI構成
**結論:** 3ジョブ分離。
1. `lint` (Biome)
2. `unit` (Vitest + coverage)
3. `e2e` (Playwright)
- PR必須チェック: `lint + unit`
- `e2e` は並列実行、必要に応じてmain向けを厳格化
- Vite導入後に `build` ジョブも必須化

### 4. デプロイ（GitHub Pages）設計
**結論:** `vite build → dist → Pages deploy` で正しい。
- `base` 設定（リポジトリ名配下）を最初に固定
- 既存静的配信からの切替ポイントを明記
- 失敗時のロールバック手順（旧静的配信への復帰）をドキュメント化

---

## 追加方針（レビュー指摘）

- **移行ガード**: Vite導入開始前に現行E2Eテストを「移行ガード」として固定し、各Phase完了時に全パスを確認
- **Phase細分化**: Phase 1〜3をさらに細かいステップに分割し、各段階で「動くmain」を維持
