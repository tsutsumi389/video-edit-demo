# video-edit-demo

Electron + React + TypeScript で構築した MVP ビデオエディタです。
タイムライン上でクリップの配置・トリム・分割・並べ替えを行い、ffmpeg で書き出せます。

## 技術スタック

- **Electron 41** (Electron Forge + Vite)
- **React 19** (レンダラープロセス)
- **TypeScript**
- **fluent-ffmpeg** + **ffmpeg-static** (動画のプローブ・エンコード)

## セットアップ

```bash
npm install
npm start
```

## スクリプト

| コマンド | 説明 |
|---------|------|
| `npm start` | 開発サーバーを起動 |
| `npm run package` | パッケージを作成 |
| `npm run make` | 配布用インストーラーを作成 |
| `npm run lint` | ESLint を実行 |

## プロジェクト構成

```
src/
├── main/                  # メインプロセス
│   ├── main.ts            # ウィンドウ生成、プロトコル登録
│   ├── ipc-handlers.ts    # IPC ハンドラ (import / export)
│   ├── ffmpeg-service.ts  # ffprobe / タイムライン書き出し
│   └── menu.ts            # アプリケーションメニュー
├── preload/
│   └── preload.ts         # contextBridge API
└── renderer/              # レンダラープロセス (React)
    ├── App.tsx
    ├── components/
    │   ├── Toolbar.tsx     # インポート / エクスポート / 再生制御
    │   ├── Preview.tsx     # ビデオプレビュー
    │   ├── Timeline.tsx    # タイムライン + ルーラー + 再生ヘッド
    │   ├── Track.tsx       # トラック表示
    │   └── Clip.tsx        # クリップ (ドラッグ移動 / トリム)
    ├── hooks/
    │   ├── useProject.ts   # プロジェクト状態管理 (undo/redo)
    │   └── usePlayback.ts  # 再生タイマー
    ├── types/
    │   ├── project.ts      # Clip, Track, Project, ProjectAction
    │   └── global.d.ts     # Window.api 型定義
    └── utils/
        └── time.ts         # formatTime, clamp
```

## 主な機能

- **動画インポート** — ファイルダイアログから MP4 / MOV / AVI / MKV / WebM を読み込み
- **タイムライン編集** — クリップのドラッグ移動、左右ハンドルでトリム、`S` キーで分割、`Delete` で削除
- **プレビュー再生** — タイムライン上の再生ヘッドに連動したビデオプレビュー
- **Undo / Redo** — `Cmd+Z` / `Cmd+Shift+Z`（最大 50 操作）
- **エクスポート** — ffmpeg でセグメントをエンコードし concat で結合、進捗バー付き

## キーボードショートカット

| キー | 操作 |
|------|------|
| `Cmd+I` | 動画をインポート |
| `Cmd+E` | エクスポート |
| `Space` (Play ボタン) | 再生 / 一時停止 |
| `S` | 選択クリップを再生ヘッド位置で分割 |
| `Delete` / `Backspace` | 選択クリップを削除 |
| `Cmd+Z` | 元に戻す |
| `Cmd+Shift+Z` | やり直し |

## ライセンス

MIT
