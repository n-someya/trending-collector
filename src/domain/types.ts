export type Platform = "gitlab" | "gitee";

export type CandidateSource = "popular" | "active" | "carry_over";

export interface RepositoryReference {
  repositoryId: string;
  fullName: string;
}

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

export interface Snapshot {
  schemaVersion: 1;
  platform: Platform;
  cohortId: string;
  observedAt: string;
  complete: boolean;
  repositories: RepositoryObservation[];
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
