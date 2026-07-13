// Repo file IO — the one place that knows where the gym repo root is.
// All content/progress modules read through here so tests can point the whole
// app at a seeded temp repo via GYM_REPO_ROOT.
import { readFileSync } from "node:fs";
import path from "node:path";

// gym-app lives at <repo>/gym-app, so the repo root is one level up — unless a
// test overrides it. Re-resolved per call so tests can set the env mid-process.
export function repoRoot(): string {
  if (process.env.GYM_REPO_ROOT) return path.resolve(process.env.GYM_REPO_ROOT);
  return path.resolve(import.meta.dir, "..", "..");
}

/** Resolve a repo-relative path to an absolute one. */
export function resolveInRepo(rel: string): string {
  return path.resolve(repoRoot(), rel);
}

/** Read a repo-relative file as UTF-8. Throws if missing (callers decide). */
export function readRepoFile(rel: string): string {
  return readFileSync(resolveInRepo(rel), "utf8");
}
