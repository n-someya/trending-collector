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
  requestJson,
  type FetchFunction,
  type RawCapture,
} from "./api-request";

const DEFAULT_BASE_URL = "https://gitlab.com/api/v4";
const PAGE_SIZE = 100;
const GRAPHQL_BATCH_SIZE = 100;
const PROJECT_GID_PREFIX = "gid://gitlab/Project/";
const OBSERVE_PROJECTS_QUERY = `query ($ids: [ID!], $first: Int!) {
  projects(ids: $ids, first: $first) {
    nodes {
      id
      fullPath
      webUrl
      starCount
      forksCount
      lastActivityAt
      archived
      topics
    }
  }
}`;

export interface GitLabDataSourceOptions {
  token?: string;
  popularLimit: number;
  activeLimit: number;
  requestBudget: number;
  baseUrl?: string;
  graphqlUrl?: string;
  fetch?: FetchFunction;
  retryDelayMilliseconds?: number;
  maxRetryDelayMilliseconds?: number;
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

interface GitLabGraphqlProject {
  id: string;
  fullPath: string;
  webUrl: string;
  starCount: number;
  forksCount: number;
  lastActivityAt: string;
  archived?: boolean;
  topics?: string[] | null;
}

interface GitLabGraphqlProjectsResponse {
  data?: {
    projects?: {
      nodes?: Array<GitLabGraphqlProject | null>;
    } | null;
  } | null;
  errors?: Array<{ message: string }>;
}

export class GitLabDataSource implements GitRepoDataSource {
  private readonly fetch: FetchFunction;
  private readonly baseUrl: string;
  private readonly graphqlUrl: string;
  private requestsUsed = 0;

  constructor(private readonly options: GitLabDataSourceOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.graphqlUrl =
      options.graphqlUrl ?? new URL("/api/graphql", this.baseUrl).toString();
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
    for (
      let offset = 0;
      offset < repositoryReferences.length;
      offset += GRAPHQL_BATCH_SIZE
    ) {
      if (!this.hasBudget()) {
        errors.push("request budget exhausted");
        break;
      }
      const batch = repositoryReferences.slice(
        offset,
        offset + GRAPHQL_BATCH_SIZE,
      );
      const ids = batch.map(
        (repository) => `${PROJECT_GID_PREFIX}${repository.repositoryId}`,
      );
      try {
        const response = await this.requestGraphql<GitLabGraphqlProjectsResponse>(
          OBSERVE_PROJECTS_QUERY,
          { ids, first: batch.length },
        );
        if (response.errors && response.errors.length > 0) {
          errors.push(
            `GitLab GraphQL error: ${response.errors.map((error) => error.message).join("; ")}`,
          );
          break;
        }
        const nodes = response.data?.projects?.nodes;
        if (!Array.isArray(nodes)) {
          errors.push("GitLab GraphQL response missing projects.nodes");
          break;
        }
        for (const project of nodes) {
          if (project && !project.archived) {
            repositories.push(graphqlToObservation(project, "carry_over"));
          }
        }
      } catch (error) {
        errors.push(messageFrom(error));
        break;
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
    const headers = this.authHeaders();
    return requestJson<T>({
      provider: "GitLab",
      url: `${this.baseUrl}${path}`,
      headers,
      fetch: this.fetch,
      acquireRequest: () => this.acquireRequest(),
      retryDelayMilliseconds: this.options.retryDelayMilliseconds ?? 1_000,
      ...(this.options.maxRetryDelayMilliseconds !== undefined
        ? { maxRetryDelayMilliseconds: this.options.maxRetryDelayMilliseconds }
        : {}),
      ...(this.options.rawCapture
        ? { capture: this.options.rawCapture }
        : {}),
    });
  }

  private async requestGraphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const headers = this.authHeaders();
    headers.set("content-type", "application/json");
    return requestJson<T>({
      provider: "GitLab",
      url: this.graphqlUrl,
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
      fetch: this.fetch,
      acquireRequest: () => this.acquireRequest(),
      retryDelayMilliseconds: this.options.retryDelayMilliseconds ?? 1_000,
      ...(this.options.maxRetryDelayMilliseconds !== undefined
        ? { maxRetryDelayMilliseconds: this.options.maxRetryDelayMilliseconds }
        : {}),
      ...(this.options.rawCapture
        ? { capture: this.options.rawCapture }
        : {}),
    });
  }

  private authHeaders(): Headers {
    const headers = new Headers({ accept: "application/json" });
    if (this.options.token) {
      headers.set("PRIVATE-TOKEN", this.options.token);
    }
    return headers;
  }

  private acquireRequest(): boolean {
    if (!this.hasBudget()) {
      return false;
    }
    this.requestsUsed += 1;
    return true;
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

function graphqlToObservation(
  project: GitLabGraphqlProject,
  source: CandidateSource,
): RepositoryObservation {
  return {
    platform: "gitlab",
    repositoryId: project.id.startsWith(PROJECT_GID_PREFIX)
      ? project.id.slice(PROJECT_GID_PREFIX.length)
      : project.id,
    fullName: project.fullPath,
    url: project.webUrl,
    stars: project.starCount,
    forks: project.forksCount,
    ...(project.topics ? { topics: project.topics } : {}),
    lastActivityAt: new Date(project.lastActivityAt).toISOString(),
    candidateSources: [source],
  };
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
