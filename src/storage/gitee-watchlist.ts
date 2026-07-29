import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GITEE_SEARCH_UI_SEED } from "../platforms/gitee-data-source";
import { deterministicJson } from "./deterministic-json";

export interface WatchlistRepository {
  repositoryId: string;
  fullName: string;
  url: string;
  seedQuery: string;
}

export interface GiteeWatchlist {
  schemaVersion: 1;
  platform: "gitee";
  source: typeof GITEE_SEARCH_UI_SEED;
  updatedAt: string;
  repositories: WatchlistRepository[];
}

export interface BuildWatchlistInput {
  updatedAt: string;
  maxRepositories: number;
  repositories: Array<WatchlistRepository & { stars?: number }>;
}

export function buildWatchlist(input: BuildWatchlistInput): GiteeWatchlist {
  if (input.maxRepositories < 0) {
    throw new Error("maxRepositories must be non-negative");
  }
  const byId = new Map<string, WatchlistRepository & { stars: number }>();
  for (const repository of input.repositories) {
    if (!byId.has(repository.repositoryId)) {
      byId.set(repository.repositoryId, {
        repositoryId: repository.repositoryId,
        fullName: repository.fullName,
        url: repository.url,
        seedQuery: repository.seedQuery,
        stars: repository.stars ?? 0,
      });
    }
  }
  const repositories = [...byId.values()]
    .sort((left, right) => {
      if (right.stars !== left.stars) {
        return right.stars - left.stars;
      }
      return left.fullName.localeCompare(right.fullName);
    })
    .slice(0, input.maxRepositories)
    .map(({ repositoryId, fullName, url, seedQuery }) => ({
      repositoryId,
      fullName,
      url,
      seedQuery,
    }));

  return {
    schemaVersion: 1,
    platform: "gitee",
    source: GITEE_SEARCH_UI_SEED,
    updatedAt: input.updatedAt,
    repositories,
  };
}

export function watchlistPath(repositoryRoot: string): string {
  return join(repositoryRoot, "config", "watchlists", "gitee.json");
}

export async function saveWatchlist(
  repositoryRoot: string,
  watchlist: GiteeWatchlist,
): Promise<string> {
  const path = watchlistPath(repositoryRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${deterministicJson(watchlist)}\n`, "utf8");
  return path;
}

export async function loadWatchlist(
  repositoryRoot: string,
): Promise<GiteeWatchlist> {
  const path = watchlistPath(repositoryRoot);
  const value = JSON.parse(await readFile(path, "utf8")) as GiteeWatchlist;
  if (
    value.schemaVersion !== 1 ||
    value.platform !== "gitee" ||
    value.source !== GITEE_SEARCH_UI_SEED ||
    !Array.isArray(value.repositories)
  ) {
    throw new Error(`Invalid Gitee watchlist: ${path}`);
  }
  return value;
}
