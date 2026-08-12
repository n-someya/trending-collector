# ADR-0006: Post daily Top-N rankings to standing GitHub Issues

**Status:** Accepted  
**Date:** 2026-08-07  
**Deciders:** project maintainers

## Context

Canonical rankings live as immutable JSON under `data/rankings/` (ADR-0002).
Those files are machine-oriented. Maintainers want a human-readable secondary
surface on GitHub without replacing the JSON source of truth.

The metric is `tracked_cohort_star_delta` — a **self-computed alternative trend**
inside a declared cohort, not either platform's official Trending UI. Any
human-readable post must keep that provenance visible.

GitLab rankings can exceed one thousand entries (~100 KB as Markdown). GitHub
issue and comment bodies are capped at 65,536 characters, so secondary surfaces
must publish a Top-N slice only.

MECE comparison: [docs/analyses/2026-08-07-human-readable-ranking-surface.md](../analyses/2026-08-07-human-readable-ranking-surface.md).

## Decision

After each successful publish of a day's ranking JSON, post a Markdown Top-N
summary as a **comment on a standing GitHub Issue per platform** (I1).

- One open, locked standing issue for `gitlab` and one for `gitee`.
- Discover issues by stable labels (not by title alone).
- Comment body includes `rankingBasis`, interval kind, observation times, and a
  Top-N table (default N = 25).
- JSON under `data/rankings/` remains the canonical full ranking.
- Skip quietly when a platform has no ranking file for that date.

## Options Considered

### Option A: Standing Issue + daily comment (I1)

| Dimension | Assessment |
|-----------|------------|
| Operability | High — Issues REST API; enable `issues: write` |
| Human UX / notifications | High — subscribe per platform |
| Size safety | High with Top-N |
| ADR-0002 alignment | High — derived view only |
| Setup cost | Low — create two labeled issues once |

**Pros:** Proven pattern (vitalets-style), no Wiki bootstrap.  
**Cons:** Long comment history needs occasional cleanup; poor as a document hub.

### Option B: GitHub Wiki pages

| Dimension | Assessment |
|-----------|------------|
| Operability | Low — no Wiki REST CRUD; push to `.wiki.git` |
| Human UX / notifications | Low — no issue subscribe |
| Size safety | High with Top-N |
| ADR-0002 alignment | Medium — separate git remote |
| Setup cost | High — Wiki disabled today; first page must be created in UI |

**Pros:** Readable archive pages.  
**Cons:** Heavy for a secondary “also record” path.

### Option C: Markdown files committed next to JSON

| Dimension | Assessment |
|-----------|------------|
| Operability | High — existing `contents: write` |
| Human UX / notifications | Low — no subscribe path |
| Size safety | High with Top-N |
| ADR-0002 alignment | High — same git history |
| Setup cost | None |

**Pros:** Zero extra GitHub surfaces.  
**Cons:** Does not meet the notification/browse-via-Issues goal chosen here.

## Trade-off Analysis

- **Operability:** A and C beat B.
- **Notifications:** A wins; B and C lose.
- **Canonical storage:** All keep JSON; A isolates posting from immutability
  rules on `data/`.
- Given the accepted product choice (human-readable *and* lightly notifiable),
  **Option A** is the winner.

## Consequences

- Workflow publish job gains `issues: write` and a post step after git commit.
- Standing issues are operational config (labels + optional issue numbers via
  env); they are not regenerated every run.
- Full GitLab rankings stay in JSON only; comments never attempt full dumps.
- Failed comment posts must not roll back already-published git artifacts;
  treat posting as best-effort after commit (fail the job for visibility).
- Comment retention/cleanup policy is deferred until history becomes noisy.

## Action Items

1. [x] Pure `TrendRanking` → Markdown Top-N formatter with provenance labels.
2. [x] GitHub Issues adapter: find standing issue by label, create comment.
3. [x] CLI command invoked from `daily-snapshot.yml` after publish/commit.
4. [x] Document standing-issue bootstrap (labels, lock, subscribe) in README.
