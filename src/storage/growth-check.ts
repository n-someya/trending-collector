import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const WARNING_BYTES = 500 * 1024 * 1024;
const HARD_BYTES = 1024 * 1024 * 1024;

export interface GrowthReport {
  immutableBytes: number;
  mutableBytes: number;
  totalBytes: number;
  observedDays: number;
  projectedAnnualBytes: number;
  exceedsWarningGate: boolean;
  exceedsHardGate: boolean;
}

export async function measureGrowth(root: string): Promise<GrowthReport> {
  const dataRoot = join(root, "data");
  const files = await listFiles(dataRoot);
  let immutableBytes = 0;
  let mutableBytes = 0;
  const observedDays = new Set<string>();

  for (const path of files) {
    const relativePath = relative(root, path);
    const bytes = (await stat(path)).size;
    if (relativePath.startsWith("data/state/")) {
      mutableBytes += bytes;
    } else {
      immutableBytes += bytes;
    }
    const match = relativePath.match(
      /^data\/runs\/(\d{4})\/(\d{2})\/(\d{2})\//,
    );
    if (match) {
      observedDays.add(`${match[1]}-${match[2]}-${match[3]}`);
    }
  }

  const projectedAnnualBytes =
    observedDays.size === 0
      ? 0
      : Math.round(
          (immutableBytes / observedDays.size + mutableBytes) * 365,
        );
  const totalBytes = immutableBytes + mutableBytes;
  return {
    immutableBytes,
    mutableBytes,
    totalBytes,
    observedDays: observedDays.size,
    projectedAnnualBytes,
    exceedsWarningGate:
      totalBytes >= WARNING_BYTES || projectedAnnualBytes >= WARNING_BYTES,
    exceedsHardGate: totalBytes >= HARD_BYTES,
  };
}

async function listFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
          ? listFiles(path)
          : Promise.resolve([path]);
      }),
    )
  ).flat();
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
