// Generation draft store (ADR-0012): the flow is plan → persisted proposal → confirm →
// emit. A draft holds the proposed (editable) CourseSpec plus the inputs needed to
// regenerate it, persisted under courses/.drafts/<id>/draft.json so a browser refresh
// on the proposal page never forces regeneration. Gitignored — drafts are scratch.
import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { resolveInRepo } from "../files.ts";
import { CourseSpecSchema, type CourseSpec, type Mode } from "./schema.ts";

export type DraftStatus = "proposed" | "emitted";

/** Everything needed to render the proposal and to regenerate it on demand. */
export interface DraftInput {
  label: string;
  mode: Mode;
  budgetTokens: number;
  sourceDir: string;
  spec: CourseSpec;
}

export interface Draft extends DraftInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: DraftStatus;
  emittedSlug?: string;
}

export interface DraftSummary {
  id: string;
  label: string;
  mode: Mode;
  modules: number;
  status: DraftStatus;
  updatedAt: string;
}

function draftsDir(): string {
  return resolveInRepo("courses/.drafts");
}
function draftDir(id: string): string {
  return path.join(draftsDir(), id);
}
function draftFile(id: string): string {
  return path.join(draftDir(id), "draft.json");
}

/** Draft ids are opaque; guard against path traversal from a request param. */
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

function nowIso(): string {
  return new Date().toISOString();
}

async function writeDraft(draft: Draft): Promise<Draft> {
  await mkdir(draftDir(draft.id), { recursive: true });
  await writeFile(draftFile(draft.id), `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  return draft;
}

/** Persist a fresh proposal and return it. */
export async function createDraft(input: DraftInput): Promise<Draft> {
  const ts = nowIso();
  return writeDraft({ ...input, id: randomUUID(), createdAt: ts, updatedAt: ts, status: "proposed" });
}

/** Load a draft from disk (no cache — a refresh always reflects the persisted state). */
export async function getDraft(id: string): Promise<Draft | null> {
  if (!isSafeId(id) || !existsSync(draftFile(id))) return null;
  try {
    return JSON.parse(await readFile(draftFile(id), "utf8")) as Draft;
  } catch {
    return null;
  }
}

/** Summaries of every persisted draft, newest first. */
export async function listDrafts(): Promise<DraftSummary[]> {
  if (!existsSync(draftsDir())) return [];
  const entries = await readdir(draftsDir(), { withFileTypes: true });
  const out: DraftSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const d = await getDraft(e.name);
    if (d) {
      out.push({ id: d.id, label: d.label, mode: d.mode, modules: d.spec.modules.length, status: d.status, updatedAt: d.updatedAt });
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type PatchResult = { ok: true; draft: Draft } | { ok: false; error: string };

/**
 * Apply proposal-page edits. A replacement `spec` is re-validated against the schema
 * (the same boundary the emitter trusts), so an invalid edit is rejected and the
 * persisted draft left untouched.
 */
export async function patchDraft(
  id: string,
  patch: { label?: string; spec?: CourseSpec; budgetTokens?: number },
): Promise<PatchResult> {
  const draft = await getDraft(id);
  if (!draft) return { ok: false, error: `draft not found: ${id}` };

  let spec = draft.spec;
  if (patch.spec !== undefined) {
    const parsed = CourseSpecSchema.safeParse(patch.spec);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    }
    spec = parsed.data;
  }
  const next: Draft = {
    ...draft,
    label: patch.label ?? draft.label,
    budgetTokens: patch.budgetTokens ?? draft.budgetTokens,
    spec,
    updatedAt: nowIso(),
  };
  return { ok: true, draft: await writeDraft(next) };
}

/** Mark a draft emitted once its Course has been written to the library. */
export async function markEmitted(id: string, slug: string): Promise<Draft | null> {
  const draft = await getDraft(id);
  if (!draft) return null;
  return writeDraft({ ...draft, status: "emitted", emittedSlug: slug, updatedAt: nowIso() });
}

/** Delete a draft directory. Returns false if it was not present. */
export async function deleteDraft(id: string): Promise<boolean> {
  if (!isSafeId(id) || !existsSync(draftDir(id))) return false;
  await rm(draftDir(id), { recursive: true, force: true });
  return true;
}
