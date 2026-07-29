# AGENTS.md — trending-collector

Git ホスティングの trending を収集・解析・保管するリポジトリ。エージェント向けの行動指針。

調査引き継ぎ: `trending-data-research-handoff.md`（設計フェーズ未着手。実装前に読む）

## 必読の前提

- GitHub に公式 Trending API は無い。**実ページ scrape** と **イベント再計算（代替トレンド）は別物** — 混同しない
- 対象プラットフォーム優先: GitHub / GitLab / Gitee
- 重大な設計判断は実装前に ADR を書く

## 開発リズム（必須）

| フェーズ | やること | 使うもの |
|---|---|---|
| 調査・比較 | MECE で軸を明示して評価 | skill `mece-analysis` |
| 設計判断 | 選択肢・トレードオフを ADR 化 | skill `adr` → `docs/adr/` |
| 実装 | Red → Green（1 slice） | skill `tdd` |
| モジュール設計 | 深い Module / 低い認知負荷 | skill `cognitive-design` |
| 障害・不具合 | なぜなぜ / 仮説検証 | skill `root-cause-analysis` |

詳細: [docs/workflow.md](docs/workflow.md)

## Cursor 資産の場所

- Rules: `.cursor/rules/`（常時・ドメイン制約）
- Skills: `.cursor/skills/`（ワークフロー本体）
- Hooks: `.cursor/hooks.json`（セッション文脈注入・完了時チェック）
- ADR: `docs/adr/`

## やってよいこと / やってはいけないこと

**Do**

- 公開 seam で振る舞いを検証するテストを先に書く
- 比較表には評価軸と判定基準を必ず付ける
- 「実トレンド」と「代替トレンド」をラベルで区別する
- 1 ターンの変更を小さく保ち、認知リズムを崩さない

**Don't**

- ADR なしでデータソース系統や永続化方式を確定する
- 実装詳細に結合したテスト、または tautological なテスト
- 調査結果を軸なしの箇条書きだけで終わる
- 症状のパッチだけで根本原因を飛ばす

## 検証

- `bun test` — 全テスト
- `bun run typecheck` — TypeScript 型検査
- `bun run verify:growth` — Git snapshot 容量ゲート
