import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactRepository } from "../../src/storage/artifact-repository";
import type { CollectionResult } from "../../src/pipeline/collector-pipeline";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("FileArtifactRepository", () => {
  test("publishes snapshot, ranking, state, and manifest idempotently", async () => {
    const root = await mkdtemp(join(tmpdir(), "trending-artifacts-"));
    temporaryDirectories.push(root);
    const repository = new FileArtifactRepository(root);
    const result = collectionResult();

    const first = await repository.save("2026-07-28", result);
    const second = await repository.save("2026-07-28", result);

    expect(second).toEqual(first);
    expect(first.paths).toEqual([
      "data/snapshots/gitlab/2026/07/28.ndjson",
      "data/snapshots/gitlab/2026/07/28.meta.json",
      "data/rankings/gitlab/2026/07/28.json",
      "data/runs/2026/07/28/gitlab.json",
      "data/state/gitlab/candidates.ndjson",
    ]);
    expect(
      JSON.parse(
        await readFile(join(root, "data/runs/2026/07/28/gitlab.json"), "utf8"),
      ),
    ).toMatchObject({ status: "complete", requestsUsed: 3 });
  });
});

function collectionResult(): CollectionResult {
  return {
    snapshot: {
      schemaVersion: 1,
      platform: "gitlab",
      cohortId: "gitlab-default-v1",
      observedAt: "2026-07-28T02:17:00.000Z",
      complete: true,
      repositories: [
        {
          platform: "gitlab",
          repositoryId: "1",
          fullName: "group/repo",
          url: "https://gitlab.com/group/repo",
          stars: 12,
          forks: 1,
          lastActivityAt: "2026-07-28T01:00:00.000Z",
          candidateSources: ["popular"],
      cohortContinuity: "continuing",
        },
      ],
    },
    ranking: {
      schemaVersion: 1,
      platform: "gitlab",
      rankingBasis: "tracked_cohort_star_delta",
      cohortId: "gitlab-default-v1",
      cohortSize: 1,
      observedAt: "2026-07-28T02:17:00.000Z",
      baselineObservedAt: "2026-07-27T02:17:00.000Z",
      observationIntervalHours: 24,
      intervalKind: "daily",
      entries: [
        {
          rank: 1,
          repositoryId: "1",
          fullName: "group/repo",
          previousStars: 10,
          stars: 12,
          starsDelta: 2,
          starsPerDay: 2,
        },
      ],
    },
    manifest: {
      schemaVersion: 1,
      platform: "gitlab",
      cohortId: "gitlab-default-v1",
      snapshotDate: "2026-07-28",
      observedAt: "2026-07-28T02:17:00.000Z",
      status: "complete",
      rankingBasis: "tracked_cohort_star_delta",
      requestBudget: 10,
      requestsUsed: 3,
      discoveryRepositories: 1,
      carryOverRequested: 1,
      observedRepositories: 1,
      collectorCommit: "test",
      dataSourceParameters: { orderBy: "star_count" },
      errors: [],
    },
  };
}
