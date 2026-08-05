import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { CollectionResult } from "../pipeline/collector-pipeline";
import { deterministicJson } from "./deterministic-json";
import { FileSnapshotRepository } from "./snapshot-repository";

export interface SavedArtifacts {
  paths: string[];
}

export class FileArtifactRepository {
  private readonly snapshots: FileSnapshotRepository;

  constructor(private readonly root: string) {
    this.snapshots = new FileSnapshotRepository(root);
  }

  async save(
    date: string,
    result: CollectionResult,
  ): Promise<SavedArtifacts> {
    const platform = result.snapshot.platform;
    const savedSnapshot = await this.snapshots.save(date, result.snapshot);
    const snapshotPath = relative(this.root, savedSnapshot.path);
    const metadataPath = snapshotPath.replace(/\.ndjson$/, ".meta.json");
    const paths = [snapshotPath, metadataPath];

    if (result.ranking) {
      const rankingPath = join(
        "data",
        "rankings",
        platform,
        ...date.split("-"),
      ).replace(/(\d{2})$/, "$1.json");
      await writeImmutable(
        join(this.root, rankingPath),
        `${deterministicJson(result.ranking)}\n`,
      );
      paths.push(rankingPath);
    }

    const runPath = join(
      "data",
      "runs",
      ...date.split("-"),
      `${platform}.json`,
    );
    await writeManifest(
      join(this.root, runPath),
      `${deterministicJson(result.manifest)}\n`,
    );
    paths.push(runPath);

    return { paths };
  }
}

async function writeImmutable(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  try {
    const existing = await readFile(path, "utf8");
    if (existing !== content) {
      throw new Error(`Completed artifact is immutable: ${path}`);
    }
    return;
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
}

async function writeManifest(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  try {
    const existingContent = await readFile(path, "utf8");
    if (existingContent === content) {
      return;
    }
    const existing = JSON.parse(existingContent) as { status?: string };
    if (existing.status === "complete") {
      throw new Error(`Completed run is immutable: ${path}`);
    }
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }
  await writeFile(path, content, "utf8");
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
