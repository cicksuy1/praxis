import { useEffect, useRef, useState, useCallback } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTheme } from "./useTheme.ts";
import {
  api,
  subscribe,
  type Module,
  type Progress,
  type Lesson,
  type Challenge,
  type Turn,
  type CourseEntry,
} from "./api.ts";
import { CreatePage } from "./CreatePage.tsx";

type Tab = "lesson" | "drill" | "challenge";

const SIDEBAR = { min: 210, max: 460, default: 296 };
const CHAT = { min: 320, max: 820, default: 430 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function App() {
  const [modules, setModules] = useState<Module[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("lesson");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [drill, setDrill] = useState<{ markdown: string } | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState("");
  const [input, setInput] = useState("");
  const [cost, setCost] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const [model, setModel] = useState("sonnet");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"home" | "learn">("home");
  const [courses, setCourses] = useState<CourseEntry[]>([]);
  const { theme, toggle: toggleTheme } = useTheme();

  // Resizable / collapsible layout.
  const [sidebarW, setSidebarW] = useState(SIDEBAR.default);
  const [chatW, setChatW] = useState(CHAT.default);
  const [collapsed, setCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [contentCollapsed, setContentCollapsed] = useState(false);

  // A drag on a column edge updates that column's width live. `dir` is +1 when
  // dragging right grows the column (left sidebar) and -1 when it shrinks it
  // (right chat panel, which is anchored to the window edge).
  const startResize = useCallback(
    (set: (w: number) => void, startW: number, min: number, max: number, dir: 1 | -1) =>
      (e: React.PointerEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const move = (ev: PointerEvent) => set(clamp(startW + dir * (ev.clientX - startX), min, max));
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          document.body.classList.remove("resizing");
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        document.body.classList.add("resizing");
      },
    [],
  );

  const refreshProgress = useCallback(() => {
    api.progress().then(setProgress).catch(() => {});
  }, []);

  // Initial load + SSE subscription.
  useEffect(() => {
    api.curriculum().then((c) => setModules(c.modules)).catch(() => {});
    api.courses().then((c) => setCourses(c.courses)).catch(() => {});
    refreshProgress();
    api.status().then((s) => { if (s.model) setModel(s.model); }).catch(() => {});
    const unsub = subscribe({
      tutor_partial: (d) => {
        setBusy(true);
        setPartial((p) => p + (d.text ?? ""));
      },
      tutor_message: (d) => {
        // A completed assistant turn is the reliable "done" signal in streaming
        // mode (the SDK's `result`/tutor_idle only fires at conversation end).
        // If the coach keeps working (tool calls), tool_activity re-arms busy.
        setPartial("");
        setBusy(false);
        setTurns((t) => [...t, { kind: "tutor", text: d.text ?? "", ts: Date.now() }]);
      },
      tool_activity: (d) => {
        setBusy(true);
        setTurns((t) => [...t, { kind: "activity", text: d.text ?? "", ts: Date.now() }]);
      },
      tutor_idle: () => setBusy(false),
      progress_changed: () => refreshProgress(),
      celebrate: () => {
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 4000);
      },
      cost_update: (d) => setCost(d.totalCostUsd ?? 0),
    });
    return unsub;
  }, [refreshProgress]);

  // When a module is selected, load its content + history and open the conversation.
  const openModule = useCallback((s: string) => {
    setSlug(s);
    setTab("lesson");
    setPartial("");
    setBusy(true);
    api.lesson(s).then(setLesson).catch(() => setLesson(null));
    api.drill(s).then(setDrill).catch(() => setDrill(null));
    api.challenge(s).then(setChallenge).catch(() => setChallenge(null));
    api.history(s).then((h) => setTurns(h.turns)).catch(() => setTurns([]));
    api.startSession(s).catch(() => {});
  }, []);

  // Switch to another library course: mirror it to root, reload, show its modules
  // (no auto-start — the learner picks a module, avoiding surprise token spend).
  const openCourse = useCallback(
    async (courseSlug: string) => {
      try {
        await api.selectCourse(courseSlug);
        const c = await api.curriculum();
        setModules(c.modules);
        refreshProgress();
        setSlug(null);
        setTurns([]);
        setView("learn");
      } catch {
        /* ignore — stay where we are */
      }
    },
    [refreshProgress],
  );

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setTurns((t) => [...t, { kind: "learner", text, ts: Date.now() }]);
    setInput("");
    setBusy(true);
    api.sendInput(text).catch(() => {});
  }, [input]);

  // Clear & restart the current module's conversation (a fresh SDK session).
  // Guarded by a confirm since starting a new conversation costs tokens.
  const clearConversation = useCallback(() => {
    if (!slug) return;
    if (!window.confirm("Clear this conversation and start the coach fresh? Your module progress is unaffected.")) {
      return;
    }
    setTurns([]);
    setPartial("");
    setBusy(true);
    api.startSession(slug, true).catch(() => {});
  }, [slug]);

  // Switch the coach model (applies on the next conversation start).
  const changeModel = useCallback((m: string) => {
    setModel(m);
    api.setModel(m).catch(() => {});
  }, []);

  const completed = new Set(progress?.completed.map((r) => r.module) ?? []);

  // Five grid tracks: [sidebar | rz | content | rz | chat]. A collapsed panel
  // becomes a slim RAIL column (never a floating overlay), so nothing covers the
  // tabs. Exactly one track is the flexible filler: the lesson normally, the chat
  // when the lesson is collapsed, the sidebar when both are collapsed.
  const RAIL = 36;
  const contentTrack = contentCollapsed ? `${RAIL}px` : "minmax(0, 1fr)";
  const chatTrack = chatCollapsed
    ? `${RAIL}px`
    : contentCollapsed
      ? "minmax(0, 1fr)"
      : `${chatW}px`;
  const sidebarTrack =
    !collapsed && contentCollapsed && chatCollapsed
      ? "minmax(0, 1fr)"
      : collapsed
        ? `${RAIL}px`
        : `${sidebarW}px`;
  const cols = [
    sidebarTrack,
    collapsed ? "0px" : "6px",
    contentTrack,
    chatCollapsed || contentCollapsed ? "0px" : "6px",
    chatTrack,
  ].join(" ");

  if (view === "home") {
    return (
      <CreatePage
        onOpenCourse={openCourse}
        onDone={(firstSlug) => {
          api.courses().then((c) => setCourses(c.courses)).catch(() => {});
          setView("learn");
          if (firstSlug) openModule(firstSlug);
        }}
        onBack={() => setView("learn")}
      />
    );
  }

  return (
    <div className="app" style={{ gridTemplateColumns: cols }}>
      {collapsed ? (
        <button className="rail" title="Show modules" onClick={() => setCollapsed(false)}>
          <span className="rail-label">Modules</span>
        </button>
      ) : (
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-left">
            <img className="brand-logo" src="/logo.svg" alt="" width={28} height={28} />
            <h1 className="brand">Praxis</h1>
          </div>
          <div className="brand-actions">
            <button
              className="collapse-btn"
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              aria-label="Toggle light / dark theme"
              onClick={toggleTheme}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button className="collapse-btn" title="Hide modules" onClick={() => setCollapsed(true)}>
              ‹
            </button>
          </div>
        </div>
        <button
          onClick={() => setView("home")}
          title="Back to the dashboard — generate a course or switch between yours"
          style={{
            width: "100%",
            margin: "0 0 10px",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(128,128,128,0.35)",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
            textAlign: "left",
            font: "inherit",
          }}
        >
          ← Dashboard
        </button>
        {courses.length > 0 && (
          <select
            className="model-select"
            style={{ width: "100%", margin: "0 0 12px" }}
            value=""
            onChange={(e) => {
              if (e.target.value) openCourse(e.target.value);
            }}
            title="Switch to another course"
          >
            <option value="">Switch course…</option>
            {courses.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <nav className="modules">
          {modules.map((m) => (
            <button
              key={m.slug}
              className={`module-row${slug === m.slug ? " active" : ""}${m.isSpine ? " spine" : ""}`}
              onClick={() => openModule(m.slug)}
            >
              <span
                className={`badge ${completed.has(m.slug) ? "done" : progress?.current === m.slug ? "current" : "todo"}`}
                aria-hidden
              />
              <span className="mod-num">{m.number}</span>
              <span className="mod-title">{m.title}{m.isSpine ? " ⭐" : ""}</span>
            </button>
          ))}
        </nav>
        <div className="progress-foot">
          {progress && (
            <span>{progress.completed.length}/{modules.length} passed</span>
          )}
          {cost > 0 && <span className="cost">${cost.toFixed(3)}</span>}
        </div>
      </aside>
      )}

      <div
        className={`resizer${collapsed ? " hidden" : ""}`}
        title="Drag to resize"
        onPointerDown={collapsed ? undefined : startResize(setSidebarW, sidebarW, SIDEBAR.min, SIDEBAR.max, 1)}
      />

      {contentCollapsed ? (
        <button className="rail center" title="Show lesson" onClick={() => setContentCollapsed(false)}>
          <span className="rail-label">Lesson</span>
        </button>
      ) : (
      <main className="content">
        {celebrating && <div className="celebrate">🎉 Module passed — nicely done!</div>}
        {!slug && (
          <div className="welcome">
            <h2>Pick a module to begin</h2>
            <p>
              Each module runs <strong>read → practice → challenge</strong>. The coach on the right is
              a live conversation — it teaches the lesson, sets your practice, runs your challenge, and
              scores how you drove the agent. The work happens in <em>your own</em> Claude Code session.
            </p>
          </div>
        )}
        {slug && (
          <>
            <div className="tabs">
              <div className="tab-group">
                <button className={tab === "lesson" ? "on" : ""} onClick={() => setTab("lesson")}>Read</button>
                <button className={tab === "drill" ? "on" : ""} onClick={() => setTab("drill")} disabled={!drill}>
                  Practice
                </button>
                <button className={tab === "challenge" ? "on" : ""} onClick={() => setTab("challenge")} disabled={!challenge}>
                  Challenge
                </button>
              </div>
              <button
                className="collapse-btn"
                title="Hide lesson panel"
                aria-label="Hide lesson panel"
                onClick={() => setContentCollapsed(true)}
              >
                ⊟
              </button>
            </div>
            <div className="panel markdown">
              {tab === "lesson" && lesson && (
                <Markdown remarkPlugins={[remarkGfm]}>{lesson.markdown}</Markdown>
              )}
              {tab === "drill" && drill && (
                <Markdown remarkPlugins={[remarkGfm]}>{drill.markdown}</Markdown>
              )}
              {tab === "challenge" && challenge && (
                <>
                  <Markdown remarkPlugins={[remarkGfm]}>{challenge.mission}</Markdown>
                  {challenge.scorecard.trim() && (
                    <>
                      <hr />
                      <Markdown remarkPlugins={[remarkGfm]}>{challenge.scorecard}</Markdown>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>
      )}

      <div
        className={`resizer${chatCollapsed || contentCollapsed ? " hidden" : ""}`}
        title="Drag to resize"
        onPointerDown={chatCollapsed || contentCollapsed ? undefined : startResize(setChatW, chatW, CHAT.min, CHAT.max, -1)}
      />

      {chatCollapsed ? (
        <button className="rail right" title="Show coach" onClick={() => setChatCollapsed(false)}>
          <span className="rail-label">Coach</span>
        </button>
      ) : (
      <section className="chat">
        <header className="chat-head">
          <span className="coach-title">
            <span className={`coach-dot${busy ? " busy" : ""}`} />
            Coach
            {busy && <span className="thinking-label">thinking…</span>}
          </span>
          <div className="chat-controls">
            <select
              className="model-select"
              value={model}
              onChange={(e) => changeModel(e.target.value)}
              title="Coach model — applies to the next conversation"
            >
              <option value="opus">Opus</option>
              <option value="sonnet">Sonnet</option>
              <option value="haiku">Haiku</option>
            </select>
            <button
              className="clear-btn"
              onClick={clearConversation}
              disabled={!slug}
              title="Clear & restart this module's conversation"
            >
              Clear
            </button>
            <button className="collapse-btn" title="Hide coach" onClick={() => setChatCollapsed(true)}>
              ›
            </button>
          </div>
        </header>
        <div className="turns">
          {turns.map((t, i) => (
            <div key={i} className={`turn ${t.kind}`}>
              {t.kind === "activity" ? (
                <span className="activity">{t.text}</span>
              ) : (
                <Markdown remarkPlugins={[remarkGfm]}>{t.text}</Markdown>
              )}
            </div>
          ))}
          {partial && (
            <div className="turn tutor streaming">
              <Markdown remarkPlugins={[remarkGfm]}>{partial}</Markdown>
            </div>
          )}
          {busy && !partial && (
            <div className="turn tutor typing-bubble">
              <span className="typing"><span /><span /><span /></span>
            </div>
          )}
        </div>
        <div className="composer">
          <textarea
            value={input}
            placeholder={slug ? "Talk to your coach…" : "Open a module first"}
            disabled={!slug}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button onClick={send} disabled={!slug || !input.trim()}>Send</button>
        </div>
      </section>
      )}
    </div>
  );
}
