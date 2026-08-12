import { describe, expect, test } from "bun:test";
import { formatRankingIssueComment } from "../../src/publishing/format-ranking-issue-comment";
import type { TrendRanking } from "../../src/domain/types";

function sampleRanking(
  overrides: Partial<TrendRanking> = {},
): TrendRanking {
  return {
    schemaVersion: 1,
    platform: "gitee",
    rankingBasis: "tracked_cohort_star_delta",
    cohortId: "gitee-language-radar-v1",
    cohortSize: 20,
    observedAt: "2026-08-05T05:24:46.000Z",
    baselineObservedAt: "2026-08-03T05:52:32.000Z",
    observationIntervalHours: 47.53722222222222,
    intervalKind: "multi_day_rate",
    entries: [
      {
        rank: 1,
        repositoryId: "8222467",
        fullName: "dromara/easyAi",
        previousStars: 9147,
        stars: 9159,
        starsDelta: 12,
        starsPerDay: 6.05841,
      },
      {
        rank: 2,
        repositoryId: "4196988",
        fullName: "ZhongBangKeJi/CRMEB",
        previousStars: 17678,
        stars: 17684,
        starsDelta: 6,
        starsPerDay: 3.029205,
      },
      {
        rank: 3,
        repositoryId: "3",
        fullName: "example/third",
        previousStars: 10,
        stars: 11,
        starsDelta: 1,
        starsPerDay: 0.5,
      },
    ],
    ...overrides,
  };
}

describe("formatRankingIssueComment", () => {
  test("renders provenance labels and a Top-N markdown table", () => {
    const body = formatRankingIssueComment({
      ranking: sampleRanking(),
      snapshotDate: "2026-08-05",
      topN: 2,
    });

    expect(body).toContain("<!-- ranking:gitee:2026-08-05 -->");
    expect(body).toContain("tracked_cohort_star_delta");
    expect(body).toContain("not an official Trending UI snapshot");
    expect(body).toContain(
      "| 1 | [`dromara/easyAi`](https://gitee.com/dromara/easyAi) |",
    );
    expect(body).toContain(
      "| 2 | [`ZhongBangKeJi/CRMEB`](https://gitee.com/ZhongBangKeJi/CRMEB) |",
    );
    expect(body).not.toContain("example/third");
    expect(body).toContain("multi_day_rate");
    expect(body).toContain("Showing **2** of **3** ranked repositories");
  });

  test("uses platform-specific repository URLs in the table", () => {
    const gitlab = formatRankingIssueComment({
      ranking: sampleRanking({
        platform: "gitlab",
        cohortId: "gitlab-default-v1",
        entries: [
          {
            rank: 1,
            repositoryId: "81833403",
            fullName: "kitbyte/wand-enhancer",
            previousStars: 56,
            stars: 60,
            starsDelta: 4,
            starsPerDay: 2.019388,
          },
        ],
      }),
      snapshotDate: "2026-08-05",
      topN: 1,
    });
    expect(gitlab).toContain(
      "[`kitbyte/wand-enhancer`](https://gitlab.com/kitbyte/wand-enhancer)",
    );
  });
});
