import type {
  CandidateSource,
  Platform,
  RepositoryObservation,
  RepositoryReference,
} from "./types";

export interface CohortPlanInput {
  platform: Platform;
  popular: RepositoryObservation[];
  active: RepositoryObservation[];
  previousRepositories: RepositoryReference[];
  requestBudget: number;
  discoveryRequests: number;
  maxCarryOver: number;
}

export interface CohortPlan {
  discovered: RepositoryObservation[];
  carryOverRepositories: RepositoryReference[];
  requestBudget: {
    limit: number;
    used: number;
    reserved: number;
    remaining: number;
  };
}

export function planCohort(input: CohortPlanInput): CohortPlan {
  if (
    input.requestBudget < 0 ||
    input.discoveryRequests < 0 ||
    input.maxCarryOver < 0
  ) {
    throw new Error("Cohort budgets must be non-negative");
  }

  const discoveredById = new Map<string, RepositoryObservation>();
  for (const [source, repositories] of [
    ["popular", input.popular],
    ["active", input.active],
  ] as const) {
    for (const repository of repositories) {
      if (repository.platform !== input.platform) {
        throw new Error("Cohort discovery contains the wrong platform");
      }
      const existing = discoveredById.get(repository.repositoryId);
      if (!existing) {
        discoveredById.set(repository.repositoryId, {
          ...repository,
          candidateSources: [source],
        });
        continue;
      }
      discoveredById.set(repository.repositoryId, {
        ...existing,
        candidateSources: addSource(existing.candidateSources, source),
      });
    }
  }

  const used = Math.min(input.discoveryRequests, input.requestBudget);
  const remainingAfterDiscovery = Math.max(0, input.requestBudget - used);
  const discoveredIds = new Set(discoveredById.keys());
  const carryOverRepositories = uniqueReferences(input.previousRepositories)
    .filter((repository) => !discoveredIds.has(repository.repositoryId))
    .slice(0, Math.min(input.maxCarryOver, remainingAfterDiscovery));

  return {
    discovered: [...discoveredById.values()],
    carryOverRepositories,
    requestBudget: {
      limit: input.requestBudget,
      used,
      reserved: carryOverRepositories.length,
      remaining: remainingAfterDiscovery - carryOverRepositories.length,
    },
  };
}

function addSource(
  sources: CandidateSource[],
  source: CandidateSource,
): CandidateSource[] {
  return sources.includes(source) ? sources : [...sources, source];
}

function uniqueReferences(
  values: RepositoryReference[],
): RepositoryReference[] {
  const byId = new Map(
    values.map((reference) => [reference.repositoryId, reference]),
  );
  return [...byId.values()];
}
