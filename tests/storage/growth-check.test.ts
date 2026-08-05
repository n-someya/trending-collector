import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateGrowthGates,
  measureGrowth,
} from "../../src/storage/growth-check";
import type { GrowthReport } from "../../src/storage/growth-check";

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
      projectedAnnualBytes: 37500,
      exceedsWarningGate: false,
      exceedsHardGate: false,
    });
  });
});

describe("growth gates", () => {
  test("hard gate fails the check", () => {
    const gate = evaluateGrowthGates(
      report({ exceedsWarningGate: true, exceedsHardGate: true }),
    );
    expect(gate.exitCode).toBe(1);
  });

  test("warning gate passes the check with a warning", () => {
    const gate = evaluateGrowthGates(
      report({
        totalBytes: 550_000_000,
        projectedAnnualBytes: 600_000_000,
        exceedsWarningGate: true,
      }),
    );
    expect(gate.exitCode).toBe(0);
    expect(gate.warning).toContain("550000000 bytes");
    expect(gate.warning).toContain("600000000 bytes");
    expect(gate.warning).toContain("500 MB");
    expect(gate.warning).toContain("ADR-0002");
  });

  test("clean report passes the check without a warning", () => {
    const gate = evaluateGrowthGates(report({}));
    expect(gate.exitCode).toBe(0);
    expect(gate.warning).toBeUndefined();
  });
});

function report(overrides: Partial<GrowthReport>): GrowthReport {
  return {
    immutableBytes: 0,
    mutableBytes: 0,
    totalBytes: 0,
    observedDays: 0,
    projectedAnnualBytes: 0,
    exceedsWarningGate: false,
    exceedsHardGate: false,
    ...overrides,
  };
}
