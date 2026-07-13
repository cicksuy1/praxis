// Resource intake for the Generator homepage: list candidate course folders under
// <repo>/resources, browse the filesystem (confined to a configurable root), and
// safely resolve an untrusted client source path. Deterministic; no model.
// Browse behavior ported from anything-coach/server/browse.ts + resources.ts.
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveInRepo, repoRoot } from "../files.ts";

export interface ResourceFolder {
  name: string;
  path: string;
  fileCount: number;
}

export interface BrowseEntry {
  name: string;
  path: string;
  fileCount: number;
}

export interface BrowseResult {
  root: string;
  path: string;
  parent: string | null; // null at the root (cannot go above it)
  entries: BrowseEntry[];
}

// Folders never worth picking as a course source.
const HIDE = new Set(["node_modules", "dist", "data", ".git"]);

/**
 * The root the Browse picker + source-dir validation are confined to. Defaults to
 * the repo, but GYM_BROWSE_ROOT widens it (e.g. to C:\Projects) so resources that
 * live OUTSIDE the repo can be picked.
 */
export function browseRoot(): string {
  return path.resolve(process.env.GYM_BROWSE_ROOT ?? repoRoot());
}

/** True when `target` is the root or a descendant of it (no traversal above). */
function within(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Count non-dot files directly inside a folder (mirrors ingestDir's filter). */
async function countFiles(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && !e.name.startsWith(".")).length;
  } catch {
    return 0;
  }
}

/** List candidate course folders under <repo>/resources. Missing dir → []. */
export async function scanResources(): Promise<ResourceFolder[]> {
  const dir = resolveInRepo("resources");
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: ResourceFolder[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    out.push({ name: e.name, path: abs, fileCount: await countFiles(abs) });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * List subfolders of `target` (default: the browse root), confined to the root.
 * A target outside the root clamps back to it — no traversal above the root.
 */
export async function browseDir(target?: string): Promise<BrowseResult> {
  const rootAbs = browseRoot();
  let cur = target ? path.resolve(target) : rootAbs;
  if (!within(rootAbs, cur)) cur = rootAbs;

  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fs.readdir(cur, { withFileTypes: true });
  } catch {
    cur = rootAbs;
    dirents = await fs.readdir(cur, { withFileTypes: true });
  }

  const entries: BrowseEntry[] = [];
  for (const d of dirents) {
    if (!d.isDirectory() || d.name.startsWith(".") || HIDE.has(d.name)) continue;
    const abs = path.join(cur, d.name);
    entries.push({ name: d.name, path: abs, fileCount: await countFiles(abs) });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const parentAbs = path.dirname(cur);
  const parent = cur !== rootAbs && within(rootAbs, parentAbs) ? parentAbs : null;
  return { root: rootAbs, path: cur, parent, entries };
}

/**
 * Resolve an untrusted client-supplied source path, confined to the browse root.
 * Returns the absolute path, or null if it escapes the root or is the root itself.
 */
export function resolveSourceDir(target: string): string | null {
  if (!target || typeof target !== "string") return null;
  const root = browseRoot();
  const abs = path.resolve(root, target);
  const rel = path.relative(root, abs);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}
