---
name: adr
description: Create or update Architecture Decision Records with evaluation axes. Use when choosing technologies, data sources, storage, pipeline boundaries, or when the user mentions ADR, architecture decision, or design trade-offs.
---

# Architecture Decision Records

後戻りコストの高い判断を `docs/adr/` に残す。

## いつ書くか

必須の例:

- データソース系統（実 scrape vs 再計算）
- 永続化形式・スキーマ方針
- パイプライン境界（collect / parse / load）
- 外部依存の採用・捨て

不要の例: ローカル変数名、自明なリファクタ

## 手順

1. `docs/adr/README.md` の次番号を決める
2. `docs/templates/adr.md` をコピーして `docs/adr/NNNN-title.md` を作成
3. Context にドメイン禁忌（実 vs 代替トレンド等）を書く
4. Options を **評価軸つき表** で比較（最低 2 案）
5. Decision / Consequences / Action Items を埋める
6. README の Index を更新
7. 実装に進むなら Status を `Accepted` にしてから TDD

## 評価軸の例（ドメイン）

| Dimension | 見るもの |
|---|---|
| Fidelity | 実トレンドに近いか、代替か |
| History depth | 履歴の深さ・欠損 |
| Operability | 運用・継続性・セルフホスト要否 |
| Complexity | 取得・正規化の難しさ |
| Cost | レート制限・ストレージ・人手 |

MECE な軸の切り方は skill `mece-analysis` と併用する。

## 出力

チャットでは ADR パスと Decision 要約を先に出す。本文はファイルが正本。
