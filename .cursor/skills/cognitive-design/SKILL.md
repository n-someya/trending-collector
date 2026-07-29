---
name: cognitive-design
description: Design deep modules with low cognitive load and clear seams. Use when designing module boundaries, interfaces, package structure, test seams, or when the user mentions cognitive load, 認知負荷, deep module, or seam.
---

# Cognitive Design（認知負荷 / 深い Module）

用語を固定する。言い換えでぼかさない。

## Glossary

| Term | Meaning |
|---|---|
| **Module** | Interface と実装を持つもの（関数〜パッケージ） |
| **Interface** | 利用者が正しく使うために知るべき全て（型＋不変条件＋エラー＋性能） |
| **Seam** | Interface が載る場所。振る舞いを差し替え可能な地点 |
| **Depth** | Interface 学習量あたりの振る舞いの多さ（深い = 良い） |
| **Adapter** | Seam を満たす具体物 |

## 設計手順

1. 呼び出し側が知りたい **能力** を短く列挙
2. Interface 案を 2 つ以上出し、Depth / Locality で比較（Design it twice）
3. テストする Seam を合意（TDD の前提）
4. 変化するものが 2 通り以上あるときだけ Adapter を切る（1 実装だけなら仮説 Seam に留め可）

## 認知リズムとの接続

- 設計ターンでは実装に深入りしない
- 実装ターンでは Interface を広げない（必要ならモードを「決める」に戻す）
- 1 PR / 1 セッションで動かす概念は少なく

## このリポジトリの目安 Seam

| Module 候補 | 隠しうること |
|---|---|
| Source adapter | HTTP/scrape/認証の詳細 |
| Normalizer | プラットフォーム差分 → 共通レコード |
| Snapshot store | ファイル/DB の物理配置 |
| Loader | 検索 DB 投入の詳細 |

公開 Interface に HTML セレクタや SQL を漏らさない。

## チェック

- [ ] Interface を読んで実装を想像しすぎなくてよい（深い）
- [ ] 削除したら複雑さが呼び出し側に散らばる（存在する価値がある）
- [ ] テストが同じ Seam をまたぐ
