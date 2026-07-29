# ADR-0001: Define tracked-cohort star delta

**Status:** Accepted  
**Date:** 2026-07-29  
**Deciders:** project maintainers

## Context

GitHub Trending, GitLab Explore, and Gitee Explore do not share one ranking
definition. GitLab and Gitee expose cumulative star counts through their APIs,
but neither exposes a GitHub-compatible daily trending API. Scanning every
public repository daily is outside the monthly USD 0–50 operating budget.

Calling a partial observation "GitLab Trending" or "Gitee Trending" would
overstate its provenance. Event- or snapshot-derived rankings must remain
distinct from real-page trending.

## Decision

For GitLab and Gitee, publish a per-platform
`tracked_cohort_star_delta` ranking computed only from repositories observed on
two adjacent days in a versioned, budget-limited cohort.

The cohort combines:

1. cumulative-star leaders;
2. recently active repositories;
3. carry-over repositories needed to create an adjacent observation.

The initial Gitee request budget is 55 per day, based on the observed
60-request API limit, spent on detail observation of the daily so.gitee seed
plus carry-over (see ADR-0004). OpenAPI `/v5/search/repositories` is not used:
it returns empty results. Candidate seeding runs inside each Gitee `collect`
from so.gitee.com and is labeled `gitee_search_ui_seed`, never as Gitee
Trending.

Every ranking records its cohort ID, cohort size, observation interval, and
ranking basis. New discoveries are not ranked until a second observation
exists. Intervals from 20 through 36 hours are daily; longer intervals are
reported separately as `multi_day_rate`.

## Options Considered

### Option A: Scan all public repositories daily

| Dimension | Assessment |
|-----------|------------|
| Fidelity | High coverage, still not official trending |
| Backfillability | None after a missed observation |
| Operability | Low |
| Cost | Outside the target budget |

**Pros:** Broadest observable star-delta coverage.  
**Cons:** Excessive API, runtime, and storage cost.

### Option B: Track a declared, budget-limited cohort

| Dimension | Assessment |
|-----------|------------|
| Fidelity | Accurate within a declared cohort |
| Backfillability | None, but gaps are explicit |
| Operability | High |
| Cost | Fits USD 0–50/month |

**Pros:** Repeatable, auditable, and affordable.  
**Cons:** Can miss repositories outside the discovery policy.

### Option C: Snapshot official Explore pages only

| Dimension | Assessment |
|-----------|------------|
| Fidelity | Faithful to each platform UI |
| Comparability | Low; platform definitions differ |
| Operability | Medium; HTML is unstable |
| Cost | Low |

**Pros:** Preserves official curation.  
**Cons:** Does not answer daily star momentum and requires scraping.

## Trade-off Analysis

Option B is the only choice that preserves metric correctness and continuous
operation within budget. Coverage is intentionally traded for a transparent
sampling frame. Official UI snapshots may be added later as a separate signal,
never merged into this ranking basis.

## Consequences

- Rankings are per-platform and must not be compared as global ranks.
- Candidate policy versions are part of snapshot provenance.
- Missing daily observations cannot be fabricated or backfilled.
- Discovery bias is measured in run manifests and documentation.
- Absolute star delta is primary; relative growth remains a separate field.

## Action Items

1. [ ] Implement a deterministic cohort policy with request budgets.
2. [ ] Store cohort provenance in snapshots and rankings.
3. [ ] Reject non-adjacent observations from daily rankings.
