import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GiteeDataSource } from "../../src/platforms/gitee-data-source";
import type { RawApiResponse } from "../../src/platforms/api-request";

const detailFixture = await readFile(
  fileURLToPath(new URL("./fixtures/gitee-projects.json", import.meta.url)),
  "utf8",
);
const seedFixture = await readFile(
  fileURLToPath(new URL("./fixtures/so-gitee-search.json", import.meta.url)),
  "utf8",
);
const project = JSON.parse(detailFixture)[0];

describe("GiteeDataSource", () => {
  test("discovers by seeding so.gitee then observing detail API each collect", async () => {
    const requestedUrls: string[] = [];
    const source = new GiteeDataSource({
      token: "test-token",
      seedQueries: [{ query: "TypeScript", limit: 2 }],
      seedRequestBudget: 5,
      maxRepositories: 2,
      requestBudget: 10,
      fetch: async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes("so.gitee.com")) {
          return new Response(seedFixture, {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(project), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const result = await source.discover();

    expect(requestedUrls.some((url) => url.includes("/search/widget/"))).toBe(
      true,
    );
    expect(
      requestedUrls.find((url) => url.includes("so.gitee.com")),
    ).toContain("q=TypeScript");
    expect(requestedUrls.some((url) => url.includes("/repos/"))).toBe(true);
    expect(requestedUrls.every((url) => !url.includes("/search/repositories"))).toBe(
      true,
    );
    // Detail fixture is reused for each seeded path; budget counts each observe call.
    expect(result.requestsUsed).toBe(2);
    expect(result.popular).toHaveLength(1);
    expect(result.popular[0]).toMatchObject({
      platform: "gitee",
      repositoryId: "101",
      fullName: "openharmony/docs",
      candidateSources: ["popular"],
    });
    expect(source.lastWatchlist?.source).toBe("gitee_search_ui_seed");
    expect(source.lastWatchlist?.repositories.map((repo) => repo.fullName)).toEqual([
      "dromara/go-view",
      "thinkgem/jeesite",
    ]);
  });

  test("observes carry-over repositories by owner/name path", async () => {
    const requestedUrls: string[] = [];
    const source = new GiteeDataSource({
      token: "test-token",
      seedQueries: [],
      seedRequestBudget: 1,
      maxRepositories: 1,
      requestBudget: 1,
      fetch: async (input) => {
        requestedUrls.push(String(input));
        return new Response(JSON.stringify(project), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const result = await source.observe([
      { repositoryId: "101", fullName: "openharmony/docs" },
    ]);

    expect(requestedUrls[0]).toContain("/repos/openharmony/docs");
    expect(result.repositories[0]?.candidateSources).toEqual(["carry_over"]);
  });

  test("does not accept an empty so.gitee seed as a complete discovery", async () => {
    const source = new GiteeDataSource({
      token: "test-token",
      seedQueries: [{ query: "TypeScript", limit: 10 }],
      seedRequestBudget: 2,
      maxRepositories: 10,
      requestBudget: 2,
      fetch: async (input) => {
        if (String(input).includes("so.gitee.com")) {
          return new Response(
            JSON.stringify({
              took: 1,
              hits: { total: { value: 0, relation: "eq" }, hits: [] },
            }),
            { status: 200 },
          );
        }
        throw new Error("should not call detail API after empty seed");
      },
    });

    const result = await source.discover();

    expect(result.complete).toBe(false);
    expect(result.popular).toEqual([]);
    expect(result.errors).toContain(
      "Gitee seed discovery returned no repositories; so.gitee widget contract is invalid",
    );
  });

  test("sends the documented token parameter but redacts it from raw capture", async () => {
    let detailUrl = "";
    let captured: RawApiResponse | undefined;
    const source = new GiteeDataSource({
      token: "secret-token",
      seedQueries: [{ query: "TypeScript", limit: 1 }],
      seedRequestBudget: 2,
      maxRepositories: 1,
      requestBudget: 2,
      rawCapture: (response) => {
        if (response.url.includes("/repos/")) {
          captured = response;
        }
      },
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("so.gitee.com")) {
          return new Response(seedFixture, { status: 200 });
        }
        detailUrl = url;
        return new Response(JSON.stringify(project), { status: 200 });
      },
    });

    await source.discover();

    expect(detailUrl).toContain("access_token=secret-token");
    expect(captured?.url).toContain("access_token=%5BREDACTED%5D");
    expect(captured?.url).not.toContain("secret-token");
  });
});
