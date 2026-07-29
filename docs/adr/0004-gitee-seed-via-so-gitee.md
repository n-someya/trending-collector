# ADR-0004: Seed Gitee watchlists via so.gitee.com

**Status:** Accepted  
**Date:** 2026-07-29  
**Deciders:** project maintainers

## Context

`GET /v5/search/repositories` returns HTTP 200 with an empty array for both
anonymous and authenticated callers, so it cannot populate a Gitee cohort.
Daily detail reads (`GET /v5/repos/{owner}/{repo}`) still work with a PAT.

Gitee's official search UI at `https://so.gitee.com/` loads results through an
undocumented widget API (`https://so.gitee.com/v1/search/widget/{widget}`).
That surface is a **search / discovery** source, not GitHub-style trending and
not an event-recomputed alternative trend. Mixing its ranks into
`tracked_cohort_star_delta` would blur provenance.

GitLab discovery already runs inside each daily `collect`. Gitee should follow
the same rhythm so newly popular repositories are not delayed by a weekly seed
job.

## Decision

1. Abandon OpenAPI repository search for discovery.
2. On every Gitee `collect`, `GiteeDataSource.discover()` seeds candidates from
   so.gitee.com's widget search API, then observes those repositories through
   authenticated v5 detail reads (plus carry-over), matching GitLab's
   discover-then-observe collect shape.
3. Persist the resulting watchlist to `config/watchlists/gitee.json` as an
   auditable side effect of collect/publish. Ranking basis remains
   `tracked_cohort_star_delta`.
4. Label seed provenance as `gitee_search_ui_seed`. Do not publish so.gitee
   hit ranks as trending.

## Options Considered

### Option A: Keep `/v5/search/repositories`

| Dimension | Assessment |
|-----------|------------|
| Correctness / fidelity | Broken empty contract |
| Complexity | Low |
| Operability | Unusable |
| Cost / continuity | Wastes daily quota |

**Pros:** Documented OpenAPI.  
**Cons:** Returns no repositories.

### Option B: HTML-scrape so.gitee.com

| Dimension | Assessment |
|-----------|------------|
| Correctness / fidelity | Official search UI |
| Complexity | Medium; DOM churn |
| Operability | Brittle |
| Cost / continuity | Saves v5 search quota |

**Pros:** Matches what users see.  
**Cons:** SPA shell has no repo payload; dual path with the XHR API.

### Option C: Call so.gitee `/v1` widget search inside daily collect (chosen)

| Dimension | Assessment |
|-----------|------------|
| Correctness / fidelity | Official search backend; not trending |
| Complexity | Medium; undocumented |
| Operability | Fixture-contract + fail-closed |
| Cost / continuity | Daily seed + detail; budgeted queries |

**Pros:** Same cadence as GitLab discovery; catches new risers within a day.  
**Cons:** Undocumented contract may change; daily so.gitee traffic.

### Option D: Manual or weekly-only watchlist

| Dimension | Assessment |
|-----------|------------|
| Correctness / fidelity | High for listed repos |
| Complexity | Low |
| Operability | High |
| Cost / continuity | Misses new risers for days |

**Pros:** Minimal search traffic.  
**Cons:** Breaks parity with GitLab daily discovery.

## Trade-off Analysis

Operability and metric fidelity outweigh documentation purity: Option A cannot
run. Option C beats Option B by avoiding HTML parsing while staying on the same
backend the UI uses. Daily-in-collect beats weekly-only so new repositories are
visible on the next collect, aligned with GitLab. Search ranks stay out of the
daily ranking basis so provenance stays clear.

## Consequences

- Daily Gitee collect seeds via so.gitee, then spends the v5 budget on detail
  observation and carry-over.
- Empty so.gitee hits fail the collect closed.
- Widget id and response shape are pinned by contract fixtures.
- so.gitee traffic is daily but capped by `config/seeds/gitee.json` budgets.
- A separate weekly seed workflow is not used.
- ADR-0001's Gitee "authenticated search queries" assumption is superseded for
  discovery; the metric definition is unchanged.

## Action Items

1. [x] Record this decision and update ADR-0001's Gitee discovery notes.
2. [x] Implement so.gitee seeding inside `GiteeDataSource.discover` + watchlist writer.
3. [x] Remove `/search/repositories` from `GiteeDataSource`; observe seeded refs.
4. [x] Run seed inside daily Gitee collect; drop the separate seed workflow.
