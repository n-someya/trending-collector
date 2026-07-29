import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Platform } from "../domain/types";
import type { RawApiResponse } from "../platforms/api-request";
import { deterministicJson } from "./deterministic-json";

export class RawArtifactWriter {
  private sequence = 0;

  constructor(
    private readonly root: string,
    private readonly platform: Platform,
    private readonly date: string,
  ) {}

  async capture(response: RawApiResponse): Promise<void> {
    this.sequence += 1;
    const directory = join(this.root, "raw", this.platform, this.date);
    await mkdir(directory, { recursive: true });
    const fileName = `${String(this.sequence).padStart(6, "0")}.json`;
    await writeFile(
      join(directory, fileName),
      `${deterministicJson({
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        adapter: `${this.platform}-source-v1`,
        contentSha256: createHash("sha256")
          .update(response.body)
          .digest("hex"),
        ...response,
      })}\n`,
      "utf8",
    );
  }
}
