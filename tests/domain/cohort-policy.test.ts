import { describe, expect, test } from "bun:test";
import { planCohort } from "../../src/domain/cohort-policy";
import type { RepositoryObservation } from "../../src/domain/types";

function repository(
  repositoryId: string,
  source: "popular" | "active",
): RepositoryObservation {
  return {
    platform: "gitlab",
    repositoryId,
    fullName: `group/repo-${repositoryId}`,
    url: `https://gitlab.com/group/repo-${repositoryId}`,
    stars: Number(repositoryId) * 10,
    forks: 0,
    lastActivityAt: "2026-07-28T00:00:00.000Z",
    candidateSources: [source],
  };
}

describe("CohortPolicy", () => {
  test("deduplicates discovery and spends only remaining requests on carry-over", () => {
    const result = planCohort({
      platform: "gitlab",
      popular: [repository("1", "popular"), repository("2", "popular")],
      active: [repository("2", "active"), repository("3", "active")],
      previousRepositories: ["2", "4", "5", "6"].map((repositoryId) => ({
        repositoryId,
        fullName: `group/repo-${repositoryId}`,
      })),
      requestBudget: 4,
      discoveryRequests: 2,
      maxCarryOver: 3,
    });

    expect(result.discovered).toEqual([
      repository("1", "popular"),
      { ...repository("2", "popular"), candidateSources: ["popular", "active"] },
      repository("3", "active"),
    ]);
    expect(result.carryOverRepositories).toEqual([
      { repositoryId: "4", fullName: "group/repo-4" },
      { repositoryId: "5", fullName: "group/repo-5" },
    ]);
    expect(result.requestBudget).toEqual({
      limit: 4,
      used: 2,
      reserved: 2,
      remaining: 0,
    });
  });
});
