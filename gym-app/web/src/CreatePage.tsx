import { useEffect, useState, type CSSProperties } from "react";
import { api, subscribe, type ResourceFolder, type BrowseResult, type CourseEntry } from "./api.ts";

interface CreatePageProps {
  onDone: (firstSlug: string | null) => void;
  onOpenCourse: (slug: string) => void;
  onBack: () => void;
}

type Phase = "idle" | "running" | "done" | "error";
interface BuiltCourse {
  label: string;
  modules: number;
  firstSlug: string | null;
}

/** Human line for a course_progress SSE event that carries a phase (not an activity). */
function phaseLine(d: Record<string, any>): string {
  switch (d.phase) {
    case "ingesting":
      return "📥 Reading source files…";
    case "ingested":
      return `📄 ${d.ok}/${d.files} file(s) usable.`;
    case "planning":
      return d.attempt > 1 ? "🧠 Re-planning after validation feedback…" : "🧠 Planning the course…";
    case "validated":
      return `🧩 Plan validated — ${d.modules} module(s).`;
    case "invalid":
      return `⚠️ Plan invalid (${d.error}) — retrying…`;
    case "emitting":
      return `💾 Writing ${d.modules} module(s)…`;
    default:
      return String(d.phase ?? "");
  }
}

/** Last path segment, for defaulting the course name from a picked folder. */
function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

export function CreatePage({ onDone, onOpenCourse, onBack }: CreatePageProps) {
  const [courses, setCourses] = useState<CourseEntry[]>([]);
  const [folders, setFolders] = useState<ResourceFolder[]>([]);
  const [sourceDir, setSourceDir] = useState("");
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [built, setBuilt] = useState<BuiltCourse | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);

  const loadCourses = () => {
    api.courses().then((r) => setCourses(r.courses)).catch(() => {});
  };

  useEffect(() => {
    api.resources().then((r) => setFolders(r.folders)).catch(() => {});
    loadCourses();
  }, []);

  // Subscribe to build progress + tick an elapsed clock while a build runs, so
  // there's always visible liveness even during the planner's silent thinking gaps.
  useEffect(() => {
    if (phase !== "running") return;
    setElapsed(0);
    const clock = setInterval(() => setElapsed((s) => s + 1), 1000);
    const push = (line: string) => setLog((l) => [...l, line]);
    const unsub = subscribe({
      course_progress: (d) => push(d.activity ? d.activity : phaseLine(d)),
      course_done: (d) => {
        push(`✅ Built "${d.label}" — ${d.modules} module(s).`);
        setBuilt({ label: d.label, modules: d.modules, firstSlug: d.firstSlug ?? null });
        setPhase("done");
        loadCourses();
      },
      course_error: (d) => {
        setError(d.error ?? "generation failed");
        setPhase("error");
      },
    });
    return () => {
      clearInterval(clock);
      unsub();
    };
  }, [phase]);

  const setSource = (dir: string) => {
    setSourceDir(dir);
    setLabel((cur) => cur || baseName(dir));
  };

  const navigate = async (dir?: string) => {
    try {
      setBrowse(await api.browse(dir));
      setBrowseOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const pick = (dir: string) => {
    setSource(dir);
    setBrowseOpen(false);
  };

  const removeCourse = async (slug: string) => {
    try {
      await api.deleteCourse(slug);
    } finally {
      loadCourses();
    }
  };

  const generate = () => {
    const dir = sourceDir.trim();
    const lbl = label.trim();
    if (!dir || !lbl) return;
    setLog([]);
    setError("");
    setBuilt(null);
    setPhase("running");
    api.generateCourse(dir, lbl).catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    });
  };

  const running = phase === "running";
  const canGenerate = !running && Boolean(sourceDir.trim()) && Boolean(label.trim());
  const statusLine = log.length ? log[log.length - 1] : "Working…";

  // Success screen — the build finished; let the learner choose to enter.
  if (phase === "done" && built) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, alignItems: "center", textAlign: "center", gap: 18 }}>
          <div style={{ fontSize: 44 }}>🎉</div>
          <h1 style={{ margin: 0 }}>“{built.label}” is ready</h1>
          <p style={{ opacity: 0.7, margin: 0 }}>
            {built.modules} module{built.modules === 1 ? "" : "s"} built and saved to your courses. The
            coach will teach it and gate you on evidence.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={primaryBtn} onClick={() => onDone(built.firstSlug)}>
              Start learning →
            </button>
            <button
              style={ghostBtn}
              onClick={() => {
                setPhase("idle");
                setLog([]);
                setBuilt(null);
              }}
            >
              Build another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <style>{`
        @keyframes praxis-spin { to { transform: rotate(360deg); } }
        @keyframes praxis-pulse { 0%,100% { opacity: 1 } 50% { opacity: .4 } }
      `}</style>
      <div style={cardStyle}>
        <header style={headerStyle}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>Praxis</h1>
            <p style={{ margin: "4px 0 0", opacity: 0.7 }}>
              Drop source material → get a Course you can actually be tested on.
            </p>
          </div>
          {courses.length > 0 && (
            <button style={ghostBtn} onClick={onBack} disabled={running}>
              Skip to learning →
            </button>
          )}
        </header>

        {courses.length > 0 && (
          <section>
            <h2 style={h2Style}>Your courses</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {courses.map((c) => (
                <div key={c.slug} style={courseCard}>
                  <div style={{ fontWeight: 600 }}>{c.label}</div>
                  <div style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>{c.moduleCount} module(s)</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    <button style={primarySmall} onClick={() => onOpenCourse(c.slug)}>
                      Open
                    </button>
                    <button style={dangerSmall} onClick={() => removeCourse(c.slug)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <h2 style={{ ...h2Style, marginTop: 4 }}>Generate a new course</h2>

        <section>
          <h3 style={h3Style}>1 · Pick a resource folder</h3>
          {folders.length === 0 ? (
            <p style={{ opacity: 0.6 }}>
              No folders under <code>resources/</code> yet — use <strong>Browse…</strong> below to pick any
              folder, or drop docs (.md / .txt / .docx) into <code>resources/&lt;name&gt;/</code>.
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {folders.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setSource(f.path)}
                  disabled={running}
                  style={f.path === sourceDir ? folderBtnActive : folderBtn}
                >
                  <strong>{f.name}</strong>
                  <span style={{ opacity: 0.6, marginLeft: 6 }}>{f.fileCount} file(s)</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 style={h3Style}>2 · Confirm source + name</h3>
          <label style={fieldLabel}>Source folder</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={sourceDir}
              placeholder="pick a folder, or type a path"
              onChange={(e) => setSourceDir(e.target.value)}
              disabled={running}
            />
            <button
              style={ghostBtn}
              disabled={running}
              onClick={() => (browseOpen ? setBrowseOpen(false) : navigate(sourceDir || undefined))}
            >
              {browseOpen ? "Close" : "Browse…"}
            </button>
          </div>

          {browseOpen && browse && (
            <div style={browsePanel}>
              <div style={browseHead}>
                <span style={{ opacity: 0.6, fontSize: 12, wordBreak: "break-all" }} title={browse.path}>
                  {browse.path}
                </span>
                <button style={linkBtn} onClick={() => pick(browse.path)}>
                  Use this folder
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
                {browse.parent !== null && (
                  <button style={browseRow} onClick={() => navigate(browse.parent ?? undefined)}>
                    ⬆ ..
                  </button>
                )}
                {browse.entries.length === 0 && browse.parent === null && (
                  <p style={{ opacity: 0.6, margin: 0 }}>No subfolders here.</p>
                )}
                {browse.entries.map((e) => (
                  <div key={e.path} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button style={{ ...browseRow, flex: 1, textAlign: "left" }} onClick={() => navigate(e.path)}>
                      📁 {e.name}
                      <span style={{ opacity: 0.5, marginLeft: 6 }}>· {e.fileCount} file(s)</span>
                    </button>
                    <button style={linkBtn} onClick={() => pick(e.path)}>
                      Use
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <label style={fieldLabel}>Course name</label>
          <input
            style={inputStyle}
            value={label}
            placeholder="My Topic"
            onChange={(e) => setLabel(e.target.value)}
            disabled={running}
          />
        </section>

        {!running && (
          <button style={{ ...primaryBtn, opacity: canGenerate ? 1 : 0.5 }} onClick={generate} disabled={!canGenerate}>
            Generate course
          </button>
        )}

        {running && (
          <div style={statusBar}>
            <span style={spinner} />
            <span style={{ animation: "praxis-pulse 1.6s ease-in-out infinite" }}>{statusLine}</span>
            <span style={{ opacity: 0.55, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
              {elapsed}s
            </span>
          </div>
        )}

        {(log.length > 0 || error) && (
          <section>
            <h3 style={h3Style}>Build log</h3>
            <div style={logStyle}>
              {log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              {error && <div style={{ color: "#e5484d" }}>❌ {error}</div>}
            </div>
            {phase === "error" && (
              <button style={{ ...ghostBtn, marginTop: 10 }} onClick={() => setPhase("idle")}>
                ← Back to edit
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  padding: "40px 20px",
  overflowY: "auto",
};
const cardStyle: CSSProperties = {
  width: "min(720px, 100%)",
  display: "flex",
  flexDirection: "column",
  gap: 22,
};
const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
};
const h2Style: CSSProperties = {
  fontSize: 15,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  opacity: 0.7,
  marginBottom: 10,
};
const h3Style: CSSProperties = { fontSize: 14, opacity: 0.85, marginBottom: 8 };
const fieldLabel: CSSProperties = { display: "block", fontSize: 13, opacity: 0.7, margin: "10px 0 4px" };
const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid rgba(128,128,128,0.4)",
  background: "transparent",
  color: "inherit",
  font: "inherit",
};
const folderBtn: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(128,128,128,0.35)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};
const folderBtnActive: CSSProperties = { ...folderBtn, borderColor: "#3b82f6", background: "rgba(59,130,246,0.12)" };
const courseCard: CSSProperties = {
  minWidth: 180,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(128,128,128,0.3)",
  background: "rgba(128,128,128,0.05)",
};
const primaryBtn: CSSProperties = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "none",
  background: "#3b82f6",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  alignSelf: "flex-start",
};
const primarySmall: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "none",
  background: "#3b82f6",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
const dangerSmall: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid rgba(229,72,77,0.5)",
  background: "transparent",
  color: "#e5484d",
  cursor: "pointer",
};
const ghostBtn: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid rgba(128,128,128,0.35)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const statusBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid rgba(59,130,246,0.4)",
  background: "rgba(59,130,246,0.08)",
  fontWeight: 500,
};
const spinner: CSSProperties = {
  width: 15,
  height: 15,
  borderRadius: "50%",
  border: "2px solid rgba(128,128,128,0.35)",
  borderTopColor: "#3b82f6",
  animation: "praxis-spin .8s linear infinite",
  flexShrink: 0,
};
const browsePanel: CSSProperties = {
  marginTop: 10,
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(128,128,128,0.35)",
  background: "rgba(128,128,128,0.06)",
};
const browseHead: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};
const browseRow: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
};
const linkBtn: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "none",
  background: "transparent",
  color: "#3b82f6",
  cursor: "pointer",
  whiteSpace: "nowrap",
  font: "inherit",
};
const logStyle: CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 13,
  lineHeight: 1.7,
  padding: 14,
  borderRadius: 10,
  background: "rgba(128,128,128,0.1)",
  maxHeight: 260,
  overflowY: "auto",
};
