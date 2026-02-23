# MIDI Parser

[![CI](https://github.com/orleans-house/midi-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/orleans-house/midi-parser/actions/workflows/ci.yml)
[![Deploy](https://github.com/orleans-house/midi-parser/actions/workflows/deploy.yml/badge.svg)](https://github.com/orleans-house/midi-parser/actions/workflows/deploy.yml)
[![Vite](https://img.shields.io/badge/build-Vite-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Biome](https://img.shields.io/badge/lint-Biome-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev/)
[![Playwright](https://img.shields.io/badge/test-Playwright-45BA4B?logo=playwright&logoColor=white)](https://playwright.dev/)

ブラウザで動く MIDI ビジュアライザー / プレイヤーです。  
MIDIファイルやオーディオファイルを読み込み、再生しながら波形とピアノロールを確認できます。

## Demo

https://orleans-house.github.io/midi-parser/

## Features

### 再生
- MIDIファイル（`.mid`, `.midi`）— Web Audio API オシレーター再生
- オーディオファイル（WAV / MP3 / OGG / FLAC / AAC / M4A / WEBM）
- プレイリスト（複数ファイル、フォルダ選択、ドラッグ&ドロップ、自動送り）
- ホットキュー（4スロット）、ABループ

### サウンド
- 波形切り替え（Triangle / Sine / Square / Sawtooth + カスタム波形10種）
- 波形ミキサー（Master + 波形別音量）
- ピッチシフト（±12半音）、周波数シフト（±100Hz）
- スケール変換（14スケール、キー自動検出）
- メトロノーム（5種類のサウンドタイプ、リアルタイム切替）

### エフェクト
- 5バンドEQ
- XYパッドフィルター（HPF/LPF、Bandpass、Notch、Peaking）
- チャンネル別FX（Distortion / Delay / Reverb）
- マスターリバーブ + コーラス
- リミッター（ブリックウォール）

### 表示
- チャンネル別波形表示（16ch）
- ピアノロール（クリックシーク）
- スペクトラムアナライザー
- チャンネルMute / Solo

## Tech Stack

- **ビルド**: [Vite](https://vite.dev/)
- **言語**: Vanilla JavaScript (ES Modules)
- **音声**: Web Audio API
- **テスト**: [Playwright](https://playwright.dev/) (E2E)
- **リンター**: [Biome](https://biomejs.dev/)
- **CI/CD**: GitHub Actions → GitHub Pages

## Development

```bash
npm install
npm run dev          # Vite開発サーバー (port 3000)
npm test             # Playwright E2Eテスト
npx biome check .    # Lint
npx vite build       # プロダクションビルド → dist/
```

## Audio Signal Chain

Source → Channel(16ch) → MasterGain → HPF → LPF → [Filter: Bandpass/Notch/Peaking/Direct] → EQ → Reverb → Chorus → Limiter → Spectrum/MasterAnalyser → destination

詳細は [Audio Architecture](docs/audio-architecture.md) を参照。

## Privacy

- 完全クライアントサイド動作。ファイルはサーバーへアップロードされません。

## License

This project is licensed under the **ISC License**. See [LICENSE](./LICENSE).

This project uses **Lucide Icons** (MIT License): https://lucide.dev/license
