import { describe, expect, test } from "bun:test";
import { analyzeTrend } from "../../src/domain/trend-analyzer";
import type { Snapshot } from "../../src/domain/types";

const previous: Snapshot = {
  schemaVersion: 1,
  platform: "gitlab",
  cohortId: "gitlab-default-v1",
  observedAt: "2026-07-27T02:17:00.000Z",
  complete: true,
  repositories: [
    {
      platform: "gitlab",
      repositoryId: "1",
      fullName: "group/steady",
      url: "https://gitlab.com/group/steady",
      stars: 100,
      forks: 10,
      lastActivityAt: "2026-07-27T01:00:00.000Z",
      candidateSources: ["popular"],
      cohortContinuity: "continuing",
    },
    {
      platform: "gitlab",
      repositoryId: "2",
      fullName: "group/fast",
      url: "https://gitlab.com/group/fast",
      stars: 20,
      forks: 2,
      lastActivityAt: "2026-07-27T01:30:00.000Z",
      candidateSources: ["active"],
      cohortContinuity: "continuing",
    },
  ],
};

describe("TrendAnalyzer", () => {
  test("ranks adjacent complete observations by absolute star delta", () => {
    const current: Snapshot = {
      ...previous,
      observedAt: "2026-07-28T02:17:00.000Z",
      repositories: [
        { ...previous.repositories[0]!, stars: 103 },
        { ...previous.repositories[1]!, stars: 28 },
        {
          platform: "gitlab",
          repositoryId: "3",
          fullName: "group/new",
          url: "https://gitlab.com/group/new",
          stars: 50,
          forks: 1,
          lastActivityAt: "2026-07-28T01:30:00.000Z",
          candidateSources: ["active"],
          cohortContinuity: "new",
        },
      ],
    };

    expect(analyzeTrend(previous, current)).toEqual({
      schemaVersion: 1,
      platform: "gitlab",
      rankingBasis: "tracked_cohort_star_delta",
      cohortId: "gitlab-default-v1",
      cohortSize: 3,
      observedAt: "2026-07-28T02:17:00.000Z",
      baselineObservedAt: "2026-07-27T02:17:00.000Z",
      observationIntervalHours: 24,
      intervalKind: "daily",
      entries: [
        {
          rank: 1,
          repositoryId: "2",
          fullName: "group/fast",
          previousStars: 20,
          stars: 28,
          starsDelta: 8,
          starsPerDay: 8,
        },
        {
          rank: 2,
          repositoryId: "1",
          fullName: "group/steady",
          previousStars: 100,
          stars: 103,
          starsDelta: 3,
          starsPerDay: 3,
        },
      ],
    });
  });

  test("rejects intervals shorter than the daily observation window", () => {
    const current: Snapshot = {
      ...previous,
      observedAt: "2026-07-27T12:17:00.000Z",
    };

    expect(() => analyzeTrend(previous, current)).toThrow(
      "Trend analysis requires at least 20 hours between observations",
    );
  });
});
