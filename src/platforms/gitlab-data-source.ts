import type {
  CandidateSource,
  RepositoryObservation,
  RepositoryReference,
} from "../domain/types";
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

const DEFAULT_BASE_URL = "https://gitlab.com/api/v4";
const PAGE_SIZE = 100;

export interface GitLabDataSourceOptions {
  token?: string;
  popularLimit: number;
  activeLimit: number;
  requestBudget: number;
  baseUrl?: string;
  fetch?: FetchFunction;
  retryDelayMilliseconds?: number;
  rawCapture?: RawCapture;
}

interface GitLabProject {
  id: number;
  path_with_namespace: string;
  web_url: string;
  star_count: number;
  forks_count: number;
  last_activity_at: string;
  archived?: boolean;
  topics?: string[];
}

export class GitLabDataSource implements GitRepoDataSource {
  private readonly fetch: FetchFunction;
  private readonly baseUrl: string;
  private requestsUsed = 0;

  constructor(private readonly options: GitLabDataSourceOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async discover(): Promise<DiscoveryResult> {
    const errors: string[] = [];
    const popular = await this.listProjects(
      "star_count",
      this.options.popularLimit,
      "popular",
      errors,
    );
    const active = await this.listProjects(
      "last_activity_at",
      this.options.activeLimit,
      "active",
      errors,
    );
    return {
      popular,
      active,
      requestsUsed: this.requestsUsed,
      complete: errors.length === 0,
      errors,
    };
  }

  async observe(
    repositoryReferences: RepositoryReference[],
  ): Promise<ObservationResult> {
    const repositories: RepositoryObservation[] = [];
    const errors: string[] = [];
    const before = this.requestsUsed;
    for (const repository of repositoryReferences) {
      if (!this.hasBudget()) {
        errors.push("request budget exhausted");
        break;
      }
      try {
        const project = await this.request<GitLabProject>(
          `/projects/${encodeURIComponent(repository.repositoryId)}`,
        );
        if (!project.archived) {
          repositories.push(toObservation(project, "carry_over"));
        }
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 404) {
          continue;
        }
        errors.push(messageFrom(error));
      }
    }
    return {
      repositories,
      requestsUsed: this.requestsUsed - before,
      complete: errors.length === 0,
      errors,
    };
  }

  private async listProjects(
    orderBy: "star_count" | "last_activity_at",
    limit: number,
    source: CandidateSource,
    errors: string[],
  ): Promise<RepositoryObservation[]> {
    const projects: GitLabProject[] = [];
    const pages = Math.ceil(limit / PAGE_SIZE);
    for (let page = 1; page <= pages && projects.length < limit; page += 1) {
      if (!this.hasBudget()) {
        errors.push("request budget exhausted");
        break;
      }
      const perPage = Math.min(PAGE_SIZE, limit - projects.length);
      const query = new URLSearchParams({
        order_by: orderBy,
        sort: "desc",
        visibility: "public",
        simple: "true",
        per_page: String(perPage),
        page: String(page),
      });
      try {
        const response = await this.request<GitLabProject[]>(
          `/projects?${query}`,
        );
        projects.push(...response);
        if (response.length < perPage) {
          break;
        }
      } catch (error) {
        errors.push(messageFrom(error));
        break;
      }
    }
    return projects
      .filter((project) => !project.archived)
      .slice(0, limit)
      .map((project) => toObservation(project, source));
  }

  private async request<T>(path: string): Promise<T> {
    const headers = new Headers({ accept: "application/json" });
    if (this.options.token) {
      headers.set("PRIVATE-TOKEN", this.options.token);
    }
    return requestJson<T>({
      provider: "GitLab",
      url: `${this.baseUrl}${path}`,
      headers,
      fetch: this.fetch,
      acquireRequest: () => {
        if (!this.hasBudget()) {
          return false;
        }
        this.requestsUsed += 1;
        return true;
      },
      retryDelayMilliseconds: this.options.retryDelayMilliseconds ?? 1_000,
      ...(this.options.rawCapture
        ? { capture: this.options.rawCapture }
        : {}),
    });
  }

  private hasBudget(): boolean {
    return this.requestsUsed < this.options.requestBudget;
  }
}

function toObservation(
  project: GitLabProject,
  source: CandidateSource,
): RepositoryObservation {
  return {
    platform: "gitlab",
    repositoryId: String(project.id),
    fullName: project.path_with_namespace,
    url: project.web_url,
    stars: project.star_count,
    forks: project.forks_count,
    ...(project.topics ? { topics: project.topics } : {}),
    lastActivityAt: project.last_activity_at,
    candidateSources: [source],
  };
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
