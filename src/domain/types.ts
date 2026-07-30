export type Platform = "gitlab" | "gitee";

export type CandidateSource = "popular" | "active" | "carry_over";

/**
 * 同一 cohort 系列における継続性。
 * collectPlatform が前回 complete スナップショットとの集合差で付与する。
 * - new: 前回に無く今回が初観測（増分ランキングの対象外）
 * - continuing: 前回にもいた（隣接観測として増分計算可能）
 */
export type CohortContinuity = "new" | "continuing";

export interface RepositoryReference {
  repositoryId: string;
  fullName: string;
}

/** DataSource が返す観測。継続性はまだ付いていない。 */
export interface RepositoryObservation {
  platform: Platform;
  repositoryId: string;
  fullName: string;
  url: string;
  stars: number;
  forks: number;
  language?: string | null;
  topics?: string[];
  lastActivityAt: string;
  candidateSources: CandidateSource[];
}

/** スナップショットに保存する観測。継続性ラベル付き。 */
export interface SnapshotRepositoryObservation extends RepositoryObservation {
  cohortContinuity: CohortContinuity;
}

export interface Snapshot {
  schemaVersion: 1;
  platform: Platform;
  cohortId: string;
  observedAt: string;
  complete: boolean;
  repositories: SnapshotRepositoryObservation[];
}

export interface RankingEntry {
  rank: number;
  repositoryId: string;
  fullName: string;
  previousStars: number;
  stars: number;
  starsDelta: number;
  starsPerDay: number;
}

export interface TrendRanking {
  schemaVersion: 1;
  platform: Platform;
  rankingBasis: "tracked_cohort_star_delta";
  cohortId: string;
  cohortSize: number;
  observedAt: string;
  baselineObservedAt: string;
  observationIntervalHours: number;
  intervalKind: "daily" | "multi_day_rate";
  entries: RankingEntry[];
}
