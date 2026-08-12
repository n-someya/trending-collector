import { describe, expect, test } from "bun:test";
import { HttpGitHubIssuesClient } from "../../src/publishing/github-issues-client";

describe("HttpGitHubIssuesClient", () => {
  test("finds the first open issue for a label and posts comments", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const client = new HttpGitHubIssuesClient({
      owner: "acme",
      repo: "trending-collector",
      token: "test-token",
      fetch: async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const call: { url: string; method: string; body?: string } = {
          url,
          method,
        };
        if (typeof init?.body === "string") {
          call.body = init.body;
        }
        calls.push(call);        if (url.includes("/issues?") && method === "GET") {
          return Response.json([{ number: 42 }]);
        }
        if (url.includes("/issues/42/comments") && method === "GET") {
          return Response.json([
            { body: "hello\n<!-- ranking:gitee:2026-08-04 -->\n" },
          ]);
        }
        if (url.includes("/issues/42/comments") && method === "POST") {
          return Response.json({ id: 1 }, { status: 201 });
        }
        return new Response("unexpected", { status: 500 });
      },
    });

    expect(await client.findOpenIssueByLabel("ranking-daily-gitee")).toEqual({
      number: 42,
    });
    expect(await client.listCommentMarkers(42)).toEqual([
      "<!-- ranking:gitee:2026-08-04 -->",
    ]);
    await client.createComment(42, "body");

    expect(calls[0]?.url).toContain("labels=ranking-daily-gitee");
    expect(calls[0]?.url).toContain("state=open");
    expect(calls[2]?.method).toBe("POST");
    expect(calls[2]?.body).toBe(JSON.stringify({ body: "body" }));
  });
});
