import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measureGrowth } from "../../src/storage/growth-check";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("growth check", () => {
  test("projects annual immutable data growth from observed run days", async () => {
    const root = await mkdtemp(join(tmpdir(), "trending-growth-"));
    temporaryDirectories.push(root);
    for (const day of ["28", "29"]) {
      const directory = join(root, "data/runs/2026/07", day);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "gitlab.json"), "x".repeat(100));
    }
    await mkdir(join(root, "data/state/gitlab"), { recursive: true });
    await writeFile(
      join(root, "data/state/gitlab/candidates.ndjson"),
      "x".repeat(1_000),
    );

    expect(await measureGrowth(root)).toMatchObject({
      immutableBytes: 200,
      mutableBytes: 1000,
      observedDays: 2,
      projectedAnnualBytes: 401500,
      exceedsWarningGate: false,
      exceedsHardGate: false,
    });
  });
});
