import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSnapshotRepository } from "../../src/storage/snapshot-repository";
import type { Snapshot } from "../../src/domain/types";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("SnapshotRepository", () => {
  test("writes stable ID-sorted NDJSON and loads it through the same seam", async () => {
    const root = await mkdtemp(join(tmpdir(), "trending-snapshot-"));
    temporaryDirectories.push(root);
    const repository = new FileSnapshotRepository(root);
    const snapshot: Snapshot = {
      schemaVersion: 1,
      platform: "gitlab",
      cohortId: "gitlab-default-v1",
      observedAt: "2026-07-28T02:17:00.000Z",
      complete: true,
      repositories: [
        {
          platform: "gitlab",
          repositoryId: "20",
          fullName: "group/twenty",
          url: "https://gitlab.com/group/twenty",
          stars: 20,
          forks: 2,
          lastActivityAt: "2026-07-28T00:00:00.000Z",
          candidateSources: ["active"],
      cohortContinuity: "continuing",
        },
        {
          platform: "gitlab",
          repositoryId: "3",
          fullName: "group/three",
          url: "https://gitlab.com/group/three",
          stars: 30,
          forks: 3,
          language: "TypeScript",
          topics: ["bun"],
          lastActivityAt: "2026-07-28T01:00:00.000Z",
          candidateSources: ["popular", "active"],
      cohortContinuity: "continuing",
        },
      ],
    };

    const first = await repository.save("2026-07-28", snapshot);
    const second = await repository.save("2026-07-28", snapshot);

    expect(second).toEqual(first);
    expect(await readFile(first.path, "utf8")).toBe(
      [
        '{"candidateSources":["popular","active"],"cohortContinuity":"continuing","forks":3,"fullName":"group/three","language":"TypeScript","lastActivityAt":"2026-07-28T01:00:00.000Z","platform":"gitlab","repositoryId":"3","stars":30,"topics":["bun"],"url":"https://gitlab.com/group/three"}',
        '{"candidateSources":["active"],"cohortContinuity":"continuing","forks":2,"fullName":"group/twenty","lastActivityAt":"2026-07-28T00:00:00.000Z","platform":"gitlab","repositoryId":"20","stars":20,"url":"https://gitlab.com/group/twenty"}',
        "",
      ].join("\n"),
    );
    expect(await repository.load("gitlab", "2026-07-28")).toEqual({
      ...snapshot,
      repositories: [snapshot.repositories[1]!, snapshot.repositories[0]!],
    });
  });

  test("allows an incomplete snapshot to be replaced by a complete rerun", async () => {
    const root = await mkdtemp(join(tmpdir(), "trending-snapshot-"));
    temporaryDirectories.push(root);
    const repository = new FileSnapshotRepository(root);
    const incomplete: Snapshot = {
      schemaVersion: 1,
      platform: "gitee",
      cohortId: "gitee-language-radar-v1",
      observedAt: "2026-07-28T02:17:00.000Z",
      complete: false,
      repositories: [],
    };
    const complete: Snapshot = {
      ...incomplete,
      complete: true,
      repositories: [
        {
          platform: "gitee",
          repositoryId: "101",
          fullName: "openharmony/docs",
          url: "https://gitee.com/openharmony/docs",
          stars: 7581,
          forks: 9200,
          lastActivityAt: "2026-07-28T01:00:00.000Z",
          candidateSources: ["popular"],
      cohortContinuity: "continuing",
        },
      ],
    };

    await repository.save("2026-07-28", incomplete);
    await repository.save("2026-07-28", complete);

    expect(await repository.load("gitee", "2026-07-28")).toEqual(complete);
  });

  test("rejects impossible calendar dates", async () => {
    const root = await mkdtemp(join(tmpdir(), "trending-snapshot-"));
    temporaryDirectories.push(root);
    const repository = new FileSnapshotRepository(root);

    await expect(
      repository.load("gitlab", "2026-02-31"),
    ).rejects.toThrow("Invalid snapshot date: 2026-02-31");
  });
});
