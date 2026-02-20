# MIDI Parser & TAB Generator

## プロジェクト概要
MIDIファイルを読み込んで音を鳴らし、ギターのTAB譜面を生成するブラウザアプリケーション。

## 技術スタック
- 単一HTML + vanilla JS（フレームワーク不要）
- Web Audio API（音声再生）
- Canvas or SVG（TAB譜レンダリング）
- GitHub Pages でホスティング

## コーディング規約
- 外部CDN依存は最小限に（サウンドフォントライブラリは許可）
- ES Modules使用可
- 日本語コメント可

## Git運用
- mainブランチへの直pushはpre-pushフックで禁止
- ブランチ作成 → PR → マージ のフロー
