import type {
  RepositoryObservation,
  RepositoryReference,
} from "../domain/types";

export interface DiscoveryResult {
  popular: RepositoryObservation[];
  active: RepositoryObservation[];
  requestsUsed: number;
  complete: boolean;
  errors: string[];
}

export interface ObservationResult {
  repositories: RepositoryObservation[];
  requestsUsed: number;
  complete: boolean;
  errors: string[];
}

/**
 * Seam for reading repository observations from an external git host.
 * Adapters hide HTTP, auth, and platform-specific discovery.
 */
export interface GitRepoDataSource {
  discover(): Promise<DiscoveryResult>;
  observe(repositories: RepositoryReference[]): Promise<ObservationResult>;
}
