import type { FetchFunction } from "../platforms/api-request";
import type { GitHubIssuesClient } from "./standing-issue-rankings";

export interface HttpGitHubIssuesClientOptions {
  owner: string;
  repo: string;
  token: string;
  fetch?: FetchFunction;
  apiBaseUrl?: string;
}

interface GitHubIssue {
  number: number;
}

interface GitHubComment {
  body: string;
}

export class HttpGitHubIssuesClient implements GitHubIssuesClient {
  private readonly fetch: FetchFunction;
  private readonly apiBaseUrl: string;

  constructor(private readonly options: HttpGitHubIssuesClientOptions) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.github.com";
  }

  async findOpenIssueByLabel(
    label: string,
  ): Promise<{ number: number } | null> {
    const url = new URL(
      `${this.apiBaseUrl}/repos/${this.options.owner}/${this.options.repo}/issues`,
    );
    url.searchParams.set("state", "open");
    url.searchParams.set("labels", label);
    url.searchParams.set("per_page", "10");

    const issues = await this.requestJson<GitHubIssue[]>(url);
    const first = issues[0];
    return first ? { number: first.number } : null;
  }

  async listCommentMarkers(issueNumber: number): Promise<string[]> {
    const markers: string[] = [];
    let page = 1;
    while (page <= 10) {
      const url = new URL(
        `${this.apiBaseUrl}/repos/${this.options.owner}/${this.options.repo}/issues/${issueNumber}/comments`,
      );
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));
      const comments = await this.requestJson<GitHubComment[]>(url);
      for (const comment of comments) {
        const match = comment.body.match(/<!-- ranking:[a-z]+:\d{4}-\d{2}-\d{2} -->/);
        if (match?.[0]) {
          markers.push(match[0]);
        }
      }
      if (comments.length < 100) {
        break;
      }
      page += 1;
    }
    return markers;
  }

  async createComment(issueNumber: number, body: string): Promise<void> {
    const url = `${this.apiBaseUrl}/repos/${this.options.owner}/${this.options.repo}/issues/${issueNumber}/comments`;
    await this.requestJson(url, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  private async requestJson<T>(
    url: string | URL,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("Authorization", `Bearer ${this.options.token}`);
    headers.set("X-GitHub-Api-Version", "2022-11-28");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await this.fetch(url, { ...init, headers });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}: ${text}`);
    }
    return text.length === 0 ? (undefined as T) : (JSON.parse(text) as T);
  }
}
