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
├── snapshots/{platform}/YYYY/MM/DD.ndjson
├── rankings/{platform}/YYYY/MM/DD.json
└── runs/YYYY/MM/DD/{platform}.json

config/watchlists/gitee.json   # auditable seed side effect of Gitee collect
```

Snapshots contain normalized observations. Run manifests record request usage,
coverage, cohort parameters, errors, and collector revision. Raw API responses
are retained as GitHub Actions artifacts for seven days and exclude sensitive
response headers.

## Automation

`.github/workflows/daily-snapshot.yml` runs at 02:17 UTC and supports manual
platform/date reruns. Platform collectors are isolated; the publisher copies
normalized `data/` artifacts and the Gitee watchlist, then commits once.

Required repository setup:

1. Add `GITEE_TOKEN` as an Actions secret (detail observation).
2. Optionally add `GITLAB_TOKEN` for higher authenticated limits.
3. Permit the workflow `GITHUB_TOKEN` to write repository contents.

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
