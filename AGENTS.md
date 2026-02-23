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

## 開発フロー

### 1. 課題の発見・議論
- 課題や機能要望が出たら、3人（User・ルル・紗夜）で議論する

### 2. Issue作成
- 議論で合意が取れたらIssueを作成する
- 紗夜にIssueのレビューを依頼し、内容・スコープ・完了条件を確認する

### 3. 開発開始
- 合意が取れたら開発開始
- `lulu/<feature>` ブランチを作成して開発

### 4. PR作成・レビュー
- PRを作成し、紗夜（`saya-uv-dev-1`）をレビュワーに追加
- 紗夜がコードレビュー → 指摘があれば修正
- 修正でファイルに変更があった場合、GitHub上でApproveが解除されるため、再度レビューを依頼する

### 5. Userレビュー
- 紗夜のApproveが通ったらUserがレビュー
- Userの確認が取れたらマージ

### 6. クリーンアップ
- mainに切り替え・pull・開発ブランチ削除
- タスク完了
