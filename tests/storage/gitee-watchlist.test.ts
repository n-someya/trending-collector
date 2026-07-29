import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildWatchlist,
  loadWatchlist,
  saveWatchlist,
  type GiteeWatchlist,
} from "../../src/storage/gitee-watchlist";

describe("gitee watchlist", () => {
  test("builds a durable watchlist capped by stars with seed provenance", () => {
    const watchlist = buildWatchlist({
      updatedAt: "2026-07-29T00:00:00.000Z",
      maxRepositories: 2,
      repositories: [
        {
          repositoryId: "1",
          fullName: "a/low",
          url: "https://gitee.com/a/low",
          seedQuery: "Go",
          stars: 10,
        },
        {
          repositoryId: "2",
          fullName: "b/high",
          url: "https://gitee.com/b/high",
          seedQuery: "TypeScript",
          stars: 100,
        },
        {
          repositoryId: "3",
          fullName: "c/mid",
          url: "https://gitee.com/c/mid",
          seedQuery: "Rust",
          stars: 50,
        },
        {
          repositoryId: "2",
          fullName: "b/high",
          url: "https://gitee.com/b/high",
          seedQuery: "JavaScript",
          stars: 100,
        },
      ],
    });

    expect(watchlist).toEqual({
      schemaVersion: 1,
      platform: "gitee",
      source: "gitee_search_ui_seed",
      updatedAt: "2026-07-29T00:00:00.000Z",
      repositories: [
        {
          repositoryId: "2",
          fullName: "b/high",
          url: "https://gitee.com/b/high",
          seedQuery: "TypeScript",
        },
        {
          repositoryId: "3",
          fullName: "c/mid",
          url: "https://gitee.com/c/mid",
          seedQuery: "Rust",
        },
      ],
    } satisfies GiteeWatchlist);
  });

  test("round-trips the watchlist through Git-backed JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "gitee-watchlist-"));
    const watchlist = buildWatchlist({
      updatedAt: "2026-07-29T01:00:00.000Z",
      maxRepositories: 10,
      repositories: [
        {
          repositoryId: "9",
          fullName: "org/repo",
          url: "https://gitee.com/org/repo",
          seedQuery: "Python",
          stars: 1,
        },
      ],
    });

    const path = await saveWatchlist(root, watchlist);
    const loaded = await loadWatchlist(root);

    expect(path).toBe(join(root, "config/watchlists/gitee.json"));
    expect(loaded).toEqual(watchlist);
    expect(await readFile(path, "utf8")).toContain("gitee_search_ui_seed");
  });
});
