---
name: root-cause-analysis
description: Structured root-cause analysis with 5 Whys, hypothesis testing, and a reproducible feedback loop. Use when diagnosing bugs, incidents, data anomalies, flaky collection, or when the user mentions なぜなぜ, RCA, root cause, or unexplained failures.
---

# Root Cause Analysis

症状のパッチで止めず、再現可能な因果まで掘る。

## フェーズ（飛ばさない）

### 1. フィードバックループを作る

次を満たす **1 コマンド** を先に用意し、実際に 1 回は走らせる。

- ユーザー症状を検出できる（Red 可能）
- 決定的（または再現率が高い）
- エージェントが単独実行できる

無いなら仮説に進まない。試した手段を列挙してユーザーに環境/成果物を求める。

### 2. 再現と最小化

Red を確認し、余計な条件を 1 つずつ削って最小 repro にする。

### 3. なぜなぜ（5 Whys）+ 分岐

```text
症状
 └ why1 → …
    └ why2 → …
       └ why3 → （ここで枝があれば並列仮説）
```

各 Why は **検証可能な主張** にする。「 somehow」「気のせい」禁止。

### 4. 仮説を倒す

有力仮説を 1 つずつ、ループで肯定/否定する。複数同時に「たぶん全部」は禁止。

### 5. 修正と固定

- 根本に効く最小修正
- 同じループが Green になること
- 回帰テスト（または再現スクリプト）を残す — TDD skill に接続

## 出力テンプレート

```markdown
## 症状
## 再現コマンド（実際の出力つき）
## なぜなぜ
## 棄却した仮説
## 根本原因
## 修正と回帰防止
```

## データ収集ドメインの典型視点

- scrape 対象 HTML/API の変更か、こちらのパーサか
- レート制限・部分失敗・日付境界（スナップショット時刻）
- 「代替ソースを見て実トレンドが壊れたと誤認」していないか
