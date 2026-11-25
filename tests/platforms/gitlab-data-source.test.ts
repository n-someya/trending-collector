import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GitLabDataSource } from "../../src/platforms/gitlab-data-source";
import type { RawApiResponse } from "../../src/platforms/api-request";

const fixture = await readFile(
  fileURLToPath(
    new URL("./fixtures/gitlab-projects.json", import.meta.url),
  ),
  "utf8",
);

describe("GitLabDataSource", () => {
  test("discovers documented popularity and activity pages as common observations", async () => {
    const requestedUrls: string[] = [];
    const source = new GitLabDataSource({
      token: "test-token",
      popularLimit: 2,
      activeLimit: 2,
      requestBudget: 10,
      fetch: async (input) => {
        requestedUrls.push(String(input));
        return new Response(fixture, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const result = await source.discover();

    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toContain("order_by=star_count");
    expect(requestedUrls[1]).toContain("order_by=last_activity_at");
    expect(result.requestsUsed).toBe(2);
    expect(result.popular[0]).toEqual({
      platform: "gitlab",
      repositoryId: "278964",
      fullName: "gitlab-org/gitlab",
      url: "https://gitlab.com/gitlab-org/gitlab",
      stars: 41000,
      forks: 8500,
      topics: ["devops", "git"],
      lastActivityAt: "2026-07-28T01:45:12.000Z",
      candidateSources: ["popular"],
    });
    expect(result.active[1]?.candidateSources).toEqual(["active"]);
  });

  test("retries a rate-limited page within the request budget", async () => {
    let attempts = 0;
    const source = new GitLabDataSource({
      popularLimit: 1,
      activeLimit: 0,
      requestBudget: 2,
      retryDelayMilliseconds: 0,
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) {
          return new Response("rate limited", {
            status: 429,
            headers: { "retry-after": "0" },
          });
        }
        return new Response(fixture, { status: 200 });
      },
    });

    const result = await source.discover();

    expect(result.complete).toBe(true);
    expect(result.requestsUsed).toBe(2);
    expect(result.popular).toHaveLength(1);
  });

  test("does not persist sensitive response headers in raw capture", async () => {
    let captured: RawApiResponse | undefined;
    const source = new GitLabDataSource({
      popularLimit: 1,
      activeLimit: 0,
      requestBudget: 1,
      rawCapture: (response) => {
        captured = response;
      },
      fetch: async () =>
        new Response(fixture, {
          status: 200,
          headers: {
            "set-cookie": "session=secret",
            "x-ratelimit-remaining": "99",
          },
        }),
    });

    await source.discover();

    expect(captured?.headers).toEqual({ "x-ratelimit-remaining": "99" });
  });

  test("treats a deleted carry-over repository as a completed removal", async () => {
    const source = new GitLabDataSource({
      popularLimit: 0,
      activeLimit: 0,
      requestBudget: 1,
      fetch: async () =>
        new Response(JSON.stringify({ data: { projects: { nodes: [] } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    const result = await source.observe([
      { repositoryId: "404", fullName: "group/deleted" },
    ]);

    expect(result).toMatchObject({
      repositories: [],
      requestsUsed: 1,
      complete: true,
      errors: [],
    });
  });

  test("batches carry-over observations in chunks of 100 via GraphQL", async () => {
    const calls: Array<{
      url: string;
      method: string | undefined;
      ids: string[];
    }> = [];
    const source = new GitLabDataSource({
      token: "test-token",
      popularLimit: 0,
      activeLimit: 0,
      requestBudget: 5,
      fetch: async (input, init) => {
        const parsed = JSON.parse(String(init?.body)) as {
          variables: { ids: string[]; first: number };
        };
        calls.push({
          url: String(input),
          method: init?.method,
          ids: parsed.variables.ids,
        });
        const nodes = parsed.variables.ids.map((gid, index) => {
          const numericId = gid.replace("gid://gitlab/Project/", "");
          return {
            id: gid,
            fullPath: `group/repo-${numericId}`,
            webUrl: `https://gitlab.com/group/repo-${numericId}`,
            starCount: Number(numericId),
            forksCount: index,
            lastActivityAt: "2026-11-23T10:00:00Z",
            archived: numericId === "2",
            topics: ["gitlab"],
          };
        });
        return new Response(
          JSON.stringify({ data: { projects: { nodes } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const refs = Array.from({ length: 105 }, (_, index) => ({
      repositoryId: String(index + 1),
      fullName: `group/repo-${index + 1}`,
    }));

    const result = await source.observe(refs);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("https://gitlab.com/api/graphql");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.ids).toHaveLength(100);
    expect(calls[1]?.ids).toHaveLength(5);
    expect(result.complete).toBe(true);
    expect(result.requestsUsed).toBe(2);
    expect(result.repositories).toHaveLength(104);
    expect(result.repositories[0]).toEqual({
      platform: "gitlab",
      repositoryId: "1",
      fullName: "group/repo-1",
      url: "https://gitlab.com/group/repo-1",
      stars: 1,
      forks: 0,
      topics: ["gitlab"],
      lastActivityAt: "2026-11-23T10:00:00.000Z",
      candidateSources: ["carry_over"],
    });
  });

  test("marks observation incomplete when GraphQL returns errors", async () => {
    const source = new GitLabDataSource({
      popularLimit: 0,
      activeLimit: 0,
      requestBudget: 2,
      fetch: async () =>
        new Response(
          JSON.stringify({ errors: [{ message: "Query complexity too high" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    const result = await source.observe([
      { repositoryId: "14360", fullName: "tigefa/mybb" },
    ]);

    expect(result.complete).toBe(false);
    expect(result.errors).toEqual([
      "GitLab GraphQL error: Query complexity too high",
    ]);
  });

  test("fails fast without sleeping when Retry-After exceeds max retry delay", async () => {
    let attempts = 0;
    const startedAt = Date.now();
    const source = new GitLabDataSource({
      popularLimit: 1,
      activeLimit: 0,
      requestBudget: 4,
      retryDelayMilliseconds: 10,
      maxRetryDelayMilliseconds: 1_000,
      fetch: async () => {
        attempts += 1;
        return new Response("Rate limit exceeded", {
          status: 429,
          headers: { "retry-after": "3600" },
        });
      },
    });

    const result = await source.discover();
    const elapsedMs = Date.now() - startedAt;

    expect(attempts).toBe(1);
    expect(elapsedMs).toBeLessThan(500);
    expect(result.complete).toBe(false);
    expect(result.errors[0]).toContain("GitLab API 429");
  });
});
