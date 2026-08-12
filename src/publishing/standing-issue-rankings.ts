import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Platform, TrendRanking } from "../domain/types";
import { formatRankingIssueComment } from "./format-ranking-issue-comment";

export interface GitHubIssuesClient {
  findOpenIssueByLabel(label: string): Promise<{ number: number } | null>;
  listCommentMarkers(issueNumber: number): Promise<string[]>;
  createComment(issueNumber: number, body: string): Promise<void>;
}

export type PostRankingStatus =
  | "posted"
  | "skipped_missing_ranking"
  | "skipped_already_posted";

export interface PostRankingResult {
  platform: Platform;
  status: PostRankingStatus;
  issueNumber?: number;
}

export interface PostStandingIssueRankingsInput {
  repositoryRoot: string;
  snapshotDate: string;
  platforms: Platform[];
  topN: number;
  client: GitHubIssuesClient;
}

export function standingIssueLabel(platform: Platform): string {
  return `ranking-daily-${platform}`;
}

export function rankingCommentMarker(
  platform: Platform,
  snapshotDate: string,
): string {
  return `<!-- ranking:${platform}:${snapshotDate} -->`;
}

export async function postStandingIssueRankings(
  input: PostStandingIssueRankingsInput,
): Promise<PostRankingResult[]> {
  const results: PostRankingResult[] = [];

  for (const platform of input.platforms) {
    const ranking = await readRankingOptional(
      input.repositoryRoot,
      platform,
      input.snapshotDate,
    );
    if (!ranking) {
      results.push({ platform, status: "skipped_missing_ranking" });
      continue;
    }

    const label = standingIssueLabel(platform);
    const issue = await input.client.findOpenIssueByLabel(label);
    if (!issue) {
      throw new Error(
        `Standing issue not found for label ${label}. Create one open issue with that label.`,
      );
    }

    const marker = rankingCommentMarker(platform, input.snapshotDate);
    const markers = await input.client.listCommentMarkers(issue.number);
    if (markers.includes(marker)) {
      results.push({
        platform,
        status: "skipped_already_posted",
        issueNumber: issue.number,
      });
      continue;
    }

    const body = formatRankingIssueComment({
      ranking,
      snapshotDate: input.snapshotDate,
      topN: input.topN,
    });
    await input.client.createComment(issue.number, body);
    results.push({
      platform,
      status: "posted",
      issueNumber: issue.number,
    });
  }

  return results;
}

async function readRankingOptional(
  repositoryRoot: string,
  platform: Platform,
  snapshotDate: string,
): Promise<TrendRanking | null> {
  const [year, month, day] = snapshotDate.split("-");
  if (!year || !month || !day) {
    throw new Error(`Invalid snapshot date: ${snapshotDate}`);
  }
  const path = join(
    repositoryRoot,
    "data",
    "rankings",
    platform,
    year,
    month,
    `${day}.json`,
  );
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content) as TrendRanking;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}
