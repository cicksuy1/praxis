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
    // convertToMarkdown (not extractRawText) so Word heading styles survive as `#`
    // headings — the section tree can then segment on them (ADR-0008 Tier 2).
    const mammoth = (await import("mammoth")) as unknown as {
      convertToMarkdown(o: { path: string }): Promise<{ value: string }>;
    };
    const res = await mammoth.convertToMarkdown({ path: filePath });
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

// ---- section tree (ADR-0008 / ADR-0010) ------------------------------------
//
// A verbatim slice of the source plus where it came from — the structural unit the
// planner turns into Modules. Guide mode never rewrites `content`; it is emitted
// as-is (see emit.ts `moduleBody`). `line`/`headingPath` map onto the schema's
// heading Locator; `confidence` mirrors ADR-0008's read / inferred / none signal.

/** How trustworthy the segmentation is: native md headings (`read`) > docx style
 * mapping (`inferred`) > no structure at all (`none`, one whole-doc slice). */
export type SegmentConfidence = "read" | "inferred" | "none";

export interface Section {
  title: string;
  content: string; // verbatim slice, heading line included
  headingPath: string[]; // ancestor headings incl. this one; [] for a pre-heading slice
  line: number; // 1-based line of the heading; 0 for preamble / whole-doc
  words: number;
  tokens: number;
  confidence: SegmentConfidence;
  oversize: boolean; // tokens > MAX_SPLIT_TOKENS — flagged for the proposal, not hard-cut
}

// Granularity = a context budget, not an aesthetic (ADR-0010). The evidence-safe band is
// ~2K–8K tokens per Module conversation; below MIN_MERGE_WORDS a slice is merged into a
// neighbour, above MAX_SPLIT_TOKENS it is flagged oversize for the user to split.
export const TARGET_MIN_TOKENS = 2000;
export const TARGET_MAX_TOKENS = 8000;
export const MAX_SPLIT_TOKENS = 8000;
export const MIN_MERGE_WORDS = 500;
/** Rough English prose ratio (~1.33 tokens/word); good enough for budgeting, not billing. */
const WORDS_PER_TOKEN = 0.75;

const ATX_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function estimateTokens(text: string): number {
  return Math.ceil(countWords(text) / WORDS_PER_TOKEN);
}

function makeSection(
  title: string,
  content: string,
  headingPath: string[],
  line: number,
  confidence: SegmentConfidence,
): Section {
  const words = countWords(content);
  const tokens = Math.ceil(words / WORDS_PER_TOKEN);
  return {
    title,
    content: content.trim(),
    headingPath,
    line,
    words,
    tokens,
    confidence,
    oversize: tokens > MAX_SPLIT_TOKENS,
  };
}

/**
 * Split markdown into a verbatim section per ATX heading. Ancestor headings form the
 * path; a pre-heading preamble becomes a line-0 slice. Text with no headings degrades
 * to a single whole-doc section flagged `none` (ADR-0008 Tier 4).
 */
export function segmentMarkdown(text: string, baseConfidence: SegmentConfidence): Section[] {
  const lines = text.split(/\r?\n/);
  const heads: { idx: number; level: number; title: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(ATX_HEADING);
    if (m) heads.push({ idx: i, level: m[1]!.length, title: m[2]!.trim() });
  }

  if (heads.length === 0) {
    return [makeSection(firstLineTitle(text), text, [], 0, "none")];
  }

  const sections: Section[] = [];
  // Preamble before the first heading, if it holds real content.
  const preamble = lines.slice(0, heads[0]!.idx).join("\n");
  if (preamble.trim()) {
    sections.push(makeSection(firstLineTitle(preamble), preamble, [], 0, baseConfidence));
  }

  const stack: { level: number; title: string }[] = [];
  for (let h = 0; h < heads.length; h++) {
    const { idx, level, title } = heads[h]!;
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    stack.push({ level, title });
    const end = h + 1 < heads.length ? heads[h + 1]!.idx : lines.length;
    const content = lines.slice(idx, end).join("\n");
    sections.push(
      makeSection(title, content, stack.map((s) => s.title), idx + 1, baseConfidence),
    );
  }
  return sections;
}

function firstLineTitle(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim());
  const t = (first ?? "").replace(/^#+\s*/, "").trim();
  return t.length > 80 ? `${t.slice(0, 77)}...` : t || "Untitled";
}

function mergeInto(anchor: Section, next: Section): Section {
  // The anchor keeps its locator/title/confidence; the neighbour's text is appended so
  // nothing is dropped. Word/token/oversize are recomputed from the combined body.
  const merged = makeSection(
    anchor.title,
    `${anchor.content}\n\n${next.content}`,
    anchor.headingPath,
    anchor.line,
    anchor.confidence,
  );
  return merged;
}

/**
 * Fold undersized slices (< MIN_MERGE_WORDS) into the preceding slice so every Module
 * carries enough to be worth a conversation, and flag any slice over MAX_SPLIT_TOKENS
 * as oversize (the user opts into splitting on the proposal page, ADR-0010). Splitting
 * is never done silently here.
 */
export function normalizeSections(sections: Section[]): Section[] {
  const out: Section[] = [];
  for (const s of sections) {
    const prev = out[out.length - 1];
    if (prev && prev.words < MIN_MERGE_WORDS) out[out.length - 1] = mergeInto(prev, s);
    else out.push({ ...s });
  }
  // A trailing runt with nowhere forward to grow folds back into its predecessor.
  if (out.length >= 2 && out[out.length - 1]!.words < MIN_MERGE_WORDS) {
    const last = out.pop()!;
    out[out.length - 1] = mergeInto(out[out.length - 1]!, last);
  }
  return out;
}

export interface SectionedFile {
  name: string;
  status: Extracted["status"];
  sections: Section[];
  error?: string;
}

/** Extract one file into a normalized section tree. md/txt = `read`, docx = `inferred`. */
export async function extractSections(filePath: string): Promise<SectionedFile> {
  const ext = path.extname(filePath).toLowerCase();
  const extracted = await extractFile(filePath);
  if (extracted.status !== "ok") {
    return { name: extracted.name, status: extracted.status, sections: [], error: extracted.error };
  }
  const base: SegmentConfidence = ext === ".docx" ? "inferred" : "read";
  const sections = normalizeSections(segmentMarkdown(extracted.content, base));
  return { name: extracted.name, status: "ok", sections };
}

/** Section-tree counterpart to ingestDir: every top-level, non-dot file, segmented. */
export async function ingestSections(sourceDir: string): Promise<SectionedFile[]> {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const out: SectionedFile[] = [];
  for (const e of entries) {
    if (e.isFile() && !e.name.startsWith(".")) {
      out.push(await extractSections(path.join(sourceDir, e.name)));
    }
  }
  return out;
}
