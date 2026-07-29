# ADR-0000: Record architecture decisions

**Status:** Accepted  
**Date:** 2026-07-27  
**Deciders:** project maintainers

## Context

trending 収集はデータソース系統（実 scrape vs 再計算）、保管形式、取り込みパイプラインなど、後戻りコストの高い判断が多い。口頭やチャットだけの決定は散逸しやすい。

## Decision

重要な設計判断は `docs/adr/` に ADR として残す。実装やデータソース確定の前に、少なくとも Proposed の ADR を置く。

## Options Considered

### Option A: ADR を使う

| Dimension | Assessment |
|-----------|------------|
| Traceability | High |
| Overhead | Low–Med |
| Agent friendliness | High |

**Pros:** 判断の根拠が残る。エージェントが同じ前提で再開できる。  
**Cons:** 小さな判断まで書くとノイズになる。

### Option B: チャット / README のみ

| Dimension | Assessment |
|-----------|------------|
| Traceability | Low |
| Overhead | Low |
| Agent friendliness | Low |

**Pros:** 速い。  
**Cons:** 前提が消え、後から「なぜ」が再現できない。

## Trade-off Analysis

初期オーバーヘッドより、データソース混同や保管方式の手戻りコストの方が大きい。ADR の対象は「後戻りが高い判断」に限定する。

## Consequences

- データソース系統・永続化・パイプライン境界の変更は ADR 必須
- スタイルや微細なリファクタは ADR 不要
- エージェントは skill `adr` に従う
