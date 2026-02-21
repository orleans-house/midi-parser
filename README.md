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
  subgraph SRC["Source層"]
    direction LR
    Osc --> Env[Envelope]
  end

  subgraph CH["Channel層 ×16ch"]
    direction LR
    ChGain[ChGain] --> ChDist[Dist] --> ChDelay[Delay] --> ChReverb[Reverb] --> ChAna[Analyser]
  end

  subgraph MAS["Master層"]
    direction LR
    MGain[MasterGain] --> GF[GlobalFilter] --> EQ[EQ 5-band]
    EQ --> Dist[Distortion] --> Trim[FX Trim]
    EQ --> Dly[Delay] --> DlyWet[DelayWet] --> Trim
    EQ --> Conv[Convolver] --> RevWet[ReverbWet] --> Trim
  end

  subgraph OUT["Output層"]
    direction LR
    Spec[SpectrumAnalyser]
    MAna[MasterAnalyser] --> Dest[destination]
  end

  subgraph METRO["Metronome"]
    direction LR
    MOsc[MetroOsc] --> MEnv[Envelope] --> MGn[MetroGain] --> MDest[destination]
  end

  Env --> ChGain
  ChAna --> MGain
  Trim --> Spec
  Trim --> MAna
```

## Privacy / Security

- このアプリは基本的にクライアントサイドで動作します
- MIDIファイルはサーバーへアップロードしません（静的配信前提）

## License

This project is licensed under the **ISC License**.  
See [LICENSE](./LICENSE).

This project uses **Lucide Icons** (MIT License):  
https://lucide.dev/license
