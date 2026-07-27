# コードホスティング トレンドデータ収集 — 調査引き継ぎ資料

作成日: 2026-07-27
ステータス: 調査フェーズ完了 / 設計フェーズ未着手（実装はまだ開始しない）

---

## 1. 最終目的（やりたいこと）

日次でトレンド上位に上がってくるリポジトリについて、

1. **日次スナップショットを取得・保存**する
2. そのスナップショットから**検索用データベースへ取り込む**データフローを構築する

対象プラットフォーム: GitHub / GitLab / Gitee（中華圏最大）

---

## 2. 最重要の前提（ここを外すと設計が崩れる）

### 2-1. GitHubに公式のTrending APIは存在しない

GitHubはトレンド情報を遡って取得するAPIを提供していない。したがって全ての選択肢は次の2系統のいずれかになる。

| 系統 | 内容 | 「実トレンド」か |
|---|---|---|
| **実ページscrape** | `github.com/trending` を実際にスクレイプして記録 | ○ 本物のトレンド履歴 |
| **イベント再計算** | GH Archiveのイベントから独自アルゴリズムで算出 | ✗ 別物（代替トレンド） |

OSS Insight等は後者。**混同しないこと。**

### 2-2. GitHub Trendingは1日8回再計算される

day/week/month単位で1日8回計算されている。一方アーカイブ側のscrapeは通常1日1回なので、保存されるのは「その瞬間のスナップショット」である点を意識する。

### 2-3. GitHub Trending相当の機能は競合にほぼ存在しない

「一定期間の新規スター増」を返す仕組みは競合プラットフォームには実質ない。多くは「累計スター順（most starred）」か「最近更新順」まで。**GitHub Trendingは事実上ユニーク。**

---

## 3. GitHub — データソース候補一覧

| Repo / URL | データ形式 | 取得可能なデータの概要 | データ源 | 履歴の深さ | API有無 |
|---|---|---|---|---|---|
| antonkomarev/github-trending-archive<br>https://github.com/antonkomarev/github-trending-archive | JSON（git・日次） | 言語別dailyトレンド、リポジトリ＋開発者、全言語対応。星数・説明は持たず（GitHub APIで補完）。週次/月次は日次から自前計算 | 実ページscrape | 長期（git履歴で全期間） | なし（raw JSON直読み / git） |
| bonfy/github-trending<br>https://github.com/bonfy/github-trending | Markdown（git・日次） | 実ページscrapeのMarkdown版。日次更新で現役（毎日commit）。~1.1k★ | 実ページscrape | 長期（git履歴） | なし（raw / git） |
| vitalets/github-trending-repos<br>https://github.com/vitalets/github-trending-repos | issueコメント | 言語別daily/weekly issueに新規トレンドをコメント投稿（GitHub通知/メール向き）。~3k★ | 実ページscrape | **短期（直近~30日のみ）** | なし（Issues API経由で読取可） |
| kaxap/arl<br>https://github.com/kaxap/arl | Markdown/ファイル | 言語別の人気リポジトリ一覧。公式トレンドより人気リスト寄り。~2.1k★ | 人気リスト（scrape） | 中（git履歴） | なし |
| jigexiansen/github-trending-archive<br>https://github.com/jigexiansen/github-trending-archive | HTML（日次レポート） | 上位10件/日、英中バイリンガル説明つき。閲覧向き | 実ページscrape | 長期（git履歴） | なし（機械処理は不向き） |
| trendsgit<br>https://trendsgit.vercel.app<br>repo: https://github.com/IOE-AI/trendsgitcode | REST / JSON | `GET /api/repos` が過去1週間を daysAgo 単位で返す。個人運営で継続性は未知数 | 実ページscrape | 短期（直近1週間中心） | あり（公開REST） |
| Trendshift<br>https://trendshift.io<br>OSS: https://github.com/liweiyi88/trendshift ＋ /trendshift-backend | Web UI ＋ バッジAPI（Go/Next.js） | ★「通算何回トレンド入りしたか」＋言語横断ランキング履歴を保持 | 実ページscrape | 長期（運用開始以降） | 限定的（badgeのみ／本格利用はセルフホスト） |
| OSS Insight<br>https://ossinsight.io<br>repo: https://github.com/pingcap/ossinsight | REST / JSON（api.ossinsight.io） | period（past_24h/week/month）＋language 指定可、認証不要・600req/h | **再計算（別物）** | 中（API側で保持） | あり（公開REST） |
| NiklasTiede/Github-Trending-API<br>https://github.com/NiklasTiede/Github-Trending-API | REST / JSON（FastAPI） | language / since / spoken_lang で絞り込み可 | 実ページscrape | なし（リアルタイムのみ） | あり（要セルフホスト／ホスト版停止） |
| maulikshetty/GiTrends<br>https://github.com/maulikshetty/GiTrends | REST / JSON（Node.js） | 実ページscrapeのリアルタイムAPI | 実ページscrape | なし（リアルタイムのみ） | あり（要セルフホスト） |
| Azka20/Projects（HF dataset）<br>https://huggingface.co/datasets/Azka20/Projects | CSV | Wayback由来、2013–2025・約42万件。repo毎の**通算トレンド日数**／Top25在籍月数を集計済み | 実ページscrape（Wayback） | 長期（2013–2025） | なし（CSVダウンロード） |
| GH Archive ＋ ClickHouse/BigQuery<br>https://www.gharchive.org | SQL（イベントログ） | 全GitHubイベントをSQLでクエリ。実トレンドページは再現不可 | 再計算 | 長期（2011〜） | あり（SQL） |

### 用途別の推奨（GitHub）

- **過去一週間のdaily** → trendsgit（API即答）／antonkomarev・bonfy（git直読み）
- **通算トレンド回数** → Azka20データセットで初期ロード＋Trendshiftで確認
- **注意** → vitaletsは人気だが履歴30日、OSS Insightは代替トレンドで別物

---

## 4. 競合コードホスティングサービス（中華圏含む）

| サービス | 運営 / 系統 | 規模・位置づけ | 公開ディスカバリ |
|---|---|---|---|
| GitLab (gitlab.com) | GitLab Inc. | 最大のGitHub競合。SaaS＋セルフホスト | あり（Explore/Trending） |
| Bitbucket | Atlassian | 企業向け中心 | なし（公開Explore廃止） |
| SourceForge | SlashdotMedia | 老舗、DL配布中心 | あり（DL基準） |
| Codeberg | 非営利(独)/Forgejo | OSS志向の無料forge、10万+プロジェクト | Exploreのみ |
| Gitea.com / 自ホストGitea・Forgejo | Gitea/Forgejo | セルフホストforgeの標準 | Exploreのみ |
| Sourcehut (sr.ht) | 個人/OSS | ミニマル、ニッチ | 実質なし |
| **Gitee（码云）** | OSChina（開源中国） | **中華圏最大**。2025/12時点で登録ユーザー1,400万超・リポジトリ4,000万超。企業版は42万社超 | あり（Explore/推荐/GVP） |
| GitCode | CSDN・重慶開源共創 | CSDN基盤。2025/10/28にAtomGitと統合 | あり（探索/热门） |
| AtomGit | 開放原子基金会（Aliyun+CSDN支援） | 財団系。GitCodeと統合 | あり（探索） |
| GitLink | CCF・国防科技大チーム/Gitea系 | 学術・国産 | Exploreのみ |
| Coding.net | Tencent | 企業DevOps中心 | なし |
| Codeup（云效） | Alibaba Cloud | 企業向け・非公開中心 | なし |

### 中華圏最大の判定 → **Gitee**

リポジトリ数・ユーザー数・活発度のいずれでもGiteeが最大。鴻蒙OS（HarmonyOS）や龍芯（Loongson）等の国内主要OSSがGiteeを主要ホストに選んでいる。

**注意:** GitCodeは母体のCSDN開発者コミュニティが大きいため「ユーザー数」を大きく打ち出すことがあるが、これはブログ/Q&A等を含む広義のコミュニティ規模。コードホスティングとしての実績ではGiteeが明確に上。かつGitCodeはAtomGitとの統合で再編途上。

### 競合のトレンドデータ取得可否

| サービス | trending相当UI | API/取得方法 | 実用度 |
|---|---|---|---|
| GitLab | あり（別定義・後述） | REST v4。trending専用paramなし | 中 |
| SourceForge | あり（週次DL基準） | trending一覧の公開APIは実質なし | 低（DL指標） |
| Codeberg / Gitea / Forgejo | **なし** | `GET /api/v1/repos/search?sort=stars&order=desc`（累計） | 中（自前snapshot代用） |
| GitLink | なし | Gitea系API | 中 |
| Gitee | あり（表示名のみ・後述） | 公開trending APIなし→scrape | 中 |
| GitCode / AtomGit | あり（探索/热门） | 公開trending APIなし→scrape | 低〜中 |
| Bitbucket / Coding / Codeup | なし | 公開ディスカバリ自体なし | 不可 |

Gitea/Forgejo系については「Explore→most starsは累計スター順で当日ランキングではない、GitHubのようなtrendingビューが欲しい」という要望に対し、「今はほとんどのリポジトリがそもそもスターをあまり持っていないので不要」との判断で未実装（Codeberg/Community#213）。

---

## 5. GitLab 深掘り

### 5-1. Trendingの定義が GitHub と全く違う ⚠️ 最重要

GitLabのTrendingは**スター増ではなく notes（コメント）数ベース**で算出されている。GitLab自身がこれを問題視しており、以下のissueが長年オープン:

- gitlab-org/gitlab#20819 / gitlab-foss#42429
- 要旨: 「トレンドプロジェクトは現在notes数で計算されている。これはかなり馬鹿げていて、notes数はプロジェクトがトレンドであることとほとんど関係がない。例えば2人だけが何千ものコメントを書いたプロジェクトが上がってくる一方、誰も聞いたことがない」
- 代替提案: `users_star_projects` を使い、数時間ごとにスター増加上位100件を算出

**帰結: GitLabのTrendingは「スナップショットを取る価値自体が疑わしい」指標。**

### 5-2. API の documented / undocumented 境界

| 項目 | 状態 |
|---|---|
| `GET /api/v4/projects` の `order_by` 有効値 | **documented**: `id, name, path, created_at, updated_at, last_activity_at`（既定 created_at）。**スター順は列挙に含まれない** |
| `sort=stars_desc` | **undocumented**。WebのExploreが使うパラメータで、`?order_by=id&sort=stars_desc` の形でAPIでも動くとフォーラムで報告あり。保証なしとして扱う |
| UIのTrendingタブ（`explore/projects/trending`） | **APIに露出していない**。REST/GraphQLから直接取得不可 |
| star順ソート追加要望 | gitlab#296021 / #531442 でオープン（projectsインデックスに `stars_count` はあるが未使用） |

### 5-3. 推奨アプローチ（provenance安全）

documentedな範囲のみで構成する:

```
GET /api/v4/projects?order_by=last_activity_at&sort=desc&visibility=public&per_page=100
（keysetページング）
→ 各 star_count を日次スナップショット → 前日差分＝自前トレンド
```

皮肉だが、**GitLabが実装したかった方式を自分で実装することになる。**

クライアント: python-gitlab（公式）／Node・TSは素のfetchでREST v4。

**制約:** gitlab.com公開プロジェクトはGitHubより母数が小さく、セルフホストGitLab群は横断取得不可。「gitlab.com公開分のトレンド」に用途が限定される。

---

## 6. Gitee 深掘り

### 6-1. 「Trending Projects」表示に注意 ⚠️

`gitee.com/explore/all` は英語UIで **"Trending Projects" と表示される**が、日次のスター増ランキングではない。推荐・カテゴリ別のキュレーション寄りリスト。GVPも編集部選定。**velocityベースの日次ランキングは存在しない。**

### 6-2. 公式 Open API v5

正確なsort対応値は `https://gitee.com/api/v5/swagger` を直接参照（robots.txtで自動取得不可のため未検証）。

| 項目 | 状態 |
|---|---|
| リポジトリ検索（search_repositories） | star数・言語・説明を含む結果を返すが、**既定の並びは関連性スコア `_score` 順**。スター順ソートではない |
| GVP / recommend の識別 | `get_repository_type` の `gvp`（Gitee Most Valuable Project）・`recommend` フラグで判定可 |
| ユーザー単位リポジトリ一覧 | `list_user_repos` が `stargazers_count` を含む完全なリポジトリオブジェクトを返す |
| trending API | **存在しない** |

**帰結:** 「累計スター上位」も検索APIのsortに頼らず、対象集合を集めて**クライアント側で `stargazers_count` ソート**するのが確実。

### 6-3. 推奨アプローチ

- 公式APIで `stargazers_count` を日次スナップショット → 差分でトレンド自前生成
- 併せて GVP/recommend フラグ ＋ Exploreページのscrape で「Giteeが公式に推す注目プロジェクト」を拾う
- 実行環境: 中国国内サービスのためランナーのアクセス性を検討（GitHub Actionsのリージョン等）

---

## 7. 既存ツール／リポジトリの成熟度

**Gitee/GitLab専用のトレンドアーカイブ・エコシステムはほぼ成熟していない。DIYが標準。**

参考になるもの:

- **barats/RepoStats** — https://github.com/barats/RepoStats
  GiteeおよびGitHubのリポジトリについて star・fork・commit・PR・issue を集計・可視化。トレンド専用ではないが、Giteeのスター収集の土台として流用可
- APIクライアント: Gitee→go-gitee系（Go）／GitLab→python-gitlab（公式）。TS/Nodeは両者ともREST直叩きで十分

---

## 8. 前提の検証結果（設計に入る前の確認）

| 当初の認識 | 検証結果 |
|---|---|
| GitHubは日次スナップショットが既存。これをソースにできる | ✅ **正しい** |
| GitLabはトレンディングはあるが構造化された日次スナップショットがない | ⚠️ **要修正**。「スナップショットがない」以前に、Trendingの定義がnotes数ベースで**指標として使えない**。GitLab自身が問題視。かつAPI非露出 |
| Giteeは日次トレンディングさえない | ✅ **実質正しい**。ただし `/explore/all` が英語UIで "Trending Projects" と表示される点に注意（中身はキュレーション） |

---

## 9. 設計上、最も効く非対称性

### 9-1. バックフィル可否

| | トレンドの定義 | 取得手段 | 過去分のバックフィル |
|---|---|---|---|
| GitHub | スター増（公式） | 既存アーカイブを取り込み | **可**（2013年まで遡及可） |
| GitLab | notes数（使えない）→ 自前star差分 | 自前スナップショット | **不可**（開始日がゼロ日目） |
| Gitee | なし → 自前star差分 | 自前スナップショット | **不可**（同） |

**GitHubだけが「取り込み型」。GitLab/Giteeは自分が唯一のデータ源になる**（＝取りこぼした日は永久に埋まらない）。

→ GitLab/Giteeはスナップショットの欠損許容度・リトライ設計を最初から作り込む必要がある。GitHubは失敗しても後から再取得可能。

### 9-2. 母集団の定義が揃わない

- GitHub: 「言語別トップ25/日」が所与
- GitLab/Gitee: 「何件を上位とするか」「star差分ゼロの山をどう扱うか」を自分で決める必要がある

→ 検索DBのスキーマは以下を持たせて差を吸収する案:
- `ranking_basis`: `official_trending` / `self_computed_star_delta`
- `rank_scope`: language, top_n

---

## 10. 未決事項 / 次に議論すべき論点

1. **自前トレンド定義の具体化**
   GitLab/Giteeでは**全公開リポジトリを毎日走査するのは非現実的**。母集団の絞り方が設計の分岐点:
   - (a) watchlist方式: 既知の上位N件を継続追跡
   - (b) 最近活動があったものだけ走査（`last_activity_at` 順）
   - (c) ハイブリッド

2. star差分の正規化（絶対増分 vs 相対増分。新規リポジトリの扱い）

3. スナップショットの保存形式（JSON/git履歴 vs 直接DB）と検索DBへのETL設計

4. GitHub側: Azka20データセットでの初期ロード有無（通算トレンド回数を持つか）

5. 実装言語・実行基盤（TypeScript前提／GitHub Actions cron想定）

6. Gitee scrapeの法務・robots確認（`gitee.com/api/v5/swagger` はrobots.txtで自動取得不可だった＝サイト全体のポリシー確認が必要）

---

## 付録: 用語の注意点

- **「トレンド」の意味が3者で異なる** — GitHub=スター増、GitLab=コメント数、Gitee=キュレーション。統合スキーマでは必ず区別する
- **「実トレンド」vs「代替トレンド」** — OSS Insight / GH Archive由来は再計算値であり、`github.com/trending` の履歴ではない
- **documented vs undocumented** — GitLabの `sort=stars_desc` は公式列挙外。依存する場合はその旨を明記して運用する
