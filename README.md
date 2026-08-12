# trending-collector

GitLab and Gitee repositories are observed daily and ranked by star growth
within a declared, budget-limited cohort. This is not an archive of either
platform's official Trending UI.

## Metric

`tracked_cohort_star_delta` is calculated only when the same repository is
present in two compatible, complete observations.

- 20–36 hour intervals are labeled `daily`.
- Longer intervals are labeled `multi_day_rate`.
- New discoveries are not ranked until a baseline exists.
- GitLab and Gitee ranks are independent because their cohorts differ.

See [ADR-0001](docs/adr/0001-define-tracked-cohort-star-delta.md) for the
provenance decision. Gitee candidate seeding uses so.gitee.com search UI data
labeled `gitee_search_ui_seed` ([ADR-0004](docs/adr/0004-gitee-seed-via-so-gitee.md));
those ranks are never mixed into the daily metric.

## Quick start

Prerequisites: Bun 1.3.14.

```bash
bun install
bun test
bun run typecheck
```

Run a local collection without changing this repository's `data/` directory:

```bash
mkdir -p /tmp/trending-output

bun run src/cli.ts collect \
  --platform gitlab \
  --repository "$PWD" \
  --output /tmp/trending-output
```

Gitee `collect` seeds candidates from so.gitee.com, then observes them through
the authenticated detail API (same daily rhythm as GitLab discovery):

```bash
GITEE_TOKEN=... bun run src/cli.ts collect \
  --platform gitee \
  --repository "$PWD" \
  --output /tmp/trending-output
```

Do not commit tokens. GitHub Actions reads `GITLAB_TOKEN` and `GITEE_TOKEN`
from repository secrets.

## Daily artifacts

```text
data/
├── snapshots/{platform}/YYYY/MM/DD.ndjson      # one line per observation
├── snapshots/{platform}/YYYY/MM/DD.meta.json   # snapshot header
├── rankings/{platform}/YYYY/MM/DD.json
└── runs/YYYY/MM/DD/{platform}.json

config/watchlists/gitee.json   # auditable seed side effect of Gitee collect
```

`{platform}` is `gitlab` or `gitee`; under `data/runs/` it is the file name,
not a directory. Every path date is the UTC date of `observedAt`.

Every artifact carries `schemaVersion: 1`, for snapshots in the `.meta.json`
header rather than on each NDJSON record. All files are uncompressed text,
serialized deterministically so Git diffs stay meaningful
([ADR-0002](docs/adr/0002-store-daily-snapshots-in-git.md)): keys sorted,
records sorted by `repositoryId` with numeric collation, `candidateSources`
ordered popular, active, carry_over, `topics` lexicographic, no pretty-printing,
one trailing newline — except an empty cohort, which writes a 0-byte file.

Do not conflate the path date (the UTC day an observation belongs to),
`observedAt` (one instant shared by every record in that day's snapshot), and
`lastActivityAt` (repository-side activity from the platform API). Join across
days on `repositoryId`: `fullName` is renamable, and Gitee `url`s end in `.git`.

### Snapshots

| Field | Meaning |
|-------|---------|
| `platform`, `fullName` | `gitlab` or `gitee`; namespace path, often nested |
| `repositoryId` | platform-native numeric id, as a string |
| `url` | web URL; Gitee values end in `.git` |
| `stars`, `forks` | cumulative; `forks` is context, GitLab may omit it |
| `language` | Gitee only; may be `null` |
| `topics` | present when the API returns it; today GitLab only |
| `lastActivityAt` | ISO 8601 UTC |
| `candidateSources` | why the repository is in today's cohort |
| `cohortContinuity` | `continuing` or `new` |

`candidateSources`: `popular` is discovery by stars descending, and on Gitee
covers every watchlist member observed through the detail API; `active` is
GitLab discovery by last activity descending, and Gitee never emits it;
`carry_over` is a baseline member missing from today's discovery, re-observed
to keep its delta chain alive — GitLab by `repositoryId`, Gitee by `fullName`,
so a renamed Gitee repository 404s and breaks its chain. `cohortContinuity` is
`continuing` when the id was in the baseline snapshot, so a delta is computable,
or `new` on a first observation, deliberately unranked (see [Metric](#metric)).
Archived GitLab projects, 404s, and carry-over cut by budget truncation all
vanish without an error, so repositories leave the cohort silently.

`DD.meta.json` carries exactly `schemaVersion`, `platform`, `cohortId`,
`observedAt`, and `complete`. `complete` is true only when discovery and
carry-over finished with zero errors; it gates ranking eligibility, baseline
selection, and immutability, and none of the five appear in the `.ndjson`.

```json
{"candidateSources":["popular"],"cohortContinuity":"continuing","forks":3614,"fullName":"jfinal/jfinal","language":"Java","lastActivityAt":"2026-07-30T15:37:01.000Z","platform":"gitee","repositoryId":"607","stars":8938,"url":"https://gitee.com/jfinal/jfinal.git"}
{"candidateSources":["active"],"cohortContinuity":"new","forks":2,"fullName":"engmark/root","lastActivityAt":"2026-08-05T05:19:54.562Z","platform":"gitlab","repositoryId":"6651447","stars":2,"topics":["nix","nixos"],"url":"https://gitlab.com/engmark/root"}
```

```json
{"cohortId":"gitee-language-radar-v1","complete":true,"observedAt":"2026-08-05T05:24:46.000Z","platform":"gitee","schemaVersion":1}
```

### Rankings

Top level: `schemaVersion`, `platform`, `rankingBasis` (always
`tracked_cohort_star_delta`), `cohortId`, `cohortSize`, `observedAt`,
`baselineObservedAt`, `observationIntervalHours`, `intervalKind`, `entries`.
Each entry: `rank`, `repositoryId`, `fullName`, `previousStars`, `stars`,
`starsDelta`, `starsPerDay`.

- `cohortSize` is today's whole cohort: at least `entries.length`, and larger
  whenever any repository is `new`. Both committed Gitee days rank all 20.
- `entries` is pre-sorted by `starsDelta` descending, ties broken by
  `repositoryId` ascending lexicographically. `rank` is 1-based and sequential,
  so equal deltas still get distinct ranks.
- `starsDelta` can be negative. `starsPerDay` is it scaled by
  `24 / observationIntervalHours` and rounded to six decimals — equal to
  `starsDelta` at 24 hours or when the delta is 0, diverging as the interval
  departs from 24 hours. `observationIntervalHours` is unrounded, and
  `intervalKind` labels it as described under [Metric](#metric).
- The baseline is the most recent **complete** snapshot before the path date,
  found by walking back up to 30 UTC days, so it need not be yesterday, and
  `cohortContinuity` refers to it. Always read `baselineObservedAt`: both
  committed 2026-08-05 rankings baseline on 2026-08-03 as `multi_day_rate`
  because backfill landed 08-04 after the 08-05 run (fe43ea7), not by the rule.
- The file is absent when nothing was computable: a platform's first day, an
  incomplete day, no complete baseline within 30 days, or a baseline whose
  `platform`/`cohortId` differs, as after a cohort bump. Under 20 hours the run
  aborts instead, writing no snapshot. Rankings are derived and recomputable.

```json
{"baselineObservedAt":"2026-08-03T05:52:32.000Z","cohortId":"gitee-language-radar-v1","cohortSize":20,"entries":[{"fullName":"dromara/easyAi","previousStars":9147,"rank":1,"repositoryId":"8222467","stars":9154,"starsDelta":7,"starsPerDay":7.137378},…],"intervalKind":"daily","observationIntervalHours":23.538055555555555,"observedAt":"2026-08-04T05:24:49.000Z","platform":"gitee","rankingBasis":"tracked_cohort_star_delta","schemaVersion":1}
```

### Run manifests

The per-day completeness record and the first file to check for a date. Beyond
`schemaVersion`, `platform`, `cohortId`, `snapshotDate`, `observedAt`, and
`rankingBasis` it records:

| Field | Meaning |
|-------|---------|
| `status` | `complete` or `incomplete`; no other value |
| `requestBudget`, `requestsUsed` | cap and spend; Gitee counts details only |
| `discoveryRepositories` | de-duplicated `popular` ∪ `active` |
| `carryOverRequested` | carry-over re-observations planned |
| `observedRepositories` | records written to the snapshot |
| `collectorCommit` | the `GITHUB_SHA` that produced it, or `local` |
| `dataSourceParameters` | platform-shaped discovery knobs, below |
| `errors` | message strings; empty when clean |

`dataSourceParameters` is `activeLimit`/`popularLimit`/`maxCarryOver` on GitLab
and `seedSource`/`seedQueries`/`maxRepositories`/`maxCarryOver` on Gitee. Gitee
seed requests run on a separate budget (`config/seeds/gitee.json`) and never
reach `requestsUsed`, so committed Gitee days all read 20 of 55.
`carryOverRequested` is planned as `min(maxCarryOver, budget left after
discovery)`, so it exceeds the `carry_over` record count when members were
archived, 404ed, or left unattempted.

A day that finished `complete` is frozen: re-publishing different bytes for its
snapshot, ranking, or manifest fails the publish step (`Completed run is
immutable: …` and siblings). A day that ended `incomplete` may be re-run and
overwritten in place, and identical re-publication is a no-op, making the daily
job idempotent. `config/watchlists/gitee.json` is rewritten on every Gitee run.

```json
{"carryOverRequested":842,"cohortId":"gitlab-default-v1","collectorCommit":"1e34b7dfcbd3c3e20b2491d51c2b6d92c7bd8760","dataSourceParameters":{"activeLimit":1000,"maxCarryOver":1000,"popularLimit":1000},"discoveryRepositories":1963,"errors":[],"observedAt":"2026-08-05T05:24:52.000Z","observedRepositories":2707,"platform":"gitlab","rankingBasis":"tracked_cohort_star_delta","requestBudget":1500,"requestsUsed":862,"schemaVersion":1,"snapshotDate":"2026-08-05","status":"complete"}
```

### Reading guide

| Question | File |
|----------|------|
| Did a date collect cleanly? | the run manifest |
| Biggest star gains on a date? | head of the ranking `entries` |
| The whole observed cohort? | the snapshot plus its header |
| One repository's history? | `grep -rh '"repositoryId":"607"' data/snapshots` |

Parse NDJSON line by line: a GitLab day is roughly 830 KB over about 2,700
lines, so do not `JSON.parse` the whole file. A date can be missing or present
but `incomplete`; missing observations are never fabricated
([ADR-0001](docs/adr/0001-define-tracked-cohort-star-delta.md)).

Raw API responses are retained as GitHub Actions artifacts for seven days and
exclude sensitive response headers. Neither they nor the `noop-{platform}.json`
short-circuit marker are committed; publish copies only `data/**` and
`config/watchlists/**`.

## Automation

`.github/workflows/daily-snapshot.yml` runs at 02:17 UTC and supports manual
platform/date reruns. Platform collectors are isolated; the publisher copies
normalized `data/` artifacts and the Gitee watchlist, commits once, then posts
a Top-N Markdown summary to standing GitHub Issues
([ADR-0006](docs/adr/0006-post-rankings-to-standing-github-issues.md)).

Required repository setup:

1. Add `GITEE_TOKEN` as an Actions secret (detail observation).
2. Optionally add `GITLAB_TOKEN` for higher authenticated limits.
3. Permit the workflow `GITHUB_TOKEN` to write repository contents and issues.
4. Bootstrap standing issues once (labels must match exactly):

```bash
gh label create ranking-daily-gitlab --color 0E8A16 --description "Daily GitLab cohort ranking comments"
gh label create ranking-daily-gitee --color 1D76DB --description "Daily Gitee cohort ranking comments"

gh issue create --title "Daily GitLab cohort rankings" \
  --label ranking-daily-gitlab \
  --body "Standing issue for Top-N \`tracked_cohort_star_delta\` comments. This is a self-computed alternative trend, not GitLab's official Trending UI. Subscribe to receive updates."

gh issue create --title "Daily Gitee cohort rankings" \
  --label ranking-daily-gitee \
  --body "Standing issue for Top-N \`tracked_cohort_star_delta\` comments. This is a self-computed alternative trend, not an official Trending UI. Subscribe to receive updates."

# Optional: lock conversation to keep the thread bot-only
# gh issue lock <number>
```

Manual backfill of issue comments (does not rewrite git data):

```bash
GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo \
  bun run src/cli.ts post-ranking-issues --date 2026-08-05
```

The Gitee policy uses at most 55 detail requests per day because the live API
reported a 60-request limit. Cohort settings live in `config/cohorts/`. Seed
queries live in `config/seeds/gitee.json`.

## Storage gates

```bash
bun run verify:growth
```

At 500 MB, reconsider R2 or a separate data repository. Migration is required
before this Git repository reaches 1 GB. See
[ADR-0002](docs/adr/0002-store-daily-snapshots-in-git.md).
