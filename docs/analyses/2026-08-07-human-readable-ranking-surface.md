# MECE: 日次ランキングの人間可読サーフェス

**Date:** 2026-08-07  
**Status:** 調査完了 / 設計未決（ADR 未作成）  
**Scope:** `data/rankings/{platform}/YYYY/MM/DD.json` を人間が読める形で GitHub 上に「ついで」記録できるか

## 問い

日次の機械可読ランキング（JSON・git）を正本のまま維持しつつ、同じ結果を人間可読に GitHub Wiki または Issue へ副次記録するなら、どのサーフェスが妥当か。

## 現状（実装済み）

| 事実 | 詳細 |
|---|---|
| 正本 | `data/rankings/{gitlab\|gitee}/YYYY/MM/DD.json`（ADR-0002） |
| 指標 | `tracked_cohort_star_delta`（代替トレンド。公式 Trending UI ではない） |
| 配信 | `.github/workflows/daily-snapshot.yml` が collect → publish → commit |
| Wiki | **無効**（`has_wiki: false`） |
| Issues | **有効** |
| 規模（2026-08-05） | Gitee: 20 entries / ~3 KB JSON。GitLab: **1877 entries / ~272 KB JSON** |

人間可読 Markdown（表・Top-N）の概算サイズ:

| 対象 | Top-20 | Top-50 | 全件 |
|---|---|---|---|
| Gitee | ~1.1 KB | （全件=20） | ~1.1 KB |
| GitLab | ~1.1 KB | ~2.8 KB | **~108 KB** |

GitHub Issue / comment 本文上限は **65,536 文字**。GitLab 全件 Markdown は上限超過。**人間可読面は Top-N（例: 25）必須**。JSON 正本の全件は git に残す。

## 分解（枠: 用途 × 配信面）

用途を主枠にし、候補がちょうど 1 つに入るようにする。

| 区分 | 内容 | 本解析での扱い |
|---|---|---|
| A. 機械正本 | 再現・差分・ETL 用の確定データ | **現状維持**（ADR-0002）。候補外 |
| B. 人間可読・閲覧 | ブラウザでその日の上位を読む | Wiki / Markdown-in-repo / 日次 Issue |
| C. 人間可読・購読通知 | Watch / Subscribe で日次を受け取る | 常設 Issue + 日次 comment（vitalets 型） |
| D. 非対象 | Pages サイト、外部 newsletter、Slack 等 | 今回の問い外（必要なら別 MECE） |

MECE チェック: Wiki と「日次 Issue 新規作成」は B。常設 Issue への comment は主に C（閲覧も兼ねるが通知が主価値）。Markdown-in-repo は B のみ（通知は無い）。ダブりは「閲覧兼通知」を C に寄せ、B は通知を要求しない案に限定。

## 評価軸

| 軸 | High | Med | Low |
|---|---|---|---|
| 運用単純性 | REST API のみ・初期化不要・既存 permission で足りる | 追加 permission / 手動初期化 1 回 | 別 git remote・ドキュメント外 API・壊れやすい |
| 可読性 / UX | 日付ナビしやすい、表が読みやすい | 読めるが履歴 UI が弱い | ノイズ多・全件不可で説明不足 |
| 通知適合 | Issue subscribe / GitHub notification が自然 | リポジトリ Watch に埋もれる | 通知経路が無い／スパム化 |
| 履歴・監査 | git 正本と矛盾なく、副次面の欠落が許容される | 副次面にも弱い履歴がある | 正本と二重管理になりやすい |
| サイズ耐性 | Top-N で余裕、全件は正本に委譲が明確 | 制限ぎりぎり | 制限超過またはページ肥大で破綻しやすい |
| ADR-0002/0003 整合 | publish 後の派生ステップとして分離可能 | workflow に軽く載る | 正本パスや immutability を壊す |

重み（今回の「ついでに記録」前提）: **運用単純性 > ADR 整合 > 可読性 ≈ サイズ耐性 > 通知適合 > 履歴（副次）**。  
通知が主目的なら通知適合を最上位に上げる。

## 比較

| 候補 | 運用単純性 | 可読性 | 通知 | 履歴（副次） | サイズ耐性 | ADR 整合 |
|---|---|---|---|---|---|---|
| **W1. Wiki（日次ページ or ローリング）** | Low — Wiki 無効、初回ページ UI 必須、REST 無しで `.wiki.git` push | High — ドキュメント向き | Low | Med — wiki git 履歴 | High（Top-N）/ Med（肥大注意） | Med — publish 後の別 push |
| **I1. 常設 Issue + 日次 comment**（vitalets 型） | High — Issues API、`issues: write` | Med — comment が長くなると遡及しづらい | **High** | Med — 古い comment 掃除が必要（vitalets も clean ジョブあり） | High（Top-N 必須。全件不可） | High — 正本 commit と独立 |
| **I2. 日次 Issue を毎日新規作成** | Med — API は単純だが Issue が日次増殖 | Med — 日付タイトルは分かりやすい | Med — 購読が散る | Low — Issue 洪水 | High（Top-N） | Med — ノイズがリポジトリ UX を損なう |
| **R1. `data/rankings/...md` を git に同居** | High — 既存 contents write のみ | High — PR/browse で読める | Low | **High** — 正本と同じ git 履歴 | High | High — ADR-0002 の「text in git」に乗るが生成物増 |

### 制約メモ（実装前に固定すべき前提）

1. **系統ラベル必須:** 人間可読文面にも `rankingBasis: tracked_cohort_star_delta` と「公式 Trending ではない」を明示する（domain-trending）。
2. **正本は JSON のまま。** 人間可読は派生ビュー。欠落しても JSON から再生成できること。
3. **GitLab は Top-N のみ**を副次面に載せる（推奨 N=20〜50）。全件は `data/rankings/gitlab/...json`。
4. Wiki を選ぶ場合の初期セットアップ: Settings で Wiki 有効化 → UI で最初のページ作成 → Actions から `*.wiki.git` へ push（`contents: write` + wiki 権限）。公式 Wiki REST CRUD は無い。

## 結論

### 軸ごとの示唆

- **運用単純性:** I1（常設 Issue + comment）と R1（Markdown 同居）が勝つ。Wiki は初期化と API 欠如で最下位。
- **通知:** 「ついで」でも人が気づきやすいのは **I1 のみ**。vitalets/github-trending-repos の実証パターン。
- **可読・アーカイブ閲覧:** Wiki と R1 が勝つ。長期の「ドキュメントとしてのランキング」ならこちら。
- **サイズ:** どの副次面も Top-N。GitLab 全件 Markdown（~108 KB）は Issue 上限超え。
- **ADR 整合:** 正本を触らず publish 後に派生するのが安全。R1 は正本と同じ immutability ルールに乗せる必要がある。

### 総合推奨（前提つき）

| 目的の主軸 | 推奨 | 理由 |
|---|---|---|
| **デフォルト（ついでに人が見る・稀に通知）** | **I1: プラットフォーム別の常設 Issue に日次 comment** | API が公式、Wiki 無効のままでよい、Top-N でサイズ安全、workflow は `issues: write` 追加のみ |
| リポジトリ内で完結した閲覧ログが欲しい | **R1: 同日 `.md` を git に追加** | 追加サービス面ゼロ。ただし通知は無い |
| ドキュメント Hub として整えたい | Wiki（W1） | 可能だがセットアップコストが高く「ついで」には不向き |

**Wiki と Issue の二者択一だけなら Issue（I1）を推奨。** Wiki は可能だが「ついで」修正としては重い。

非推奨: **I2（毎日新規 Issue）** — 一覧が汚染され、購読 UX も常設 Issue より劣る。

### 次アクション

1. 目的を一文で固定する（通知重視か、リポジトリ内アーカイブ重視か）。
2. 採用案を **ADR-0006（Proposed）** に落とす（Top-N、文面テンプレ、系統ラベル、workflow permission）。
3. Accepted 後、TDD で「`TrendRanking` → Markdown 文字列」の純粋変換を Red→Greenし、publish ジョブ末尾に post ステップを足す（正本 JSON の schema は変えない）。

## 参考

- 先例（実ページ scrape の通知面）: [vitalets/github-trending-repos](https://github.com/vitalets/github-trending-repos) — 言語別常設 Issue + 日次 bot comment。本リポジトリの指標系統とは別物だが配信パターンは流用可。
- 本リポジトリ: ADR-0002（git 正本）、ADR-0003（Actions）、`FileArtifactRepository` / `publishBundle` / `daily-snapshot.yml`。
