import type { Platform, TrendRanking } from "../domain/types";

export interface FormatRankingIssueCommentInput {
  ranking: TrendRanking;
  snapshotDate: string;
  topN: number;
}

const PLATFORM_HOST: Record<Platform, string> = {
  gitee: "https://gitee.com",
  gitlab: "https://gitlab.com",
};

export function formatRankingIssueComment(
  input: FormatRankingIssueCommentInput,
): string {
  const { ranking, snapshotDate, topN } = input;
  if (!Number.isInteger(topN) || topN < 1) {
    throw new Error(`topN must be a positive integer: ${topN}`);
  }

  const shown = ranking.entries.slice(0, topN);
  const host = PLATFORM_HOST[ranking.platform];
  const rows = shown.map((entry) => {
    const href = `${host}/${entry.fullName}`;
    return `| ${entry.rank} | [\`${entry.fullName}\`](${href}) | ${entry.starsDelta} | ${entry.starsPerDay} | ${entry.stars} |`;
  });

  return [
    `<!-- ranking:${ranking.platform}:${snapshotDate} -->`,
    `## ${ranking.platform} ranking for ${snapshotDate}`,
    "",
    "This is a **self-computed alternative trend** (`tracked_cohort_star_delta`)",
    "inside a declared cohort — **not an official Trending UI snapshot**.",
    "",
    `- rankingBasis: \`${ranking.rankingBasis}\``,
    `- cohortId: \`${ranking.cohortId}\``,
    `- cohortSize: ${ranking.cohortSize}`,
    `- intervalKind: \`${ranking.intervalKind}\``,
    `- observationIntervalHours: ${ranking.observationIntervalHours}`,
    `- observedAt: \`${ranking.observedAt}\``,
    `- baselineObservedAt: \`${ranking.baselineObservedAt}\``,
    `- Showing **${shown.length}** of **${ranking.entries.length}** ranked repositories (Top-${topN}). Full list: \`data/rankings/${ranking.platform}/${snapshotDate.replaceAll("-", "/")}.json\`.`,
    "",
    "| Rank | Repository | Δ stars | stars/day | Stars |",
    "|---:|---|---:|---:|---:|",
    ...rows,
    "",
  ].join("\n");
}
