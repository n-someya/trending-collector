import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Platform } from "./domain/types";
import { collectPlatform } from "./pipeline/collector-pipeline";
import { type GiteeSeedQuery } from "./platforms/gitee-data-source";
import { GiteeDataSource } from "./platforms/gitee-data-source";
import { GitLabDataSource } from "./platforms/gitlab-data-source";
import type { GitRepoDataSource } from "./platforms/git-repo-data-source";
import { FileArtifactRepository } from "./storage/artifact-repository";
import { publishBundle } from "./storage/bundle-publisher";
import { saveWatchlist } from "./storage/gitee-watchlist";
import { evaluateGrowthGates, measureGrowth } from "./storage/growth-check";
import { RawArtifactWriter } from "./storage/raw-artifact-writer";
import { FileSnapshotRepository } from "./storage/snapshot-repository";

interface BaseCohortConfig {
  schemaVersion: 1;
  platform: Platform;
  cohortId: string;
  maxCarryOver: number;
  requestBudget: number;
}

interface GitLabCohortConfig extends BaseCohortConfig {
  platform: "gitlab";
  popularLimit: number;
  activeLimit: number;
}

interface GiteeCohortConfig extends BaseCohortConfig {
  platform: "gitee";
}

type CohortConfig = GitLabCohortConfig | GiteeCohortConfig;

interface GiteeSeedConfig {
  schemaVersion: 1;
  platform: "gitee";
  requestBudget: number;
  maxRepositories: number;
  queries: GiteeSeedQuery[];
}

const [command, ...arguments_] = process.argv.slice(2);

try {
  switch (command) {
    case "collect":
      await collect(arguments_);
      break;
    case "publish":
      await publish(arguments_);
      break;
    case "verify-growth":
      await verifyGrowth(arguments_);
      break;
    default:
      throw new Error(
        "Usage: bun run src/cli.ts <collect|publish|verify-growth>",
      );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

async function publish(arguments_: string[]): Promise<void> {
  const input = option(arguments_, "--input");
  if (!input) {
    throw new Error("publish requires --input");
  }
  const target = resolve(option(arguments_, "--target") ?? ".");
  const paths = await publishBundle(resolve(input), target);
  console.log(JSON.stringify({ published: paths }));
}

async function verifyGrowth(arguments_: string[]): Promise<void> {
  const repositoryRoot = resolve(option(arguments_, "--repository") ?? ".");
  const report = await measureGrowth(repositoryRoot);
  console.log(JSON.stringify(report));
  const gate = evaluateGrowthGates(report);
  if (gate.warning && process.env.GITHUB_ACTIONS === "true") {
    console.log(`::warning title=Repository growth gate::${gate.warning}`);
  }
  if (gate.exitCode !== 0) {
    process.exitCode = gate.exitCode;
  }
}

async function collect(arguments_: string[]): Promise<void> {
  const platform = requiredPlatform(option(arguments_, "--platform"));
  const repositoryRoot = resolve(option(arguments_, "--repository") ?? ".");
  const outputRoot = resolve(option(arguments_, "--output") ?? repositoryRoot);
  const observedAtInput =
    option(arguments_, "--observed-at") ?? new Date().toISOString();
  const observedDate = new Date(observedAtInput);
  if (!Number.isFinite(observedDate.getTime())) {
    throw new Error(`Invalid --observed-at: ${observedAtInput}`);
  }
  const observedAt = observedDate.toISOString();
  const date = option(arguments_, "--date") ?? observedAt.slice(0, 10);
  if (observedAt.slice(0, 10) !== date) {
    throw new Error("--date must match the UTC date of --observed-at");
  }

  const config = await loadConfig(repositoryRoot, platform);
  const canonicalSnapshots = new FileSnapshotRepository(repositoryRoot);
  const existing = await canonicalSnapshots.load(platform, date);
  if (existing?.complete) {
    await mkdir(outputRoot, { recursive: true });
    await writeFile(
      resolve(outputRoot, `noop-${platform}.json`),
      `${JSON.stringify({ platform, date, status: "already_complete" })}\n`,
      "utf8",
    );
    console.log(
      JSON.stringify({ platform, date, status: "already_complete", paths: [] }),
    );
    return;
  }
  const rawWriter = new RawArtifactWriter(outputRoot, platform, date);
  const prepared = await createDataSource(
    config,
    repositoryRoot,
    rawWriter,
    observedAt,
  );
  const previous = await canonicalSnapshots.loadLatestCompleteBefore(
    platform,
    date,
  );
  const result = await collectPlatform({
    dataSource: prepared.dataSource,
    previous,
    platform,
    cohortId: config.cohortId,
    observedAt,
    requestBudget: config.requestBudget,
    maxCarryOver: config.maxCarryOver,
    collectorCommit: process.env.GITHUB_SHA ?? "local",
    dataSourceParameters: prepared.dataSourceParameters,
  });
  if (prepared.giteeDataSource?.lastWatchlist) {
    await saveWatchlist(outputRoot, prepared.giteeDataSource.lastWatchlist);
  }
  const saved = await new FileArtifactRepository(outputRoot).save(date, result);
  console.log(
    JSON.stringify({
      platform,
      date,
      status: result.manifest.status,
      requestsUsed: result.manifest.requestsUsed,
      observedRepositories: result.manifest.observedRepositories,
      paths: saved.paths,
    }),
  );
  if (!result.snapshot.complete) {
    process.exitCode = 2;
  }
}

interface PreparedDataSource {
  dataSource: GitRepoDataSource;
  dataSourceParameters: Record<string, unknown>;
  giteeDataSource?: GiteeDataSource;
}

async function createDataSource(
  config: CohortConfig,
  repositoryRoot: string,
  rawWriter: RawArtifactWriter,
  observedAt: string,
): Promise<PreparedDataSource> {
  if (config.platform === "gitlab") {
    return {
      dataSource: new GitLabDataSource({
        ...(process.env.GITLAB_TOKEN
          ? { token: process.env.GITLAB_TOKEN }
          : {}),
        popularLimit: config.popularLimit,
        activeLimit: config.activeLimit,
        requestBudget: config.requestBudget,
        rawCapture: (response) => rawWriter.capture(response),
      }),
      dataSourceParameters: {
        popularLimit: config.popularLimit,
        activeLimit: config.activeLimit,
        maxCarryOver: config.maxCarryOver,
      },
    };
  }
  if (!process.env.GITEE_TOKEN) {
    throw new Error(
      "GITEE_TOKEN is required for authenticated Gitee repository detail observation",
    );
  }
  const seedConfig = await loadSeedConfig(repositoryRoot);
  const giteeDataSource = new GiteeDataSource({
    token: process.env.GITEE_TOKEN,
    seedQueries: seedConfig.queries,
    seedRequestBudget: seedConfig.requestBudget,
    maxRepositories: seedConfig.maxRepositories,
    requestBudget: config.requestBudget,
    observedAt,
    rawCapture: (response) => rawWriter.capture(response),
  });
  return {
    dataSource: giteeDataSource,
    giteeDataSource,
    dataSourceParameters: {
      seedSource: "gitee_search_ui_seed",
      seedQueries: seedConfig.queries,
      maxRepositories: seedConfig.maxRepositories,
      maxCarryOver: config.maxCarryOver,
    },
  };
}

async function loadConfig(
  repositoryRoot: string,
  platform: Platform,
): Promise<CohortConfig> {
  const path = resolve(
    repositoryRoot,
    "config",
    "cohorts",
    `${platform}.json`,
  );
  const value = JSON.parse(await readFile(path, "utf8")) as CohortConfig;
  if (
    value.schemaVersion !== 1 ||
    value.platform !== platform ||
    !value.cohortId ||
    value.requestBudget <= 0 ||
    value.maxCarryOver < 0
  ) {
    throw new Error(`Invalid cohort configuration: ${path}`);
  }
  return value;
}

async function loadSeedConfig(repositoryRoot: string): Promise<GiteeSeedConfig> {
  const path = resolve(repositoryRoot, "config", "seeds", "gitee.json");
  const value = JSON.parse(await readFile(path, "utf8")) as GiteeSeedConfig;
  if (
    value.schemaVersion !== 1 ||
    value.platform !== "gitee" ||
    value.requestBudget <= 0 ||
    value.maxRepositories <= 0 ||
    !Array.isArray(value.queries) ||
    value.queries.length === 0
  ) {
    throw new Error(`Invalid Gitee seed configuration: ${path}`);
  }
  return value;
}

function requiredPlatform(value: string | undefined): Platform {
  if (value !== "gitlab" && value !== "gitee") {
    throw new Error("--platform must be gitlab or gitee");
  }
  return value;
}

function option(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index >= 0 ? arguments_[index + 1] : undefined;
}
