// Deterministic extraction (no model). .md/.txt/.markdown pass through; .docx via
// mammoth if present; unknown/failed files degrade gracefully with a per-file
// status so one bad file never fails the whole Course build.
// Ported from anything-coach/server/ingest.ts.
import { promises as fs } from "node:fs";
import path from "node:path";

export interface Extracted {
  name: string;
  content: string;
  status: "ok" | "unsupported" | "error";
  error?: string;
}

const PASSTHROUGH = new Set([".md", ".markdown", ".txt"]);

export async function extractFile(filePath: string): Promise<Extracted> {
  const name = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (PASSTHROUGH.has(ext)) {
      return { name, content: await fs.readFile(filePath, "utf8"), status: "ok" };
    }
    if (ext === ".docx") return await extractDocx(filePath, name);
    return { name, content: "", status: "unsupported" }; // pdf/pptx: pluggable later (M2)
  } catch (e) {
    return { name, content: "", status: "error", error: (e as Error).message };
  }
}

async function extractDocx(filePath: string, name: string): Promise<Extracted> {
  try {
    const mammoth = (await import("mammoth")) as unknown as {
      extractRawText(o: { path: string }): Promise<{ value: string }>;
    };
    const res = await mammoth.extractRawText({ path: filePath });
    return { name, content: res.value ?? "", status: "ok" };
  } catch (e) {
    return { name, content: "", status: "unsupported", error: (e as Error).message };
  }
}

/** Extract every top-level, non-dot file in a folder. Never throws on a bad file. */
export async function ingestDir(sourceDir: string): Promise<Extracted[]> {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const out: Extracted[] = [];
  for (const e of entries) {
    if (e.isFile() && !e.name.startsWith(".")) {
      out.push(await extractFile(path.join(sourceDir, e.name)));
    }
  }
  return out;
}
