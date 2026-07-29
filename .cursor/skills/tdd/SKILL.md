---
name: tdd
description: Test-driven development with red-green vertical slices. Use when implementing features, fixing bugs, adding behavior, or when the user mentions TDD, red-green-refactor, or tests-first.
---

# Test-Driven Development

Red → Green の縦スライス。リファクタはループに混ぜずレビュー段階へ。

実装前に `docs/adr/` と domain rule を確認。Seam が未合意なら先に合意する。

## 良いテスト

- **振る舞い**を公開 Interface（Seam）経由で検証する
- 仕様として読める名前（「何ができるか」）
- 実装入れ替えでも壊れない

## ループ

1. **Seam を書く** — テスト対象の公開境界を 1 つ決める（未確認ならユーザーに確認）
2. **Red** — 失敗する最小テストを 1 本書く。実行して失敗を確認
3. **Green** — 通す最小実装のみ。次のテストのための先回り禁止
4. 次の振る舞いへ。繰り返す

## 禁止

- 実装詳細結合（private 直叩き、内部 mock 過多）
- Tautological（コードと同じ計算で期待値を作る）
- Horizontal slicing（テスト全部 → 実装全部）
- テスト無しで「実装完了」と宣言

## このリポジトリ向けメモ

- Collector / Parser / Store は別 Seam でテストしやすい形を優先
- 外部 HTTP / scrape は Adapter に閉じ、テストでは Fake/Fixture
- 実トレンドと代替トレンドのラベル違いをテストで固定してよい

詳細な antipattern 例が必要ならユーザーの既存 TDD skill（個人）も参照可。
