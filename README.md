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

```
┌─ Source層 (audio-source.js / audio-engine.js) ──────────────┐
│  Osc → Envelope ─────────────────────────────────────────────┤
│  MetronomeOsc → Envelope → MetronomeGain → destination       │
└──────────────────────────────────────────────────────────────┘
                       │
┌─ Channel層 (audio-channel.js) ──────────────────────────────┐
│  ChGain(waveVol × playGate)                                  │
│    → ChDistortion(dry/wet)                                   │
│    → ChDelay(dry/wet)                                        │
│    → ChReverb(dry/wet)                                       │
│    → ChAnalyser ─────────────────────────────────────────────┤
└──────────────────────────────────────────────────────────────┘
                       │ ×16ch
┌─ Master層 (audio-master.js) ────────────────────────────────┐
│  MasterGain(master vol)                                      │
│    → GlobalFilter → EQ(5-band)                               │
│      → Distortion ──→ FX Trim                                │
│      → Delay → DelayWet ─┘                                   │
│      → Convolver → ReverbWet ─┘                              │
└──────────────────────────────────────────────────────────────┘
                       │
┌─ Output層 (audio-output.js) ────────────────────────────────┐
│  FX Trim → SpectrumAnalyser (visual display)                 │
│  FX Trim → MasterAnalyser → destination (audio out)          │
└──────────────────────────────────────────────────────────────┘
```

## Privacy / Security

- このアプリは基本的にクライアントサイドで動作します
- MIDIファイルはサーバーへアップロードしません（静的配信前提）

## License

This project is licensed under the **ISC License**.  
See [LICENSE](./LICENSE).

This project uses **Lucide Icons** (MIT License):  
https://lucide.dev/license
