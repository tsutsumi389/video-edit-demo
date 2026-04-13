# Video Edit Demo

Electron + React + TypeScript の動画編集デスクトップアプリ。

## Tech Stack

- Electron (Forge + Vite)
- React 19, TypeScript
- fluent-ffmpeg (ffmpeg-static)

## Commands

```bash
npm start              # 開発サーバー起動
npx oxlint src/        # リント (oxlint)
npx biome check src/   # フォーマット + lint (Biome)
npx biome check --write src/  # 自動修正
npx tsc --noEmit       # 型チェック
```

## Architecture

- `src/main/` - Electron メインプロセス (IPC, メニュー, ffmpeg)
- `src/preload/` - プリロードスクリプト (contextBridge)
- `src/renderer/` - React UI (コンポーネント, hooks, types)

## Rules

- コミット前に `oxlint` + `biome check` + `tsc --noEmit` を通すこと
- `console.log` を本番コードに残さない
- リンター/フォーマッター設定ファイル (biome.json, lefthook.yml) を変更しない
