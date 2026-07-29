import type {
  CandidateSource,
  RepositoryObservation,
  RepositoryReference,
} from "../domain/types";
import {
  buildWatchlist,
  type GiteeWatchlist,
} from "../storage/gitee-watchlist";
import type {
  DiscoveryResult,
  ObservationResult,
  GitRepoDataSource,
} from "./git-repo-data-source";
import {
  ApiHttpError,
  requestJson,
  type FetchFunction,
  type RawCapture,
} from "./api-request";

export const GITEE_SEARCH_UI_SEED = "gitee_search_ui_seed" as const;

const DEFAULT_DETAIL_BASE_URL = "https://gitee.com/api/v5";
const DEFAULT_SEED_BASE_URL = "https://so.gitee.com/v1";
const DEFAULT_WIDGET_ID = "wong1slagnlmzwvsu5ya";
const SEED_PAGE_SIZE = 50;

/** Discovery query knobs for so.gitee (config/seeds). Not a separate DataSource. */
export interface GiteeSeedQuery {
  query: string;
  limit: number;
}

export interface GiteeDataSourceOptions {
  token?: string;
  seedQueries: GiteeSeedQuery[];
  seedRequestBudget: number;
  maxRepositories: number;
  requestBudget: number;
  observedAt?: string;
  baseUrl?: string;
  seedBaseUrl?: string;
  widgetId?: string;
  fetch?: FetchFunction;
  retryDelayMilliseconds?: number;
  rawCapture?: RawCapture;
}

interface GiteeProject {
  id: number | string;
  full_name: string;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language?: string | null;
  pushed_at?: string;
  updated_at?: string;
  topics?: string[];
}

interface SeedCandidate {
  repositoryId: string;
  fullName: string;
  url: string;
  seedQuery: string;
  stars: number;
}

interface SoGiteeSearchResponse {
  hits?: {
    hits?: SoGiteeHit[];
  };
}

interface SoGiteeHit {
  _id?: string;
  fields?: Record<string, unknown>;
}

/**
 * Gitee adapter for GitRepoDataSource.
 * discover() hides so.gitee candidate search + v5 detail observation.
 */
export class GiteeDataSource implements GitRepoDataSource {
  private readonly fetch: FetchFunction;
  private readonly detailBaseUrl: string;
  private readonly seedBaseUrl: string;
  private readonly widgetId: string;
  private detailRequestsUsed = 0;
  lastWatchlist: GiteeWatchlist | null = null;

  constructor(private readonly options: GiteeDataSourceOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.detailBaseUrl = options.baseUrl ?? DEFAULT_DETAIL_BASE_URL;
    this.seedBaseUrl = options.seedBaseUrl ?? DEFAULT_SEED_BASE_URL;
    this.widgetId = options.widgetId ?? DEFAULT_WIDGET_ID;
  }

  async discover(): Promise<DiscoveryResult> {
    const errors: string[] = [];
    this.lastWatchlist = null;

    const seeded = await this.searchSeedCandidates(errors);
    if (seeded.length === 0) {
      if (errors.length === 0) {
        errors.push(
          "Gitee seed discovery returned no repositories; so.gitee widget contract is invalid",
        );
      }
      return {
        popular: [],
        active: [],
        requestsUsed: this.detailRequestsUsed,
        complete: false,
        errors,
      };
    }

    this.lastWatchlist = buildWatchlist({
      updatedAt: this.options.observedAt ?? new Date().toISOString(),
      maxRepositories: this.options.maxRepositories,
      repositories: seeded,
    });

    const popular: RepositoryObservation[] = [];
    for (const entry of this.lastWatchlist.repositories) {
      if (!this.hasDetailBudget()) {
        errors.push("request budget exhausted");
        break;
      }
      const [owner, ...repoParts] = entry.fullName.split("/");
      const repo = repoParts.join("/");
      if (!owner || !repo) {
        errors.push(`invalid Gitee full name: ${entry.fullName}`);
        continue;
      }
      try {
        const project = await this.requestDetail<GiteeProject>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        );
        popular.push(toObservation(project, "popular"));
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 404) {
          continue;
        }
        errors.push(messageFrom(error));
      }
    }

    if (popular.length === 0) {
      errors.push(
        "Gitee discovery returned no repositories; watchlist detail contract is invalid",
      );
    }

    return {
      popular: deduplicateObservations(popular),
      active: [],
      requestsUsed: this.detailRequestsUsed,
      complete: errors.length === 0,
      errors,
    };
  }

  async observe(
    repositoryReferences: RepositoryReference[],
  ): Promise<ObservationResult> {
    const repositories: RepositoryObservation[] = [];
    const errors: string[] = [];
    const before = this.detailRequestsUsed;

    for (const repository of repositoryReferences) {
      if (!this.hasDetailBudget()) {
        errors.push("request budget exhausted");
        break;
      }
      const [owner, ...repoParts] = repository.fullName.split("/");
      const repo = repoParts.join("/");
      if (!owner || !repo) {
        errors.push(`invalid Gitee full name: ${repository.fullName}`);
        continue;
      }
      try {
        const project = await this.requestDetail<GiteeProject>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        );
        repositories.push(toObservation(project, "carry_over"));
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 404) {
          continue;
        }
        errors.push(messageFrom(error));
      }
    }

    return {
      repositories,
      requestsUsed: this.detailRequestsUsed - before,
      complete: errors.length === 0,
      errors,
    };
  }

  private async searchSeedCandidates(
    errors: string[],
  ): Promise<SeedCandidate[]> {
    const repositories: SeedCandidate[] = [];
    let seedRequestsUsed = 0;

    for (const querySpec of this.options.seedQueries) {
      const found: SeedCandidate[] = [];
      for (
        let from = 0;
        from < querySpec.limit && found.length < querySpec.limit;
        from += SEED_PAGE_SIZE
      ) {
        if (seedRequestsUsed >= this.options.seedRequestBudget) {
          errors.push("request budget exhausted");
          return deduplicateSeeds([...repositories, ...found]);
        }
        const pageSize = Math.min(
          SEED_PAGE_SIZE,
          querySpec.limit - found.length,
        );
        const url = new URL(
          `${this.seedBaseUrl}/search/widget/${encodeURIComponent(this.widgetId)}`,
        );
        url.searchParams.set("q", querySpec.query);
        url.searchParams.set("from", String(from));
        url.searchParams.set("size", String(pageSize));
        seedRequestsUsed += 1;
        try {
          const response = await requestJson<SoGiteeSearchResponse>({
            provider: "so.gitee",
            url: url.toString(),
            headers: new Headers({
              accept: "application/json",
              referer: "https://so.gitee.com/",
            }),
            fetch: this.fetch,
            acquireRequest: () => true,
            retryDelayMilliseconds:
              this.options.retryDelayMilliseconds ?? 1_000,
            ...(this.options.rawCapture
              ? { capture: this.options.rawCapture }
              : {}),
          });
          const hits = response.hits?.hits ?? [];
          for (const hit of hits) {
            const mapped = mapSeedHit(hit, querySpec.query);
            if (mapped) {
              found.push(mapped);
            }
          }
          if (hits.length < pageSize) {
            break;
          }
        } catch (error) {
          errors.push(messageFrom(error));
          return deduplicateSeeds([...repositories, ...found]);
        }
      }
      repositories.push(...found.slice(0, querySpec.limit));
    }

    const deduped = deduplicateSeeds(repositories);
    if (this.options.seedQueries.length > 0 && deduped.length === 0) {
      errors.push(
        "Gitee seed discovery returned no repositories; so.gitee widget contract is invalid",
      );
    }
    return deduped;
  }

  private async requestDetail<T>(path: string): Promise<T> {
    const headers = new Headers({ accept: "application/json" });
    const url = new URL(`${this.detailBaseUrl}${path}`);
    if (this.options.token) {
      url.searchParams.set("access_token", this.options.token);
    }
    return requestJson<T>({
      provider: "Gitee",
      url: url.toString(),
      headers,
      fetch: this.fetch,
      acquireRequest: () => {
        if (!this.hasDetailBudget()) {
          return false;
        }
        this.detailRequestsUsed += 1;
        return true;
      },
      retryDelayMilliseconds: this.options.retryDelayMilliseconds ?? 1_000,
      ...(this.options.rawCapture
        ? { capture: this.options.rawCapture }
        : {}),
    });
  }

  private hasDetailBudget(): boolean {
    return this.detailRequestsUsed < this.options.requestBudget;
  }
}

function mapSeedHit(
  hit: SoGiteeHit,
  seedQuery: string,
): SeedCandidate | null {
  const fields = hit.fields ?? {};
  const url = firstString(fields.url);
  const fullName = fullNameFromUrl(url);
  const repositoryId =
    firstString(fields.id) ??
    (typeof hit._id === "string" || typeof hit._id === "number"
      ? String(hit._id)
      : undefined);
  const stars = firstNumber(fields["count.star"]) ?? 0;
  if (!url || !fullName || !repositoryId) {
    return null;
  }
  return {
    repositoryId,
    fullName,
    url,
    seedQuery,
    stars,
  };
}

function fullNameFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const pathname = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
    const parts = pathname.split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return undefined;
    }
    return `${parts[0]}/${parts.slice(1).join("/")}`;
  } catch {
    return undefined;
  }
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "string") {
      return first;
    }
    if (typeof first === "number") {
      return String(first);
    }
  }
  return undefined;
}

function firstNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "number") {
    return value[0];
  }
  return undefined;
}

function toObservation(
  project: GiteeProject,
  source: CandidateSource,
): RepositoryObservation {
  const lastActivityAt = project.pushed_at ?? project.updated_at;
  if (!lastActivityAt) {
    throw new Error(`Gitee project ${project.full_name} has no activity time`);
  }
  return {
    platform: "gitee",
    repositoryId: String(project.id),
    fullName: project.full_name,
    url: project.html_url,
    stars: project.stargazers_count,
    forks: project.forks_count,
    ...(project.language !== undefined
      ? { language: project.language }
      : {}),
    ...(project.topics ? { topics: project.topics } : {}),
    lastActivityAt: new Date(lastActivityAt).toISOString(),
    candidateSources: [source],
  };
}

function deduplicateObservations(
  repositories: RepositoryObservation[],
): RepositoryObservation[] {
  return [
    ...new Map(
      repositories.map((repository) => [
        repository.repositoryId,
        repository,
      ]),
    ).values(),
  ];
}

function deduplicateSeeds(repositories: SeedCandidate[]): SeedCandidate[] {
  return [
    ...new Map(
      repositories.map((repository) => [repository.repositoryId, repository]),
    ).values(),
  ];
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
