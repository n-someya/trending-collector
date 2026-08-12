# Architecture Decision Records

設計上の重要な判断を記録する。テンプレートは [docs/templates/adr.md](../templates/adr.md)。作成手順は skill `adr`。

## 命名

`NNNN-short-kebab-title.md`（4 桁連番）

例: `0001-prefer-real-scrape-over-event-recompute.md`

## Status

`Proposed` → `Accepted` → `Deprecated` / `Superseded by ADR-NNNN`

## Index

| ADR | Title | Status |
|---|---|---|
| [0000](0000-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0001](0001-define-tracked-cohort-star-delta.md) | Define tracked-cohort star delta | Accepted |
| [0002](0002-store-daily-snapshots-in-git.md) | Store normalized daily snapshots in Git | Accepted |
| [0003](0003-run-collectors-on-github-actions.md) | Run collectors on GitHub Actions | Accepted |
| [0004](0004-gitee-seed-via-so-gitee.md) | Seed Gitee watchlists via so.gitee.com | Accepted |
| [0005](0005-remove-data-state-duplicate.md) | Remove the data/state snapshot duplicate | Accepted |
| [0006](0006-post-rankings-to-standing-github-issues.md) | Post daily Top-N rankings to standing Issues | Accepted |
