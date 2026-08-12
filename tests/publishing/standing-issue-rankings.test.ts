import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrendRanking } from "../../src/domain/types";
import {
  type GitHubIssuesClient,
  postStandingIssueRankings,
  standingIssueLabel,
} from "../../src/publishing/standing-issue-rankings";

function ranking(platform: "gitlab" | "gitee"): TrendRanking {
  return {
    schemaVersion: 1,
    platform,
    rankingBasis: "tracked_cohort_star_delta",
    cohortId: `${platform}-cohort`,
    cohortSize: 1,
    observedAt: "2026-08-05T05:24:46.000Z",
    baselineObservedAt: "2026-08-04T05:24:46.000Z",
    observationIntervalHours: 24,
    intervalKind: "daily",
    entries: [
      {
        rank: 1,
        repositoryId: "1",
        fullName: "org/repo",
        previousStars: 1,
        stars: 2,
        starsDelta: 1,
        starsPerDay: 1,
      },
    ],
  };
}

class FakeIssuesClient implements GitHubIssuesClient {
  readonly comments: Array<{ issueNumber: number; body: string }> = [];
  readonly listedLabels: string[] = [];
  issuesByLabel = new Map<string, { number: number } | null>();
  existingMarkers = new Map<number, string[]>();

  async findOpenIssueByLabel(
    label: string,
  ): Promise<{ number: number } | null> {
    this.listedLabels.push(label);
    return this.issuesByLabel.get(label) ?? null;
  }

  async listCommentMarkers(issueNumber: number): Promise<string[]> {
    return this.existingMarkers.get(issueNumber) ?? [];
  }

  async createComment(issueNumber: number, body: string): Promise<void> {
    this.comments.push({ issueNumber, body });
  }
}

describe("postStandingIssueRankings", () => {
  test("posts Top-N comments to labeled standing issues and skips missing days", async () => {
    const root = await mkdtemp(join(tmpdir(), "trending-issues-"));
    await mkdir(join(root, "data/rankings/gitee/2026/08"), { recursive: true });
    await writeFile(
      join(root, "data/rankings/gitee/2026/08/05.json"),
      `${JSON.stringify(ranking("gitee"))}\n`,
    );

    const client = new FakeIssuesClient();
    client.issuesByLabel.set(standingIssueLabel("gitee"), { number: 11 });

    const result = await postStandingIssueRankings({
      repositoryRoot: root,
      snapshotDate: "2026-08-05",
      platforms: ["gitee", "gitlab"],
      topN: 25,
      client,
    });

    expect(result).toEqual([
      { platform: "gitee", status: "posted", issueNumber: 11 },
      { platform: "gitlab", status: "skipped_missing_ranking" },
    ]);
    expect(client.comments).toHaveLength(1);
    expect(client.comments[0]?.issueNumber).toBe(11);
    expect(client.comments[0]?.body).toContain("<!-- ranking:gitee:2026-08-05 -->");
    expect(client.listedLabels).toEqual([standingIssueLabel("gitee")]);
  });

  test("is idempotent when the day marker already exists on the issue", async () => {
    const root = await mkdtemp(join(tmpdir(), "trending-issues-"));
    await mkdir(join(root, "data/rankings/gitlab/2026/08"), { recursive: true });
    await writeFile(
      join(root, "data/rankings/gitlab/2026/08/05.json"),
      `${JSON.stringify(ranking("gitlab"))}\n`,
    );

    const client = new FakeIssuesClient();
    client.issuesByLabel.set(standingIssueLabel("gitlab"), { number: 7 });
    client.existingMarkers.set(7, ["<!-- ranking:gitlab:2026-08-05 -->"]);

    const result = await postStandingIssueRankings({
      repositoryRoot: root,
      snapshotDate: "2026-08-05",
      platforms: ["gitlab"],
      topN: 25,
      client,
    });

    expect(result).toEqual([
      { platform: "gitlab", status: "skipped_already_posted", issueNumber: 7 },
    ]);
    expect(client.comments).toHaveLength(0);
  });

  test("fails when the standing issue label is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "trending-issues-"));
    await mkdir(join(root, "data/rankings/gitee/2026/08"), { recursive: true });
    await writeFile(
      join(root, "data/rankings/gitee/2026/08/05.json"),
      `${JSON.stringify(ranking("gitee"))}\n`,
    );

    const client = new FakeIssuesClient();
    client.issuesByLabel.set(standingIssueLabel("gitee"), null);

    await expect(
      postStandingIssueRankings({
        repositoryRoot: root,
        snapshotDate: "2026-08-05",
        platforms: ["gitee"],
        topN: 25,
        client,
      }),
    ).rejects.toThrow(/ranking-daily-gitee/);
  });
});
