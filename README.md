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
graph TD
  subgraph Source
    Osc[Oscillator] --> Env[Envelope]
  end

  subgraph Ch1["Channel 1"]
    ChGain1[ChGain] --> ChDist1[Distortion] --> ChDelay1[Delay] --> ChReverb1[Reverb] --> ChAna1[ChAnalyser]
  end

  subgraph Ch2["Channel 2"]
    ChGain2[ChGain] --> ChDist2[Distortion] --> ChDelay2[Delay] --> ChReverb2[Reverb] --> ChAna2[ChAnalyser]
  end

  subgraph Ch16["Channel 16"]
    ChGain16[ChGain] --> ChDist16[Distortion] --> ChDelay16[Delay] --> ChReverb16[Reverb] --> ChAna16[ChAnalyser]
  end

  subgraph Master
    MGain[MasterGain] --> GF[GlobalFilter] --> EQ[EQ 5-band] --> Trim[FX Trim]
    Trim --> Spec[Spectrum]
    Trim --> MAna[MasterAnalyser]
  end

  subgraph User
    Wave[Wave Renderer]
    Sound[Sound Output]
  end

  Env --> ChGain1
  Env --> ChGain2
  Env --> ChGain16
  ChAna1 --> MGain
  ChAna2 --> MGain
  ChAna16 --> MGain
  MAna --> Sound
  Metronome -. metronome .-> Sound
  ChAna1 -. visual .-> Wave
  ChAna2 -. visual .-> Wave
  ChAna16 -. visual .-> Wave
  Spec -. visual .-> Wave
  MAna -. visual .-> Wave
```

> See [`docs/signal-chain.svg`](docs/signal-chain.svg) for the detailed diagram.

## Privacy / Security

- このアプリは基本的にクライアントサイドで動作します
- MIDIファイルはサーバーへアップロードしません（静的配信前提）

## License

This project is licensed under the **ISC License**.  
See [LICENSE](./LICENSE).

This project uses **Lucide Icons** (MIT License):  
https://lucide.dev/license
