import { planCohort } from "../domain/cohort-policy";
import { analyzeTrend } from "../domain/trend-analyzer";
import type {
  Platform,
  RepositoryObservation,
  Snapshot,
  TrendRanking,
} from "../domain/types";
import type { GitRepoDataSource } from "../platforms/git-repo-data-source";

export interface RunManifest {
  schemaVersion: 1;
  platform: Platform;
  cohortId: string;
  snapshotDate: string;
  observedAt: string;
  status: "complete" | "incomplete";
  rankingBasis: "tracked_cohort_star_delta";
  requestBudget: number;
  requestsUsed: number;
  discoveryRepositories: number;
  carryOverRequested: number;
  observedRepositories: number;
  collectorCommit: string;
  dataSourceParameters: Record<string, unknown>;
  errors: string[];
}

export interface CollectionResult {
  snapshot: Snapshot;
  ranking: TrendRanking | null;
  manifest: RunManifest;
}

interface CollectPlatformInput {
  dataSource: GitRepoDataSource;
  previous: Snapshot | null;
  platform: Platform;
  cohortId: string;
  observedAt: string;
  requestBudget: number;
  maxCarryOver: number;
  collectorCommit?: string;
  dataSourceParameters?: Record<string, unknown>;
}

export async function collectPlatform(
  input: CollectPlatformInput,
): Promise<CollectionResult> {
  // 1) Discovery: ask the platform DataSource for today's popular/active
  //    observations (already include current star counts).
  const discovery = await input.dataSource.discover();

  // Previous snapshot members are candidates for continuity, not yet
  // re-observed this run.
  const previousRepositories =
    input.previous?.repositories.map(({ repositoryId, fullName }) => ({
      repositoryId,
      fullName,
    })) ?? [];

  // 2) Cohort plan: merge discovery into `discovered`, and select carry-over
  //    refs — repositories that were in the previous snapshot but are absent
  //    from today's discovery. Those still need a fresh star observation so
  //    adjacent-day deltas remain computable within the request budget.
  const cohort = planCohort({
    platform: input.platform,
    popular: discovery.popular,
    active: discovery.active,
    previousRepositories,
    requestBudget: input.requestBudget,
    discoveryRequests: discovery.requestsUsed,
    maxCarryOver: input.maxCarryOver,
  });

  // 3) Carry-over observe: detail/fetch current stars for those continuing
  //    members. Discovery already observed its set; carry-over only has refs.
  const carryOver =
    cohort.carryOverRepositories.length > 0
      ? await input.dataSource.observe(cohort.carryOverRepositories)
      : {
          repositories: [],
          requestsUsed: 0,
          complete: true,
          errors: [],
        };

  const errors = [...discovery.errors, ...carryOver.errors];
  const complete = discovery.complete && carryOver.complete;

  // 4) Today's cohort realization: discovered ∪ carry-over, deduped by id.
  const repositories = mergeObservations([
    ...cohort.discovered,
    ...carryOver.repositories,
  ]);
  const snapshot: Snapshot = {
    schemaVersion: 1,
    platform: input.platform,
    cohortId: input.cohortId,
    observedAt: input.observedAt,
    complete,
    repositories,
  };

  // 5) Ranking only when both sides are complete and same platform/cohort.
  //    Stars delta uses repositories present in both snapshots; brand-new
  //    discoveries wait until a later baseline exists.
  const compatiblePrevious =
    input.previous?.complete &&
    input.previous.platform === input.platform &&
    input.previous.cohortId === input.cohortId
      ? input.previous
      : null;
  const ranking =
    compatiblePrevious && snapshot.complete
      ? analyzeTrend(compatiblePrevious, snapshot)
      : null;

  return {
    snapshot,
    ranking,
    manifest: {
      schemaVersion: 1,
      platform: input.platform,
      cohortId: input.cohortId,
      snapshotDate: input.observedAt.slice(0, 10),
      observedAt: input.observedAt,
      status: complete ? "complete" : "incomplete",
      rankingBasis: "tracked_cohort_star_delta",
      requestBudget: input.requestBudget,
      requestsUsed: discovery.requestsUsed + carryOver.requestsUsed,
      discoveryRepositories: cohort.discovered.length,
      carryOverRequested: cohort.carryOverRepositories.length,
      observedRepositories: repositories.length,
      collectorCommit: input.collectorCommit ?? "local",
      dataSourceParameters: input.dataSourceParameters ?? {},
      errors,
    },
  };
}

function mergeObservations(
  observations: RepositoryObservation[],
): RepositoryObservation[] {
  const byId = new Map<string, RepositoryObservation>();
  for (const observation of observations) {
    const existing = byId.get(observation.repositoryId);
    if (!existing) {
      byId.set(observation.repositoryId, observation);
      continue;
    }
    byId.set(observation.repositoryId, {
      ...observation,
      candidateSources: [
        ...new Set([
          ...existing.candidateSources,
          ...observation.candidateSources,
        ]),
      ],
    });
  }
  return [...byId.values()];
}
