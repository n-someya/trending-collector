import { describe, expect, test } from "bun:test";
import { collectPlatform } from "../../src/pipeline/collector-pipeline";
import type { Snapshot } from "../../src/domain/types";
import type { GitRepoDataSource } from "../../src/platforms/git-repo-data-source";

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
      fullName: "group/known",
      url: "https://gitlab.com/group/known",
      stars: 10,
      forks: 1,
      lastActivityAt: "2026-07-27T01:00:00.000Z",
      candidateSources: ["popular"],
    },
    {
      platform: "gitlab",
      repositoryId: "2",
      fullName: "group/carry",
      url: "https://gitlab.com/group/carry",
      stars: 20,
      forks: 2,
      lastActivityAt: "2026-07-27T01:00:00.000Z",
      candidateSources: ["active"],
    },
  ],
};

describe("CollectorPipeline", () => {
  test("publishes a complete snapshot and ranks only adjacent observations", async () => {
    const dataSource: GitRepoDataSource = {
      async discover() {
        return {
          popular: [{ ...previous.repositories[0]!, stars: 15 }],
          active: [
            {
              platform: "gitlab",
              repositoryId: "3",
              fullName: "group/new",
              url: "https://gitlab.com/group/new",
              stars: 99,
              forks: 1,
              lastActivityAt: "2026-07-28T01:00:00.000Z",
              candidateSources: ["active"],
            },
          ],
          requestsUsed: 2,
          complete: true,
          errors: [],
        };
      },
      async observe(repositories) {
        expect(repositories).toEqual([
          { repositoryId: "2", fullName: "group/carry" },
        ]);
        return {
          repositories: [
            {
              ...previous.repositories[1]!,
              stars: 27,
              candidateSources: ["carry_over"],
            },
          ],
          requestsUsed: 1,
          complete: true,
          errors: [],
        };
      },
    };

    const result = await collectPlatform({
      dataSource,
      previous,
      platform: "gitlab",
      cohortId: "gitlab-default-v1",
      observedAt: "2026-07-28T02:17:00.000Z",
      requestBudget: 10,
      maxCarryOver: 5,
    });

    expect(result.snapshot.complete).toBe(true);
    expect(result.snapshot.repositories.map((repository) => repository.repositoryId))
      .toEqual(["1", "3", "2"]);
    expect(result.ranking?.entries.map((entry) => entry.repositoryId)).toEqual([
      "2",
      "1",
    ]);
    expect(result.manifest).toMatchObject({
      schemaVersion: 1,
      platform: "gitlab",
      cohortId: "gitlab-default-v1",
      status: "complete",
      requestsUsed: 3,
      observedRepositories: 3,
    });
  });
});
