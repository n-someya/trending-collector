---
name: mece-analysis
description: MECE decomposition with explicit evaluation axes for comparisons and prioritization. Use when analyzing options, comparing data sources, researching trade-offs, ranking candidates, or when the user mentions MECE, 評価軸, or structured analysis.
---

# MECE Analysis（評価軸つき）

漏れなく・ダブりなく分解し、**軸と判定基準**で比較する。感想の羅列で終わらない。

## 手順

1. **問いを 1 文に固定**する（例:「GitHub 日次実トレンドの履歴ソースを選ぶ」）
2. **分解枠**を選ぶ（どれか 1 つを主にする）
   - 系統（実 scrape / 代替再計算 / 非対応）
   - 時間（リアルタイム / 短期履歴 / 長期履歴）
   - 用途（スナップショット保存 / 通算回数 / 検索投入）
   - プラットフォーム（GitHub / GitLab / Gitee / …）
3. **MECE チェック**: 各要素がちょうど 1 枠に入るか。ダブり・漏れを明示
4. **評価軸**を 3〜6 個定義し、各軸に判定基準（何をもって High/Med/Low か）を書く
5. **比較表**を埋める。不明は不明と書き、推測ならラベルする
6. **結論**は軸ごとの勝者 → 総合（重みがあるなら重みを明示）

## 出力テンプレート

```markdown
## 問い
…

## 分解（枠: …）
| 区分 | 内容 | 備考 |
|---|---|---|

## 評価軸
| 軸 | 判定基準 |
|---|---|

## 比較
| 候補 | 軸1 | 軸2 | … |
|---|---|---|---|

## 結論
- 軸ごとの示唆
- 総合推奨と前提
- 次アクション（ADR 化 / 追加調査）
```

## 禁止

- 軸なしの「おすすめはこれ」だけ
- 実トレンドと代替トレンドを同じ行で優劣だけ付ける（系統列を分ける）
- 重みを隠した総合点だけの提示

設計確定に進むなら skill `adr` へ渡す。
