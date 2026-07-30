import { planCohort } from "../domain/cohort-policy";
import { analyzeTrend } from "../domain/trend-analyzer";
import type {
  Platform,
  RepositoryObservation,
  Snapshot,
  SnapshotRepositoryObservation,
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
  // 1) Discovery: プラットフォーム DataSource から本日の popular/active 観測を取得
  //    （この時点で現行のスター数を含む）
  const discovery = await input.dataSource.discover();

  // 前回スナップショットのメンバーは継続観測の候補。まだ再観測はしていない。
  const previousRepositories =
    input.previous?.repositories.map(({ repositoryId, fullName }) => ({
      repositoryId,
      fullName,
    })) ?? [];
  const previousIds = new Set(
    previousRepositories.map((repository) => repository.repositoryId),
  );

  // 2) Cohort 計画: discovery を discovered にまとめ、carry-over 参照を選ぶ。
  //    carry-over = 前回スナップショットにはいたが、本日の discovery には無いもの。
  //    隣接日の星デルタを計算し続けるため、予算内で現行スターの再観測が必要。
  const cohort = planCohort({
    platform: input.platform,
    popular: discovery.popular,
    active: discovery.active,
    previousRepositories,
    requestBudget: input.requestBudget,
    discoveryRequests: discovery.requestsUsed,
    maxCarryOver: input.maxCarryOver,
  });

  // 3) Carry-over 観測: 継続メンバーの現行スターを detail 取得する。
  //    discovery 側は既に観測済み。carry-over は参照だけなのでここで初めて星が付く。
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

  // 4) 本日の実現 cohort: discovered ∪ carry-over を一意化し、
  //    前回集合との差で cohortContinuity（new / continuing）を付与する。
  const repositories = labelContinuity(
    mergeObservations([
      ...cohort.discovered,
      ...carryOver.repositories,
    ]),
    previousIds,
  );
  const snapshot: Snapshot = {
    schemaVersion: 1,
    platform: input.platform,
    cohortId: input.cohortId,
    observedAt: input.observedAt,
    complete,
    repositories,
  };

  // 5) ランキング: 両側が complete かつ同一 platform/cohort のときのみ。
  //    星デルタは両スナップショットに存在するリポジトリだけ。
  //    新規 discovery は基準観測ができるまで順位付けしない。
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

function labelContinuity(
  observations: RepositoryObservation[],
  previousIds: Set<string>,
): SnapshotRepositoryObservation[] {
  return observations.map((observation) => ({
    ...observation,
    cohortContinuity: previousIds.has(observation.repositoryId)
      ? "continuing"
      : "new",
  }));
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
