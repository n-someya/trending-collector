import type { Snapshot, TrendRanking } from "./types";

const HOURS_PER_DAY = 24;
const MIN_DAILY_HOURS = 20;
const MAX_DAILY_HOURS = 36;

export function analyzeTrend(
  previous: Snapshot,
  current: Snapshot,
): TrendRanking {
  if (!previous.complete || !current.complete) {
    throw new Error("Trend analysis requires complete snapshots");
  }
  if (
    previous.platform !== current.platform ||
    previous.cohortId !== current.cohortId
  ) {
    throw new Error("Trend analysis requires compatible snapshots");
  }

  const intervalMilliseconds =
    Date.parse(current.observedAt) - Date.parse(previous.observedAt);
  const observationIntervalHours =
    intervalMilliseconds / (60 * 60 * 1_000);
  if (!Number.isFinite(observationIntervalHours) || observationIntervalHours <= 0) {
    throw new Error("Trend analysis requires increasing observation times");
  }
  if (observationIntervalHours < MIN_DAILY_HOURS) {
    throw new Error(
      "Trend analysis requires at least 20 hours between observations",
    );
  }

  const previousById = new Map(
    previous.repositories.map((repository) => [
      repository.repositoryId,
      repository,
    ]),
  );
  const ranked = current.repositories
    .flatMap((repository) => {
      const baseline = previousById.get(repository.repositoryId);
      if (!baseline) {
        return [];
      }
      const starsDelta = repository.stars - baseline.stars;
      return [
        {
          repositoryId: repository.repositoryId,
          fullName: repository.fullName,
          previousStars: baseline.stars,
          stars: repository.stars,
          starsDelta,
          starsPerDay:
            Math.round(
              (starsDelta * HOURS_PER_DAY * 1_000_000) /
                observationIntervalHours,
            ) / 1_000_000,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.starsDelta - left.starsDelta ||
        left.repositoryId.localeCompare(right.repositoryId),
    )
    .map((entry, index) => ({ rank: index + 1, ...entry }));

  return {
    schemaVersion: 1,
    platform: current.platform,
    rankingBasis: "tracked_cohort_star_delta",
    cohortId: current.cohortId,
    cohortSize: current.repositories.length,
    observedAt: current.observedAt,
    baselineObservedAt: previous.observedAt,
    observationIntervalHours,
    intervalKind:
      observationIntervalHours >= MIN_DAILY_HOURS &&
      observationIntervalHours <= MAX_DAILY_HOURS
        ? "daily"
        : "multi_day_rate",
    entries: ranked,
  };
}
