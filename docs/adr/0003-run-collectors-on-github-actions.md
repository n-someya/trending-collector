# ADR-0003: Run collectors on GitHub Actions

**Status:** Accepted  
**Date:** 2026-07-29  
**Deciders:** project maintainers

## Context

The collector uses Bun and TypeScript, runs once per day, writes to this Git
repository, and must stay within USD 0–50/month. GitHub Actions supports Bun,
scheduled and manual runs, repository-native credentials, job isolation, and
atomic publication without another deployment platform.

Cloudflare Workers do not run the Bun runtime. A Cloudflare implementation
would require runtime-portable code plus Workflows/R2/D1 for durable
orchestration and storage. Connectivity from the global Cloudflare network to
Gitee also needs validation.

## Decision

Use GitHub Actions as the initial scheduler and execution environment.

- Run GitLab and Gitee collectors in isolated matrix jobs.
- Publish validated outputs in one serialized job.
- Permit manual platform/date reruns.
- Keep the domain and adapter modules runtime-portable by avoiding `Bun.*`
  APIs outside CLI and filesystem adapters.
- Reconsider Cloudflare if Actions reliability, runtime, or Gitee connectivity
  fails the acceptance gates.

## Options Considered

### Option A: GitHub Actions with Bun

| Dimension | Assessment |
|-----------|------------|
| Bun compatibility | Native |
| Git publication | Simple |
| Retry durability | Implemented by workflow and idempotent files |
| Operational complexity | Low |
| Cost | USD 0 for public repos; free-minute target for private repos |

**Pros:** Fewest moving parts and direct repository integration.  
**Cons:** Scheduled runs can be delayed or dropped under load.

### Option B: Cloudflare Workers and Workflows

| Dimension | Assessment |
|-----------|------------|
| Bun compatibility | Package manager only; no Bun runtime |
| Git publication | Requires Git provider API |
| Retry durability | High with Workflows |
| Operational complexity | Medium |
| Cost | Low |

**Pros:** Durable steps, strong R2 storage, scalable orchestration.  
**Cons:** More services and uncertain Gitee egress behavior.

### Option C: Dedicated VM cron

| Dimension | Assessment |
|-----------|------------|
| Bun compatibility | Native |
| Git publication | Simple |
| Retry durability | Custom |
| Operational complexity | High |
| Cost | Recurring |

**Pros:** Full control over region and runtime.  
**Cons:** Patching, monitoring, and hosting exceed current needs.

## Trade-off Analysis

Option A best matches the current storage and runtime choices. Reliability is
addressed with off-hour scheduling, explicit run manifests, manual reruns, and
idempotent publication rather than introducing an orchestration service now.

## Consequences

- Scheduled time is an intent; actual `observed_at` determines the interval.
- Success for one platform is retained when the other platform fails.
- Workflow permissions are read-only except the final publisher.
- Monthly runner minutes are measured and kept below 2,000 for private repos.

## Action Items

1. [ ] Add scheduled and manual workflow triggers.
2. [ ] Isolate collection jobs and serialize publication.
3. [ ] Verify reruns and partial-platform failures.
