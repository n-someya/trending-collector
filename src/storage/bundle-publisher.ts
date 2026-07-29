import {
  copyFile,
  mkdir,
  readdir,
  readFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export async function publishBundle(
  inputRoot: string,
  targetRoot: string,
): Promise<string[]> {
  const files = [
    ...(await listRelativeFiles(join(inputRoot, "data"), inputRoot)),
    ...(await listRelativeFiles(
      join(inputRoot, "config", "watchlists"),
      inputRoot,
    )),
  ].sort();

  for (const path of files) {
    const source = join(inputRoot, path);
    const target = join(targetRoot, path);
    const incoming = await readFile(source);
    const existing = await readOptional(target);
    if (!existing || existing.equals(incoming) || isMutablePath(path)) {
      continue;
    }
    const runPath = associatedRunPath(path);
    if (runPath) {
      const run = await readJsonOptional(join(targetRoot, runPath));
      if (run?.status === "complete") {
        throw new Error(`Completed run is immutable: ${runPath}`);
      }
    } else {
      throw new Error(`Artifact is immutable: ${path}`);
    }
  }

  for (const path of files) {
    const source = join(inputRoot, path);
    const target = join(targetRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }

  return files;
}

async function listRelativeFiles(
  directory: string,
  root: string,
): Promise<string[]> {
  return (await listFiles(directory)).map((path) => relative(root, path));
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
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : Promise.resolve([path]);
    }),
  );
  return nested.flat();
}

function associatedRunPath(path: string): string | null {
  const parts = path.split("/");
  if (parts[0] !== "data") {
    return null;
  }
  if (parts[1] === "runs") {
    return path;
  }
  if (parts[1] !== "snapshots" && parts[1] !== "rankings") {
    return null;
  }
  const [, , platform, year, month, fileName] = parts;
  const day = fileName?.slice(0, 2);
  return platform && year && month && day
    ? join("data", "runs", year, month, day, `${platform}.json`)
    : null;
}

function isMutablePath(path: string): boolean {
  return (
    path.startsWith("data/state/") ||
    path.startsWith("config/watchlists/")
  );
}

async function readOptional(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }
}

async function readJsonOptional(
  path: string,
): Promise<{ status?: string } | null> {
  const content = await readOptional(path);
  return content ? (JSON.parse(content.toString()) as { status?: string }) : null;
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
