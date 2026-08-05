# ADR-0005: Remove the data/state snapshot duplicate

**Status:** Accepted  
**Date:** 2026-08-05  
**Deciders:** project maintainers

## Context

Every `collect` wrote `data/state/{platform}/candidates.ndjson` as a
byte-for-byte copy of that day's snapshot. Nothing reads it: the next run's
baseline comes from `data/snapshots/` via
`FileSnapshotRepository.loadLatestCompleteBefore`, and the pipeline and domain
layers only consume the in-memory snapshot it returns.

The duplicate still costs. It adds ~840 KB to every checkout and to the
ADR-0002 growth measurement — roughly 40–50 % of a normal day's `data/` bytes,
counted as `mutableBytes` in `verify-growth`. Git content-addressing shares
the blob with the same-day snapshot, so pack growth was minor, but the file is
a second, mutable "latest" with no date in its path: re-publishing an older
collection artifact (the real backfill flow) silently regresses it to an older
day. The owner confirmed the file is understood as "the previous day's
snapshot" and approved deletion if unnecessary.

## Decision

Stop writing `data/state/` in `FileArtifactRepository.save`, exclude
`data/state/**` from `publishBundle`'s input collection so older collection
artifacts cannot re-create it, and delete the committed files. Baselines
continue to come from `data/snapshots/` only.

## Options Considered

### Option A: Keep writing data/state

| Dimension | Assessment |
|-----------|------------|
| Correctness / fidelity | Redundant copy; can silently regress on backfill |
| Complexity | Extra writer, publish and growth special cases |
| Operability | Misleads readers into treating it as the baseline |
| Cost / continuity | ~840 KB duplicated per checkout and per growth report |

**Pros:** No change.  
**Cons:** Pays daily for a file nothing reads.

### Option B: Make data/state the real baseline input

| Dimension | Assessment |
|-----------|------------|
| Correctness / fidelity | Single mutable file loses dated, auditable history |
| Complexity | New reader plus migration of `loadLatestCompleteBefore` |
| Operability | Backfill ordering bugs become baseline bugs |
| Cost / continuity | Keeps the duplication permanently |

**Pros:** The file would finally have a purpose.  
**Cons:** Strictly worse than the dated snapshot lookback that already works.

### Option C: Remove it entirely (chosen)

| Dimension | Assessment |
|-----------|------------|
| Correctness / fidelity | Baseline unchanged; one canonical store |
| Complexity | Deletes code; one publish exclusion |
| Operability | Old collection artifacts stay re-publishable |
| Cost / continuity | Sheds the duplication from checkouts and growth gates |

**Pros:** Less code, smaller checkout, honest growth numbers.  
**Cons:** Publish must ignore `data/state/**` in historical artifacts.

## Trade-off Analysis

Correctness favors C: the dated snapshots in Git are already the canonical,
auditable baseline (ADR-0002), and A/B keep a second source of truth that
backfill can desynchronize. Cost favors C: the duplicate dominates the mutable
share of the growth report that gates storage decisions. Operability is the
only reason B exists, and `loadLatestCompleteBefore` already covers it with
dated history instead of a mutable pointer.

## Consequences

- The working tree and the ADR-0002 growth measurement shed ~840 KB of pure
  duplication; `verify-growth` now reports `mutableBytes` 0 with an unchanged
  report schema.
- `publishBundle` ignores `data/state/**` in its input, so re-publishing older
  collection artifacts that still contain state files cannot resurrect the
  directory.
- `measureGrowth` keeps its `data/state/` classification branch as an inert
  guard; it simply counts nothing.
- Collect output shrinks to snapshots, rankings, and run manifests, matching
  the documented layout.

## Action Items

1. [x] Remove the state copy from `FileArtifactRepository.save`.
2. [x] Exclude `data/state/**` in `publishBundle` and drop its mutable-path
       branch.
3. [x] `git rm -r data/state` and update the README layout.
