# ADR-0002: Store normalized daily snapshots in Git

**Status:** Accepted  
**Date:** 2026-07-29  
**Deciders:** project maintainers

## Context

The first implementation needs an auditable daily history without adding a
paid storage service. This repository already contains the collector code and
is expected to contain the GitLab and Gitee snapshots.

Raw API payloads are useful for short-term diagnosis but are large and may
contain unstable provider-specific fields. GitHub recommends keeping
repositories ideally below 1 GB.

## Decision

Use this Git repository as the initial canonical store for deterministic,
normalized NDJSON snapshots, derived rankings, and run manifests.

- Sort records by stable repository ID and serialize keys deterministically.
- Keep raw API responses only as short-lived GitHub Actions artifacts.
- Track repository growth in CI.
- Reconsider R2 or a separate data repository at 500 MB; migration is required
  before the Git repository reaches 1 GB.

## Options Considered

### Option A: Store normalized snapshots in this repository

| Dimension | Assessment |
|-----------|------------|
| Auditability | High |
| Replayability | High for derivation |
| Operational complexity | Low |
| Growth ceiling | Limited |
| Initial cost | USD 0 |

**Pros:** Atomic history, simple local development, no new service.  
**Cons:** Generated history increases clone and Git maintenance cost.

### Option B: Store artifacts in Cloudflare R2

| Dimension | Assessment |
|-----------|------------|
| Auditability | High with manifests |
| Replayability | High, including raw payloads |
| Operational complexity | Medium |
| Growth ceiling | High |
| Initial cost | Low but non-zero after free allowance |

**Pros:** Better long-term artifact storage and lifecycle controls.  
**Cons:** Adds credentials, deployment, and an external source of truth.

### Option C: Store snapshots directly in a query database

| Dimension | Assessment |
|-----------|------------|
| Auditability | Medium |
| Replayability | Low without a raw layer |
| Operational complexity | Medium |
| Queryability | High |
| Initial cost | Variable |

**Pros:** Immediate analytics.  
**Cons:** Couples capture to a mutable serving store.

## Trade-off Analysis

Option A minimizes initial operating and cognitive cost while preserving the
immutable seam needed by downstream analysis. Its finite size is acceptable
only with explicit growth gates and a compact normalized schema.

## Consequences

- Snapshot files are an interface and require schema versioning.
- Raw provider responses are not permanent after artifact retention expires.
- Generated files must remain text and uncompressed so Git pack deltas work.
- The storage decision must be revisited when the 500 MB warning gate fires.

## Action Items

1. [ ] Implement deterministic NDJSON serialization.
2. [ ] Add byte-growth and projected annual-growth checks.
3. [ ] Document an R2 migration path before reaching the warning gate.
