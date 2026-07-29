import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishBundle } from "../../src/storage/bundle-publisher";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("bundle publisher", () => {
  test("copies data artifacts and mutable Gitee watchlists", async () => {
    const input = await mkdtemp(join(tmpdir(), "trending-input-"));
    const target = await mkdtemp(join(tmpdir(), "trending-target-"));
    temporaryDirectories.push(input, target);
    await mkdir(join(input, "data/runs/2026/07/28"), { recursive: true });
    await mkdir(join(input, "config/watchlists"), { recursive: true });
    await mkdir(join(input, "raw/gitlab/2026-07-28"), { recursive: true });
    await writeFile(
      join(input, "data/runs/2026/07/28/gitlab.json"),
      '{"status":"complete"}\n',
    );
    await writeFile(
      join(input, "config/watchlists/gitee.json"),
      '{"source":"gitee_search_ui_seed"}\n',
    );
    await writeFile(join(input, "raw/gitlab/2026-07-28/000001.json"), "{}\n");

    const first = await publishBundle(input, target);
    const second = await publishBundle(input, target);

    expect(first).toEqual([
      "config/watchlists/gitee.json",
      "data/runs/2026/07/28/gitlab.json",
    ]);
    expect(second).toEqual(first);
    expect(
      await readFile(
        join(target, "data/runs/2026/07/28/gitlab.json"),
        "utf8",
      ),
    ).toBe('{"status":"complete"}\n');
    expect(
      await readFile(join(target, "config/watchlists/gitee.json"), "utf8"),
    ).toBe('{"source":"gitee_search_ui_seed"}\n');
    expect(
      await Bun.file(
        join(target, "raw/gitlab/2026-07-28/000001.json"),
      ).exists(),
    ).toBe(false);
  });
});
