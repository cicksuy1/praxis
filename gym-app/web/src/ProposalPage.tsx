import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  api,
  subscribe,
  type Coverage,
  type Draft,
  type DraftModule,
  type DraftSpec,
  type Locator,
} from "./api.ts";

interface ProposalPageProps {
  draftId: string;
  onConfirmed: (firstSlug: string | null) => void;
  onDiscard: () => void;
}

type Busy = "confirm" | "regenerate" | "save" | null;

/** Human context for where a guide-mode slice came from (ADR-0011). */
function locatorText(loc?: Locator): string | null {
  if (!loc) return null;
  if (loc.kind === "page") return `p. ${loc.page}`;
  const path = loc.headingPath.join(" › ");
  return path ? `${path} · line ${loc.line}` : `line ${loc.line}`;
}

/** The reading body for a Module — verbatim resource (guide) or authored lesson (author). */
function bodyOf(m: DraftModule): string {
  return (m.resource ?? m.lesson ?? "").trim();
}

function snippet(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function ProposalPage({ draftId, onConfirmed, onDiscard }: ProposalPageProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [actionError, setActionError] = useState("");
  const [regenLog, setRegenLog] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  // Original recall per module number, so toggling reference→internalise restores questions.
  const [originalRecall, setOriginalRecall] = useState<Record<number, string[]>>({});

  const applyLoaded = useCallback((d: Draft) => {
    setDraft(d);
    setOriginalRecall(Object.fromEntries(d.spec.modules.map((m) => [m.number, m.recall])));
    setDirty(false);
  }, []);

  const load = useCallback(() => {
    setLoadError("");
    api
      .getDraft(draftId)
      .then(applyLoaded)
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [draftId, applyLoaded]);

  useEffect(() => {
    load();
  }, [load]);

  // While a re-plan runs, stream progress and swap in the fresh draft when it lands.
  useEffect(() => {
    if (busy !== "regenerate") return;
    const push = (line: string) => setRegenLog((l) => [...l, line]);
    const unsub = subscribe({
      course_progress: (d) => push(d.activity ? d.activity : String(d.phase ?? "")),
      course_proposed: () => {
        setBusy(null);
        setRegenLog([]);
        load();
      },
      course_error: (d) => {
        setActionError(d.error ?? "regeneration failed");
        setBusy(null);
      },
    });
    return unsub;
  }, [busy, load]);

  // ---- edits ----
  const setCoverage = (number: number, coverage: Coverage) => {
    setDraft((cur) => {
      if (!cur) return cur;
      const modules = cur.spec.modules.map((m) => {
        if (m.number !== number) return m;
        // reference is ungated (no recall); internalise restores its original questions.
        const recall = coverage === "reference" ? [] : originalRecall[number] ?? m.recall;
        return { ...m, coverage, recall };
      });
      return { ...cur, spec: { ...cur.spec, modules } };
    });
    setDirty(true);
  };

  const saveEdits = () => {
    if (!draft) return;
    setBusy("save");
    setActionError("");
    api
      .patchDraft(draft.id, { label: draft.label, spec: draft.spec })
      .then((d) => {
        applyLoaded(d);
        setBusy(null);
      })
      .catch((e) => {
        setActionError(e instanceof Error ? e.message : String(e));
        setBusy(null);
      });
  };

  const regenerate = () => {
    if (!draft) return;
    if (!window.confirm("Re-plan this course from the source? The current proposal will be replaced (costs tokens).")) {
      return;
    }
    setActionError("");
    setRegenLog([]);
    setBusy("regenerate");
    api.regenerateDraft(draft.id).catch((e) => {
      setActionError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    });
  };

  const confirm = () => {
    if (!draft) return;
    setBusy("confirm");
    setActionError("");
    const finish = () =>
      api
        .confirmDraft(draft.id)
        .then((r) => onConfirmed(r.firstSlug))
        .catch((e) => {
          setActionError(e instanceof Error ? e.message : String(e));
          setBusy(null);
        });
    // Persist any pending coverage edits before emitting, so what you see is what's built.
    if (dirty) {
      api
        .patchDraft(draft.id, { label: draft.label, spec: draft.spec })
        .then(finish)
        .catch((e) => {
          setActionError(e instanceof Error ? e.message : String(e));
          setBusy(null);
        });
    } else {
      finish();
    }
  };

  const discard = () => {
    if (!draft) {
      onDiscard();
      return;
    }
    if (!window.confirm("Discard this proposal?")) return;
    api.deleteDraft(draft.id).finally(onDiscard);
  };

  // ---- render ----
  if (loadError) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, alignItems: "center", textAlign: "center", gap: 16 }}>
          <div style={{ fontSize: 36 }}>🗂️</div>
          <h1 style={{ margin: 0 }}>Proposal unavailable</h1>
          <p style={{ opacity: 0.7, margin: 0 }}>{loadError}</p>
          <button style={ghostBtn} onClick={onDiscard}>
            ← Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, alignItems: "center" }}>
          <p style={{ opacity: 0.7 }}>Loading proposal…</p>
        </div>
      </div>
    );
  }

  if (draft.status === "emitted") {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, alignItems: "center", textAlign: "center", gap: 16 }}>
          <div style={{ fontSize: 36 }}>✅</div>
          <h1 style={{ margin: 0 }}>“{draft.label}” is already built</h1>
          <p style={{ opacity: 0.7, margin: 0 }}>This proposal has been emitted to your course library.</p>
          <button style={primaryBtn} onClick={onDiscard}>
            ← Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const spec: DraftSpec = draft.spec;
  const busyRegen = busy === "regenerate";
  const anyBusy = busy !== null;

  return (
    <div style={pageStyle}>
      <style>{`@keyframes praxis-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={cardStyle}>
        <header style={headerStyle}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 24 }}>{draft.label}</h1>
              <span style={modeBadge(spec.mode)}>{spec.mode}</span>
            </div>
            <p style={{ margin: "4px 0 0", opacity: 0.7 }}>
              {spec.modules.length} module{spec.modules.length === 1 ? "" : "s"} proposed — review, tune coverage, then
              build. Nothing is written until you confirm.
            </p>
          </div>
          <button style={ghostBtn} onClick={discard} disabled={anyBusy}>
            Discard
          </button>
        </header>

        {spec.mode === "guide" && (
          <p style={noteStyle}>
            Guide mode keeps each Module’s reading <strong>verbatim</strong> from your source. You author only the
            assessment.
          </p>
        )}

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {spec.modules.map((m) => {
            const loc = locatorText(m.locator);
            return (
              <div key={m.number} style={moduleCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      <span style={{ opacity: 0.5, marginRight: 8 }}>{m.number}</span>
                      {m.title}
                    </div>
                    <div style={{ opacity: 0.7, fontSize: 13, marginTop: 2 }}>{m.principle}</div>
                  </div>
                  <span style={archetypeTag}>{m.archetype}</span>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>{m.resource !== undefined ? "Verbatim resource" : "Authored lesson"}</span>
                  {loc && <span style={locatorTag} title="Where this slice came from">📍 {loc}</span>}
                  <span style={{ fontSize: 12, opacity: 0.6 }}>
                    · {m.recall.length} recall{m.recall.length === 1 ? "" : " questions"}
                  </span>
                </div>

                <p style={snippetStyle}>{snippet(bodyOf(m)) || <em style={{ opacity: 0.5 }}>— no reading material —</em>}</p>

                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, opacity: 0.6, marginRight: 4 }}>Coverage:</span>
                  <button
                    style={m.coverage === "internalise" ? coverageActive : coverageBtn}
                    onClick={() => setCoverage(m.number, "internalise")}
                    disabled={anyBusy}
                    title="Gated on cold recall — the learner must own this"
                  >
                    Internalise
                  </button>
                  <button
                    style={m.coverage === "reference" ? coverageActive : coverageBtn}
                    onClick={() => setCoverage(m.number, "reference")}
                    disabled={anyBusy}
                    title="Ungated — worth reading, not memorising (no recall)"
                  >
                    Reference
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        {busyRegen && (
          <div style={statusBar}>
            <span style={spinner} />
            <span>{regenLog[regenLog.length - 1] ?? "Re-planning…"}</span>
          </div>
        )}

        {actionError && <div style={{ color: "#e5484d" }}>❌ {actionError}</div>}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={{ ...primaryBtn, opacity: anyBusy ? 0.5 : 1 }} onClick={confirm} disabled={anyBusy}>
            {busy === "confirm" ? "Building…" : "Confirm & build →"}
          </button>
          {dirty && (
            <button style={ghostBtn} onClick={saveEdits} disabled={anyBusy}>
              {busy === "save" ? "Saving…" : "Save edits"}
            </button>
          )}
          <button style={ghostBtn} onClick={regenerate} disabled={anyBusy}>
            Regenerate
          </button>
        </div>
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
  width: "min(760px, 100%)",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};
const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
};
const noteStyle: CSSProperties = {
  margin: 0,
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(59,130,246,0.35)",
  background: "rgba(59,130,246,0.08)",
  fontSize: 13,
};
const moduleCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid rgba(128,128,128,0.3)",
  background: "rgba(128,128,128,0.05)",
};
const snippetStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.5,
  opacity: 0.8,
  fontFamily: "ui-monospace, monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const archetypeTag: CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid rgba(128,128,128,0.35)",
  opacity: 0.8,
  whiteSpace: "nowrap",
};
const locatorTag: CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
};
const coverageBtn: CSSProperties = {
  padding: "5px 12px",
  borderRadius: 8,
  border: "1px solid rgba(128,128,128,0.35)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 13,
};
const coverageActive: CSSProperties = { ...coverageBtn, borderColor: "#3b82f6", background: "rgba(59,130,246,0.14)" };
const modeBadge = (mode: string): CSSProperties => ({
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid rgba(59,130,246,0.5)",
  color: "#3b82f6",
  fontWeight: 600,
});
const primaryBtn: CSSProperties = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "none",
  background: "#3b82f6",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
const ghostBtn: CSSProperties = {
  padding: "10px 14px",
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
