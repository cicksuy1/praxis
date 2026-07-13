// Curriculum + lesson/exercise parsing (see CONTRACT.md).
// Parses CURRICULUM.md's module table and reads each module's "modules/<n>.<slug>/"
// folder: lesson.md + (optional) drill.md + challenge.md + scorecard.md.
// The conductor conversation owns all teaching/grading; this is read-only content.
import { existsSync } from "node:fs";
import { readRepoFile, resolveInRepo } from "./files.ts";

export interface Module {
  number: number;
  title: string;
  slug: string;
  principle: string;
  written: boolean;
  hasExercise: boolean;
  isSpine: boolean;
}

// | # | Module | `slug` | Core principle | Status |  — slug is fenced in backticks.
const ROW_RE =
  /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/gm;

let cache: Module[] | null = null;

/** Clear the parse cache (tests). */
export function invalidate(): void {
  cache = null;
}

/** Strip markdown emphasis and the spine star from a title cell. */
function cleanTitle(raw: string): string {
  return raw.replace(/\*\*/g, "").replace(/⭐/g, "").replace(/\s+/g, " ").trim();
}

/** Parse CURRICULUM.md's module table into Module records. */
export function parseCurriculum(): Module[] {
  if (cache) return cache;
  const text = readRepoFile("CURRICULUM.md");
  const modules: Module[] = [];
  ROW_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROW_RE.exec(text)) !== null) {
    const slug = m[3].trim();
    const rawTitle = m[2];
    const number = Number(m[1]);
    // Each module's material lives in one number-prefixed folder, kept in order.
    const dir = `modules/${number}.${slug}`;
    modules.push({
      number,
      title: cleanTitle(rawTitle),
      slug,
      principle: m[4].trim(),
      written: existsSync(resolveInRepo(`${dir}/lesson.md`)),
      hasExercise: existsSync(resolveInRepo(`${dir}/challenge.md`)),
      isSpine: rawTitle.includes("⭐"),
    });
  }
  cache = modules;
  return modules;
}

/** Flat list of every known slug (the path-traversal allow-list). */
export function allSlugs(): string[] {
  return parseCurriculum().map((mod) => mod.slug);
}

/** Find a module by slug, or null. */
export function findModule(slug: string): Module | null {
  return parseCurriculum().find((mod) => mod.slug === slug) ?? null;
}

/**
 * On-disk folder holding all of a module's material, "modules/<number>.<slug>"
 * (lesson.md + optional drill.md + challenge.md + scorecard.md). The number
 * prefix keeps folders sorted in curriculum order. null if the slug is unknown.
 */
function moduleDir(slug: string): string | null {
  const mod = findModule(slug);
  return mod ? `modules/${mod.number}.${slug}` : null;
}

/**
 * Parse numbered recall questions from the "## 🧠 Active recall" section.
 * Items are "N. text" with multi-line continuation, until --- or the next ##.
 */
export function parseRecallQuestions(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+.*Active recall/i.test(l));
  if (start === -1) return [];

  const questions: string[] = [];
  let buf: string | null = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^---\s*$/.test(line) || /^##\s/.test(line)) break;
    const item = line.match(/^\s*\d+\.\s+(.*)$/);
    if (item) {
      if (buf !== null) questions.push(buf.trim());
      buf = item[1]!;
    } else if (buf !== null && line.trim() !== "") {
      buf += ` ${line.trim()}`;
    }
  }
  if (buf !== null) questions.push(buf.trim());
  return questions;
}

export interface Lesson {
  slug: string;
  markdown: string;
  recallQuestions: string[];
  hasDrill: boolean;
  hasChallenge: boolean;
}

/** Load a lesson: full markdown, recall questions, and which exercises exist. */
export function getLesson(slug: string): Lesson {
  const dir = moduleDir(slug);
  const markdown = readRepoFile(`${dir}/lesson.md`);
  return {
    slug,
    markdown,
    recallQuestions: parseRecallQuestions(markdown),
    hasDrill: dir !== null && existsSync(resolveInRepo(`${dir}/drill.md`)),
    hasChallenge: dir !== null && existsSync(resolveInRepo(`${dir}/challenge.md`)),
  };
}

/** Read a module's practice drill, or null if it has none. */
export function getDrill(slug: string): { slug: string; markdown: string } | null {
  const dir = moduleDir(slug);
  if (!dir) return null;
  const rel = `${dir}/drill.md`;
  if (!existsSync(resolveInRepo(rel))) return null;
  return { slug, markdown: readRepoFile(rel) };
}

/** Read a module's challenge mission + scorecard, or null if it has none. */
export function getChallenge(
  slug: string,
): { slug: string; mission: string; scorecard: string } | null {
  const dir = moduleDir(slug);
  if (!dir) return null;
  const missionRel = `${dir}/challenge.md`;
  if (!existsSync(resolveInRepo(missionRel))) return null;
  const scorecardRel = `${dir}/scorecard.md`;
  return {
    slug,
    mission: readRepoFile(missionRel),
    scorecard: existsSync(resolveInRepo(scorecardRel)) ? readRepoFile(scorecardRel) : "",
  };
}
