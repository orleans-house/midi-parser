# MIDI Parser

ブラウザベースのMIDIパーサー＆ビジュアライザー。MIDIファイルをアップロードして再生・可視化できます。

- MIDIバイナリパース
- Web Audio APIによる再生（チャンク方式スケジューリング）
- チャンネル別波形表示（Mute/Solo対応）
- ピアノロール（Canvas描画、クリックシーク）
- General MIDI楽器名表示

**デモ:** https://orleans-house.github.io/midi-parser/

## セットアップ

```bash
npm install
```

## 開発サーバー

```bash
python3 -m http.server 8080
# http://localhost:8080 でアクセス
```

## 静的解析 (Biome)

[Biome](https://biomejs.dev/) を使用。設定は `biome.json`。

```bash
# Lintチェック
npm run lint

# フォーマット（自動修正）
npm run format

# Lint + フォーマット一括修正
npm run fix
```

## E2Eテスト (Playwright)

[Playwright](https://playwright.dev/) を使用。ヘッドレスChromiumで実行。

### 初回セットアップ

Chromiumブラウザと依存ライブラリのインストールが必要です。

```bash
# Chromiumブラウザをインストール
npx playwright install chromium

# システム依存ライブラリをインストール（root権限が必要）
sudo npx playwright install-deps chromium
```

### テスト実行

```bash
npm test
# または
npm run test:e2e
```

テスト実行時、Playwrightが自動で `python3 -m http.server 3000` を起動してアプリを配信します。

### テストケース

| テスト | 内容 |
|--------|------|
| page loads with correct title | タイトルにMIDIが含まれるか |
| drop zone is visible on initial load | ドロップゾーンが初期表示されるか |
| controls are hidden before file load | ファイル読込前にコントロールが非表示か |
| MIDI file upload shows controls and instrument info | アップロード後にコントロール・楽器名が表示されるか |
| channel cards and visualizer are created after MIDI load | 17カード（master + 16ch）が生成されるか |
| playback controls work after loading MIDI | 再生/停止ボタンが正しく動作するか |

### テスト用MIDIファイル

テスト内でプログラム的にMIDIファイル（Format 0、1トラック、4ノート、120 BPM）を生成しています。外部ファイルは不要です。

### CI/CDでの実行

GitHub Actionsなどで実行する場合は、ワークフローに以下を追加してください。

```yaml
- run: npx playwright install --with-deps chromium
```

## ディレクトリ構成

```
├── index.html              # HTMLエントリポイント
├── style.css               # スタイルシート
├── js/
│   ├── globals.js          # グローバル変数・定数
│   ├── midi-parser.js      # MIDIバイナリパーサー
│   ├── audio-engine.js     # Web Audio API再生エンジン
│   ├── visualizer.js       # 波形ビジュアライザー
│   ├── piano-roll.js       # ピアノロール描画
│   └── app.js              # アプリ初期化・イベントハンドリング
├── tests/
│   └── e2e.spec.js         # E2Eテスト
├── playwright.config.js    # Playwright設定
├── biome.json              # Biome設定
└── package.json
```
