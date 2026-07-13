// The AI-Native Gym GUI server — a tunnel to the real conductor conversation.
// Bun.serve: serves the built frontend, the content API, and the SSE bridge.
// The conductor writes PROGRESS.local.md itself; the server only watches it and
// nudges clients (and the live conductor) when a module completes.
import { watch } from "node:fs";
import path from "node:path";
import { handleApi } from "./routes.ts";
import { broadcast, startTutor, notifyModuleComplete } from "./tutor.ts";
import { readProgress } from "./progress.ts";
import { allSlugs } from "./content.ts";
import { repoRoot } from "./files.ts";

const PORT = Number(process.env.GYM_PORT ?? 4600);
const PROGRESS_DEBOUNCE_MS = 300;
const DIST = path.join(import.meta.dir, "..", "web", "dist");

function completedSlugs(): Set<string> {
  try {
    return new Set(readProgress().completed.map((r) => r.module));
  } catch {
    return new Set();
  }
}

// Watch PROGRESS.local.md (the single source of truth the conductor writes).
function watchProgress(): void {
  try {
    let known = completedSlugs();
    let timer: ReturnType<typeof setTimeout> | undefined;
    watch(path.join(repoRoot(), "progress"), (_event, filename) => {
      if (filename !== "PROGRESS.local.md") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        broadcast("progress_changed", {});
        const now = completedSlugs();
        for (const slug of now) {
          if (!known.has(slug)) {
            broadcast("module_complete", { slug });
            broadcast("celebrate", { reason: "module_complete" });
            notifyModuleComplete(slug);
          }
        }
        known = now;
      }, PROGRESS_DEBOUNCE_MS);
    });
  } catch (err) {
    console.error("progress watch unavailable:", (err as Error).message);
  }
}

// Serve a built static asset, or the SPA shell for client routes.
async function serveStatic(pathname: string): Promise<Response> {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const file = Bun.file(path.join(DIST, rel));
  if (await file.exists()) return new Response(file);
  const shell = Bun.file(path.join(DIST, "index.html"));
  if (await shell.exists()) return new Response(shell);
  return new Response(
    "Praxis — frontend not built yet. Run `bun run build:web` (or `bun run dev:web` for live dev).",
    { status: 200, headers: { "Content-Type": "text/plain" } },
  );
}

Bun.serve({
  port: PORT,
  idleTimeout: 0, // keep SSE connections open
  async fetch(req) {
    const api = await handleApi(req);
    if (api) return api;
    if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    return serveStatic(new URL(req.url).pathname);
  },
});

console.log(`Praxis GUI on http://localhost:${PORT}`);
watchProgress();
// Resuming a conversation costs tokens, so we do NOT auto-warm on boot by
// default — a server restart should never silently spend. Opt in with
// GYM_WARM_ON_BOOT=1 to resume the learner's current module immediately.
if (process.env.GYM_WARM_ON_BOOT === "1") {
  startTutor(allSlugs()).catch((err) => console.error("tutor: startup failed:", (err as Error).message));
}
