import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  CandidateSource,
  Platform,
  RepositoryObservation,
  Snapshot,
  SnapshotRepositoryObservation,
} from "../domain/types";

export interface SavedSnapshot {
  path: string;
  bytes: number;
  sha256: string;
}

interface SnapshotMetadata {
  schemaVersion: 1;
  platform: Platform;
  cohortId: string;
  observedAt: string;
  complete: boolean;
}

export class FileSnapshotRepository {
  constructor(private readonly root: string) {}

  async save(date: string, snapshot: Snapshot): Promise<SavedSnapshot> {
    assertDate(date);
    const path = this.snapshotPath(snapshot.platform, date);
    const metadataPath = this.metadataPath(snapshot.platform, date);
    const repositories = [...snapshot.repositories].sort(compareRepositoryId);
    const content =
      repositories.map(serializeObservation).join("\n") +
      (repositories.length > 0 ? "\n" : "");
    const metadata = stableStringify({
      schemaVersion: snapshot.schemaVersion,
      platform: snapshot.platform,
      cohortId: snapshot.cohortId,
      observedAt: snapshot.observedAt,
      complete: snapshot.complete,
    } satisfies SnapshotMetadata) + "\n";

    await mkdir(dirname(path), { recursive: true });
    const existingMetadata = await readTextOptional(metadataPath);
    if (existingMetadata) {
      const parsed = JSON.parse(existingMetadata) as SnapshotMetadata;
      if (parsed.complete) {
        await writeImmutable(path, content);
        await writeImmutable(metadataPath, metadata);
      } else {
        await writeFile(path, content, "utf8");
        await writeFile(metadataPath, metadata, "utf8");
      }
    } else {
      await writeImmutable(path, content);
      await writeImmutable(metadataPath, metadata);
    }

    return {
      path,
      bytes: Buffer.byteLength(content),
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  }

  async load(platform: Platform, date: string): Promise<Snapshot | null> {
    assertDate(date);
    const path = this.snapshotPath(platform, date);
    const metadataPath = this.metadataPath(platform, date);
    try {
      const [content, metadataContent] = await Promise.all([
        readFile(path, "utf8"),
        readFile(metadataPath, "utf8"),
      ]);
      const metadata = JSON.parse(metadataContent) as SnapshotMetadata;
      const repositories = content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SnapshotRepositoryObservation);
      return { ...metadata, repositories };
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }
      throw error;
    }
  }

  async loadLatestCompleteBefore(
    platform: Platform,
    date: string,
    maxLookbackDays = 30,
  ): Promise<Snapshot | null> {
    assertDate(date);
    const cursor = new Date(`${date}T00:00:00.000Z`);
    for (let days = 1; days <= maxLookbackDays; days += 1) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      const candidate = await this.load(
        platform,
        cursor.toISOString().slice(0, 10),
      );
      if (candidate?.complete) {
        return candidate;
      }
    }
    return null;
  }

  private snapshotPath(platform: Platform, date: string): string {
    const [year, month, day] = date.split("-");
    return join(
      this.root,
      "data",
      "snapshots",
      platform,
      year!,
      month!,
      `${day}.ndjson`,
    );
  }

  private metadataPath(platform: Platform, date: string): string {
    return this.snapshotPath(platform, date).replace(/\.ndjson$/, ".meta.json");
  }
}

function serializeObservation(observation: RepositoryObservation): string {
  return stableStringify({
    ...observation,
    candidateSources: [...observation.candidateSources].sort(
      compareCandidateSource,
    ),
    ...(observation.topics
      ? { topics: [...observation.topics].sort() }
      : {}),
  });
}

const candidateSourceOrder: Record<CandidateSource, number> = {
  popular: 0,
  active: 1,
  carry_over: 2,
};

function compareCandidateSource(
  left: CandidateSource,
  right: CandidateSource,
): number {
  return candidateSourceOrder[left] - candidateSourceOrder[right];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${stableStringify(entry)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareRepositoryId(
  left: RepositoryObservation,
  right: RepositoryObservation,
): number {
  return left.repositoryId.localeCompare(right.repositoryId, "en", {
    numeric: true,
  });
}

async function writeImmutable(path: string, content: string): Promise<void> {
  try {
    await stat(path);
    const existing = await readFile(path, "utf8");
    if (existing !== content) {
      throw new Error(`Completed snapshot is immutable: ${path}`);
    }
    return;
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
}

async function readTextOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function assertDate(date: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`Invalid snapshot date: ${date}`);
  }
}
