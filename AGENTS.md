# MIDI Parser & Visualizer

## プロジェクト概要
MIDIファイルを読み込んで音を鳴らすブラウザベースのビジュアライザー/プレイヤー。

## 技術スタック
- Vite（dev server + build）
- vanilla JS（ES Modules）
- Web Audio API（音声再生）
- Canvas（波形/ピアノロール描画）
- GitHub Pages でホスティング

## コーディング規約
- Biome でlint/format（`npx biome check .`）
- 日本語コメント可
- ES Modules（`import`/`export`）を使用

## テスト
- `npm run test:unit` — Vitest（unit + integration）
- `npm run test:e2e` — Playwright（E2E）
- テスト追加時は `tests/unit/` or `tests/integration/` に配置
- E2Eテストは `*.spec.js`、ユニット/統合テストは `*.test.js`

## Git運用
- mainブランチへの直pushは禁止（ブランチ保護）
- ブランチ作成（`lulu/<feature>`）→ PR → レビュー → マージ
- レビュワー: `saya-uv-dev-1`
- CI: PR時にlint + unit + e2e + build が実行される

## アーキテクチャ
- `js/state/audioState.js` — 集中状態管理
- `js/globals.js` — ユーティリティ（`resolveVoice`, `getChannelFx` 等）
- `js/audio-engine.js` — MIDIスケジューラ/再生
- `js/audio-file-engine.js` — WAV/MP3等ファイル再生
- `js/midi-parser.js` — MIDIパーサー
- `js/sf2-parser.js` — SF2パーサー
- `js/visualizer.js` — チャンネルUI/波形表示
- `js/app.js` — UIワイヤリング/エントリ
