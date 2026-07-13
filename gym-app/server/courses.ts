// Course library (see plan "Course Library"). Every generated Course is kept as a
// canonical entry under courses/<slug>/; the repo ROOT is a *mirror* of the single
// active course (what content.ts/progress.ts/the Conductor already read). Selecting
// a course snapshots the current root's learner progress back to its library entry,
// then copies the chosen entry to root. This keeps the whole Conductor/content/
// progress machinery unchanged — they still just read root.
import { cp, mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolveInRepo } from "./files.ts";
import { invalidate } from "./content.ts";

export interface CourseEntry {
  slug: string;
  label: string;
  moduleCount: number;
  createdAt: string;
}

interface Manifest {
  courses: CourseEntry[];
}

const PROGRESS_TEMPLATES = ["PROGRESS.template.md", "NOTES.template.md", "STRATEGY.template.md"];

function coursesDir(): string {
  return resolveInRepo("courses");
}
function entryDir(slug: string): string {
  return resolveInRepo(`courses/${slug}`);
}
function manifestPath(): string {
  return resolveInRepo("courses/manifest.json");
}
function activePath(): string {
  return resolveInRepo(".active-course");
}

// ---- slug ------------------------------------------------------------------

function baseSlug(label: string): string {
  const s = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "course";
}

/** Turn a label into a UNIQUE kebab slug (append -2, -3, … on collision). */
export async function slugify(label: string): Promise<string> {
  const base = baseSlug(label);
  const taken = new Set((await loadManifest()).courses.map((c) => c.slug));
  if (!taken.has(base) && !existsSync(entryDir(base))) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`) || existsSync(entryDir(`${base}-${i}`))) i++;
  return `${base}-${i}`;
}

// ---- manifest --------------------------------------------------------------

async function loadManifest(): Promise<Manifest> {
  try {
    const parsed = JSON.parse(await readFile(manifestPath(), "utf8")) as Manifest;
    return Array.isArray(parsed.courses) ? parsed : { courses: [] };
  } catch {
    return { courses: [] };
  }
}

async function saveManifest(m: Manifest): Promise<void> {
  await mkdir(coursesDir(), { recursive: true });
  const tmp = resolveInRepo(`courses/.manifest.${process.pid}.tmp`);
  await writeFile(tmp, `${JSON.stringify(m, null, 2)}\n`, "utf8");
  await rename(tmp, manifestPath());
}

/** List library courses, sorted by label. */
export async function listCourses(): Promise<CourseEntry[]> {
  const m = await loadManifest();
  return [...m.courses].sort((a, b) => a.label.localeCompare(b.label));
}

/** Upsert a manifest entry (idempotent by slug). */
export async function registerCourse(entry: CourseEntry): Promise<void> {
  const m = await loadManifest();
  await saveManifest({ courses: [...m.courses.filter((c) => c.slug !== entry.slug), entry] });
}

// ---- active course ---------------------------------------------------------

export async function getActive(): Promise<string | null> {
  try {
    const j = JSON.parse(await readFile(activePath(), "utf8"));
    return typeof j?.slug === "string" ? j.slug : null;
  } catch {
    return null;
  }
}

async function setActive(slug: string | null): Promise<void> {
  await writeFile(activePath(), `${JSON.stringify({ slug }, null, 2)}\n`, "utf8");
}

// ---- select / delete -------------------------------------------------------

/** Copy `progress/` from `fromDir` to `toDir`, replacing any existing one. */
async function mirrorProgress(fromDir: string, toDir: string): Promise<void> {
  const from = path.join(fromDir, "progress");
  if (!existsSync(from)) return;
  const to = path.join(toDir, "progress");
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
}

/**
 * Make `slug` the active course: snapshot the current root's learner progress back
 * to the previously-active library entry, then mirror the chosen entry onto root.
 */
export async function selectCourse(slug: string): Promise<{ ok: boolean; error?: string }> {
  const dir = entryDir(slug);
  if (!existsSync(dir)) return { ok: false, error: `course not found: ${slug}` };

  const active = await getActive();
  if (active === slug) return { ok: true }; // already mirrored to root

  // 1. snapshot root progress back to the outgoing course.
  if (active && existsSync(entryDir(active))) {
    await mirrorProgress(resolveInRepo("."), entryDir(active));
  }

  // 2. clear the active-course content at root.
  await rm(resolveInRepo("CURRICULUM.md"), { force: true });
  await rm(resolveInRepo("modules"), { recursive: true, force: true });
  await rm(resolveInRepo("progress"), { recursive: true, force: true });

  // 3. mirror the chosen entry onto root.
  await cp(path.join(dir, "CURRICULUM.md"), resolveInRepo("CURRICULUM.md"));
  if (existsSync(path.join(dir, "modules"))) {
    await cp(path.join(dir, "modules"), resolveInRepo("modules"), { recursive: true });
  }
  if (existsSync(path.join(dir, "progress"))) {
    await cp(path.join(dir, "progress"), resolveInRepo("progress"), { recursive: true });
  }

  await setActive(slug);
  invalidate(); // content.ts re-reads the newly mirrored curriculum
  return { ok: true };
}

/** Remove a library course. Idempotent; unknown slug → false. */
export async function deleteCourse(slug: string): Promise<boolean> {
  const m = await loadManifest();
  const existed = m.courses.some((c) => c.slug === slug);
  if (existed) await saveManifest({ courses: m.courses.filter((c) => c.slug !== slug) });
  await rm(entryDir(slug), { recursive: true, force: true });
  if ((await getActive()) === slug) await setActive(null);
  return existed;
}

export { PROGRESS_TEMPLATES };
