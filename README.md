# MIDI Parser

ブラウザで動く軽量な MIDI ビジュアライザー / プレイヤーです。  
MIDIファイルを読み込み、再生しながら波形とピアノロールを確認できます。

## Demo

https://orleans-house.github.io/midi-parser/

## Features

- MIDIファイルの読み込み（`.mid`, `.midi`）
- Web Audio API 再生
- 再生 / 一時停止 / 停止
- 波形切り替え（Triangle / Sine / Square / Saw）
- 波形ミキサー（Master + 波形別音量）
- チャンネル可視化（Mute / Solo）
- ピアノロール表示（クリックシーク）

## Usage

1. 「ファイルを開く」でMIDIを選択
2. 「再生」で再生開始
3. 必要に応じて波形・音量を調整

## Audio Signal Chain

```mermaid
graph LR
  subgraph SRC["🎵 Source"]
    direction TB
    Osc[Oscillator]
    Env[Envelope]
    Metro[Metronome]
    Osc --> Env
  end

  subgraph CH["🔀 Channel ×16"]
    direction TB
    ChGain[ChGain]
    ChDist[Distortion]
    ChDelay[Delay]
    ChReverb[Reverb]
    ChGain --> ChDist --> ChDelay --> ChReverb
  end

  subgraph MAS["🎛️ Master"]
    direction TB
    MGain[MasterGain]
    GF[GlobalFilter]
    EQ[EQ 5-band]
    Dist[Distortion]
    Dly[Delay]
    Conv[Reverb]
    Trim[FX Trim]
    MGain --> GF --> EQ
    EQ --> Dist --> Trim
    EQ --> Dly --> Trim
    EQ --> Conv --> Trim
  end

  subgraph OUT["🔊 Output"]
    direction TB
    Spec[Spectrum]
    MAna[MasterAnalyser]
    Dest[destination]
    MAna --> Dest
  end

  SRC ==> CH ==> MAS ==> OUT
  Metro --> Dest
```

## Privacy / Security

- このアプリは基本的にクライアントサイドで動作します
- MIDIファイルはサーバーへアップロードしません（静的配信前提）

## License

This project is licensed under the **ISC License**.  
See [LICENSE](./LICENSE).

This project uses **Lucide Icons** (MIT License):  
https://lucide.dev/license
