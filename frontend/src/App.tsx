import { useState, useEffect, useCallback, useRef } from "react";

// ── API-Client ────────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(init?.body != null ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const scansApi = {
  list:   ()           => api("/scans"),
  get:    (id: string) => api(`/scans/${id}`),
  start:  (body: any)  => api("/scans", { method: "POST", body: JSON.stringify(body) }),
  delete: (id: string) => api(`/scans/${id}`, { method: "DELETE" }),
};

const jiraApi = {
  export: (ids: string[], key?: string) =>
    api("/jira/export", { method: "POST", body: JSON.stringify({ finding_ids: ids, project_key: key ?? "ACC" }) }),
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useScans() {
  const [scans,   setScans]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      setError(null);
      setScans(await scansApi.list());
    } catch (e: any) { setError(e.message); }
    finally          { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const startScan = useCallback(async (body: any) => {
    const { scan_id } = await scansApi.start(body);
    setScans(prev => [{
      id: scan_id, url: body.url, wcag_level: body.wcag_level,
      mode: body.mode, flow_goal: body.flow_goal ?? null,
      status: "running", total: 0,
      critical: 0, serious: 0, moderate: 0, minor: 0,
      created_at: new Date().toISOString(),
    }, ...prev]);
    return scan_id as string;
  }, []);

  const updateScan = useCallback((updated: any) => {
    setScans(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
  }, []);

  const deleteScan = useCallback(async (id: string) => {
    await scansApi.delete(id);
    setScans(prev => prev.filter(s => s.id !== id));
  }, []);

  return { scans, loading, error, startScan, updateScan, deleteScan };
}

function useScanPoller(onUpdate: (s: any) => void) {
  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>());

  const poll = useCallback((scanId: string) => {
    if (timers.current.has(scanId)) return;
    const t = setInterval(async () => {
      try {
        const scan = await scansApi.get(scanId);
        onUpdate(scan);
        if (scan.status === "done" || scan.status === "failed") {
          clearInterval(t); timers.current.delete(scanId);
        }
      } catch { clearInterval(t); timers.current.delete(scanId); }
    }, 2000);
    timers.current.set(scanId, t);
  }, [onUpdate]);

  useEffect(() => () => timers.current.forEach(t => clearInterval(t)), []);
  return { poll };
}

// ── Severity config ────────────────────────────────────────────────────────────

const SEV: Record<string, { label: string; badge: string; bar: string; dot: string }> = {
  critical: { label: "Kritisch", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",     bar: "bg-red-500",    dot: "bg-red-500" },
  serious:  { label: "Hoch",     badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400", bar: "bg-orange-500", dot: "bg-orange-500" },
  moderate: { label: "Mittel",   badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400", bar: "bg-yellow-500", dot: "bg-yellow-500" },
  minor:    { label: "Gering",   badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",   bar: "bg-green-500",  dot: "bg-green-500" },
};

// ── Shared UI ─────────────────────────────────────────────────────────────────

const Badge = ({ sev }: { sev: string }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SEV[sev]?.badge}`}>
    {SEV[sev]?.label}
  </span>
);

const SevBar = ({ scan }: { scan: any }) => {
  const t = scan.total || 1;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-px mt-3">
      {(["critical","serious","moderate","minor"] as const).map(s =>
        scan[s] > 0 && <div key={s} className={`${SEV[s].bar} opacity-70`} style={{ flex: scan[s] / t }}/>
      )}
    </div>
  );
};

const ModeBadge = ({ mode }: { mode: string }) => {
  const map: Record<string, string> = {
    snapshot: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    flow:     "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
    crawl:    "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400",
  };
  const label: Record<string, string> = { snapshot: "Snapshot", flow: "Flow (KI)", crawl: "Crawl" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${map[mode] ?? map.snapshot}`}>
      {label[mode] ?? mode}
    </span>
  );
};

// ── ScanDialog ────────────────────────────────────────────────────────────────

function ScanDialog({ onClose, onStart, defaultUrl = "" }: { onClose: () => void; onStart: (b: any) => Promise<void>; defaultUrl?: string }) {
  const [url,        setUrl]        = useState(defaultUrl);
  const [wcag,       setWcag]       = useState("AA");
  const [mode,       setMode]       = useState("snapshot");
  const [goal,       setGoal]       = useState("");
  const [maxPages,   setMaxPages]   = useState(20);
  const [autoJira,   setAutoJira]   = useState(false);
  const [screenshots,setScreenshots]= useState(false);
  const [urlError,   setUrlError]   = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isValidUrl = () => { try { new URL(url); return true; } catch { return false; } };
  const canSubmit  = isValidUrl() && (mode !== "flow" || goal.trim().length > 0) && !submitting;

  const submit = async () => {
    if (!isValidUrl()) { setUrlError("Gültige URL inkl. https:// eingeben"); return; }
    setSubmitting(true);
    try {
      await onStart({ url, wcag_level: wcag, mode, flow_goal: goal || undefined, auto_jira: autoJira, screenshots, max_pages: maxPages });
    } catch (e: any) { setUrlError(e.message); setSubmitting(false); }
  };

  const modes = [
    { val: "snapshot", title: "Snapshot",   sub: "Einmaliger DOM-Scan" },
    { val: "crawl",    title: "Crawl",       sub: "Alle Unterseiten testen" },
    { val: "flow",     title: "Flow (KI)",   sub: "Claude steuert User-Flow" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Neuen Scan starten</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* URL */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">URL</label>
            <input
              value={url} onChange={e => { setUrl(e.target.value); setUrlError(""); }}
              placeholder="https://example.com"
              className={`w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${urlError ? "border-red-400" : "border-slate-300 dark:border-slate-600"}`}
            />
            {urlError && <p className="mt-1 text-xs text-red-500">{urlError}</p>}
          </div>

          {/* WCAG Level */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">WCAG-Level</label>
            <div className="flex gap-2">
              {["A","AA","AAA"].map(l => (
                <button key={l} onClick={() => setWcag(l)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${wcag===l ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300"}`}>
                  WCAG {l}
                </button>
              ))}
            </div>
          </div>

          {/* Modus */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Scan-Modus</label>
            <div className="grid grid-cols-3 gap-2">
              {modes.map(({ val, title, sub }) => (
                <div key={val} onClick={() => setMode(val)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${mode===val ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}>
                  <div className={`text-sm font-medium ${mode===val ? "text-blue-700 dark:text-blue-400" : "text-slate-700 dark:text-slate-300"}`}>{title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Flow Goal */}
          {mode === "flow" && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Flow-Ziel <span className="text-red-400">*</span>
              </label>
              <textarea value={goal} onChange={e => setGoal(e.target.value)}
                placeholder="z.B. Produkt in den Warenkorb legen und Checkout starten"
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
              <p className="mt-1 text-xs text-slate-400">Claude plant daraus 3–8 Schritte mit realistischen Testdaten.</p>
            </div>
          )}

          {/* Max Pages */}
          {mode === "crawl" && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Max. Seiten <span className="text-slate-400 font-normal">({maxPages})</span>
              </label>
              <input type="range" min={1} max={100} value={maxPages} onChange={e => setMaxPages(Number(e.target.value))}
                className="w-full accent-blue-500"/>
            </div>
          )}

          {/* Screenshots */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={screenshots} onChange={e => setScreenshots(e.target.checked)}
              className="w-4 h-4 accent-blue-500"/>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {mode === "flow" ? "Screenshots nach jedem Schritt speichern" : mode === "crawl" ? "Screenshots pro Seite speichern" : "Screenshot mit markierten Verstößen speichern"}
            </span>
          </label>

          {/* Auto Jira */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={autoJira} onChange={e => setAutoJira(e.target.checked)}
              className="w-4 h-4 accent-blue-500"/>
            <span className="text-sm text-slate-600 dark:text-slate-400">Kritische Findings sofort als Jira-Tickets anlegen</span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            Abbrechen
          </button>
          <button onClick={submit} disabled={!canSubmit}
            className={`flex-[2] py-2 rounded-lg text-sm font-semibold text-white transition-colors ${canSubmit ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-300 cursor-not-allowed"}`}>
            {submitting ? "Startet…" : mode === "flow" ? "Flow-Scan starten" : mode === "crawl" ? "Crawl starten" : "Snapshot starten"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FlowProgress ──────────────────────────────────────────────────────────────

function FlowProgress({ scan, onDone }: { scan: any; onDone: () => void }) {
  const calledDone = useRef(false);
  useEffect(() => {
    if (!calledDone.current && (scan.status === "done" || scan.status === "failed")) {
      calledDone.current = true;
      setTimeout(onDone, 1200);
    }
  }, [scan.status, onDone]);

  const steps     = scan.flow_meta?.steps ?? [];
  const doneCount = scan.status === "done" ? steps.length : steps.filter((s: any) => s.status === "ok").length;
  const pct       = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const totalFound = steps.reduce((s: number, x: any) => s + (x.findingCount ?? 0), 0);

  return (
    <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-slate-800 dark:text-white">
          {scan.status === "done" ? "Flow-Scan abgeschlossen" : "Flow-Scan läuft…"}
        </span>
        {totalFound > 0 && <span className="text-xs text-orange-500 font-medium">{totalFound} Findings bisher</span>}
      </div>
      <p className="text-xs text-slate-400 truncate mb-3">{scan.url}</p>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-4">
        <div className={`h-full rounded-full transition-all duration-500 ${scan.status === "failed" ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }}/>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.length === 0
          ? <p className="text-xs text-slate-400">Claude analysiert Seite und plant Schritte…</p>
          : steps.map((s: any, i: number) => {
              const isDone    = s.status === "ok" || s.status === "error";
              const isCurrent = !isDone && i === doneCount;
              return (
                <div key={s.stepIndex} className={`flex items-center gap-3 transition-opacity ${!isDone && !isCurrent ? "opacity-35" : ""}`}>
                  <div className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold border
                    ${isDone    ? "bg-green-100 border-green-300 text-green-600 dark:bg-green-900/40 dark:border-green-700 dark:text-green-400"
                    : isCurrent ? "bg-blue-100 border-blue-300 text-blue-600 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-400"
                    :             "bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-600"}`}>
                    {isDone ? "✓" : isCurrent ? "…" : ""}
                  </div>
                  <span className={`flex-1 text-xs ${isCurrent ? "text-slate-900 dark:text-white font-medium" : "text-slate-500"}`}>{s.description}</span>
                  {s.findingCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400">{s.findingCount}</span>}
                </div>
              );
            })
        }
      </div>

      {scan.status === "done"   && <p className="mt-3 text-xs text-green-600 dark:text-green-400 font-medium">Abgeschlossen — Ergebnisse werden geladen…</p>}
      {scan.status === "failed" && <p className="mt-3 text-xs text-red-500">{scan.error ?? "Scan fehlgeschlagen"}</p>}
    </div>
  );
}

// ── FindingCard ───────────────────────────────────────────────────────────────

function FindingCard({ finding, selected, onToggle }: { finding: any; selected: boolean; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const wcagLabel = (finding.wcag_tags ?? [])
    .find((t: string) => /^wcag\d+$/.test(t))?.replace("wcag","")?.split("").join(".") ?? "?";
  const isUrl = finding.flow_step_description?.startsWith("http");

  return (
    <div className={`rounded-xl border transition-colors ${expanded ? "border-slate-300 dark:border-slate-600" : "border-slate-200 dark:border-slate-700"} bg-white dark:bg-slate-800/50 overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
           onClick={() => setExpanded(e => !e)}>
        <input type="checkbox" checked={selected} onClick={e => e.stopPropagation()} onChange={onToggle}
          className="w-4 h-4 accent-blue-500 shrink-0"/>
        <div className={`w-2 h-2 rounded-full shrink-0 ${SEV[finding.severity]?.dot ?? "bg-slate-400"}`}/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800 dark:text-white">{finding.rule_id}</span>
            <Badge sev={finding.severity}/>
          </div>
          <p className="text-xs text-slate-400 truncate mt-0.5">
            {finding.flow_step_description
              ? isUrl ? finding.flow_step_description : `Schritt: ${finding.flow_step_description}`
              : finding.selector}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-mono">
            WCAG {wcagLabel}
          </span>
          {finding.jira_key && (
            <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 font-medium">
              {finding.jira_key}
            </span>
          )}
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-3">
          {finding.flow_step_description && (
            <div className="text-xs px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
              {isUrl
                ? <>Seite: <a href={finding.flow_step_description} target="_blank" rel="noreferrer" className="underline underline-offset-2">{finding.flow_step_description}</a></>
                : <>Reproduzieren: {finding.flow_step_description}</>}
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Betroffenes Element</p>
            <pre className="text-xs font-mono px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-x-auto text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{finding.html}</pre>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Fix-Hinweis</p>
            <div className="text-xs px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800">
              {finding.fix_hint}
            </div>
          </div>
          {finding.help_url && (
            <a href={finding.help_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Dokumentation
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── FlowProtocol ─────────────────────────────────────────────────────────────

function FlowProtocol({ scan, findings }: { scan: any; findings: any[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const meta = scan.flow_meta;
  if (!meta?.steps?.length) return null;

  return (
    <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-800 dark:text-white">Flow-Protokoll</p>
        <p className="text-xs text-slate-400 mt-0.5">{meta.goal}</p>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {meta.steps.map((s: any) => {
          const stepFindings = findings.filter((f: any) => f.flow_step === s.stepIndex);
          const hasContent   = stepFindings.length > 0 || !!s.screenshotUrl;
          const isOpen       = open === s.stepIndex;
          return (
            <div key={s.stepIndex}>
              <div
                onClick={() => hasContent && setOpen(isOpen ? null : s.stepIndex)}
                className={`flex items-center gap-3 px-5 py-3 transition-colors ${hasContent ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800" : ""}`}>
                <div className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold
                  ${s.status === "ok"
                    ? "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
                    : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"}`}>
                  {s.status === "ok" ? "✓" : "✕"}
                </div>
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">{s.description}</span>
                {s.findingCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400 font-medium">
                    {s.findingCount}
                  </span>
                )}
                {s.screenshotUrl && (
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400">
                    Screenshot
                  </span>
                )}
                {hasContent && (
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                  </svg>
                )}
              </div>
              {isOpen && (
                <div className="px-5 pb-4 space-y-2 bg-slate-50 dark:bg-slate-900/30">
                  {stepFindings.map((f: any) => (
                    <div key={f.id} className="flex items-start gap-2 py-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${SEV[f.severity]?.dot ?? "bg-slate-400"}`}/>
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{f.rule_id}</span>
                        <p className="text-xs text-slate-400 mt-0.5">{f.fix_hint}</p>
                      </div>
                      <Badge sev={f.severity}/>
                    </div>
                  ))}
                  {s.screenshotUrl && (
                    <img
                      src={`${BASE}${s.screenshotUrl}`}
                      alt={`Screenshot: ${s.description}`}
                      loading="lazy"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 mt-2"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CrawlProtocol ─────────────────────────────────────────────────────────────

function CrawlProtocol({ scan }: { scan: any }) {
  const [open, setOpen] = useState<number | null>(null);
  const meta = scan.flow_meta;
  if (!meta?.pages?.length) return null;

  return (
    <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-800 dark:text-white">Crawl-Protokoll</p>
        <p className="text-xs text-slate-400 mt-0.5">{meta.pagesScanned} Seiten gescannt</p>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {meta.pages.map((p: any, i: number) => {
          const hasContent = p.findingCount > 0 || !!p.screenshotUrl;
          const isOpen     = open === i;
          return (
            <div key={i}>
              <div
                onClick={() => hasContent && setOpen(isOpen ? null : i)}
                className={`flex items-center gap-3 px-5 py-3 transition-colors ${hasContent ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800" : ""}`}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${p.status === "done" ? "bg-green-400" : "bg-red-400"}`}/>
                <span className="flex-1 text-xs text-slate-600 dark:text-slate-400 truncate">{p.url}</span>
                {p.findingCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400 font-medium">
                    {p.findingCount}
                  </span>
                )}
                {p.screenshotUrl && (
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400">
                    Screenshot
                  </span>
                )}
                {hasContent && (
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                  </svg>
                )}
              </div>
              {isOpen && p.screenshotUrl && (
                <div className="px-5 pb-4 bg-slate-50 dark:bg-slate-900/30">
                  <img
                    src={`${BASE}${p.screenshotUrl}`}
                    alt={`Screenshot: ${p.url}`}
                    loading="lazy"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Haupt-Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [view,        setView]        = useState("scans");
  const [activeScan,  setActiveScan]  = useState<any>(null);
  const [findings,    setFindings]    = useState<any[]>([]);
  const [findLoading, setFindLoading] = useState(false);
  const [sevFilter,   setSevFilter]   = useState("all");
  const [selected,    setSelected]    = useState(new Set<string>());
  const [showDialog,      setShowDialog]      = useState(false);
  const [lastUrl,         setLastUrl]         = useState("");
  const [flowScanId,      setFlowScanId]      = useState<string | null>(null);
  const [exporting,       setExporting]       = useState(false);
  const [apiError,        setApiError]        = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting,        setDeleting]        = useState(false);

  const { scans, loading, error: scanError, startScan, updateScan, deleteScan } = useScans();

  const handleUpdate = useCallback((updated: any) => {
    updateScan(updated);
    if (activeScan?.id === updated.id) setActiveScan(updated);
    if (updated.id === flowScanId && updated.status !== "running") setFlowScanId(null);
  }, [activeScan, flowScanId, updateScan]);
  const { poll } = useScanPoller(handleUpdate);

  useEffect(() => {
    if (!activeScan?.id || activeScan.status !== "done") { setFindings([]); return; }
    setFindLoading(true);
    scansApi.get(activeScan.id)
      .then(d => setFindings(d.findings ?? []))
      .catch(() => setFindings([]))
      .finally(() => setFindLoading(false));
  }, [activeScan?.id, activeScan?.status]);

  const handleStart = useCallback(async (body: any) => {
    setShowDialog(false);
    setApiError(null);
    if (body.url) setLastUrl(body.url);
    try {
      const scanId = await startScan(body);
      poll(scanId);
      if (body.mode === "flow") setFlowScanId(scanId);
    } catch (e: any) { setApiError(e.message); }
  }, [startScan, poll]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(true);
    try {
      await deleteScan(id);
      if (activeScan?.id === id) { setActiveScan(null); setFindings([]); }
      setConfirmDeleteId(null);
    } catch (e: any) { console.error("handleDelete failed:", e); setApiError(e.message); }
    finally { setDeleting(false); }
  }, [deleteScan, activeScan]);

  const filtered  = sevFilter === "all" ? findings : findings.filter(f => f.severity === sevFilter);
  const toggle    = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(f => f.id)));

  const handleExport = async () => {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      const result = await jiraApi.export([...selected]);
      result.created.forEach(({ findingId, jiraKey }: any) => {
        setFindings(fs => fs.map(f => f.id === findingId ? { ...f, jira_key: jiraKey } : f));
      });
      setSelected(new Set());
    } catch (e: any) { setApiError(e.message); }
    finally { setExporting(false); }
  };

  const flowScan = flowScanId ? scans.find(s => s.id === flowScanId) : null;
  const doneScan = scans.filter(s => s.status === "done");
  const totalFindings = scans.reduce((s, x) => s + (x.total ?? 0), 0);
  const totalCritical = scans.reduce((s, x) => s + (x.critical ?? 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">

      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-56 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-40">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">AI-cessibility</div>
              <div className="text-[10px] text-slate-400">axe-core · WCAG 2.1</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {[
            { id: "scans",    label: "Scans",    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
            { id: "findings", label: "Findings", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" },
          ].map(({ id, label, icon }) => (
            <button key={id} onClick={() => setView(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${view===id ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon}/>
              </svg>
              {label}
            </button>
          ))}
        </nav>

        {/* Stats */}
        <div className="px-4 py-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Scans gesamt</span>
            <span className="font-semibold">{doneScan.length}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Findings</span>
            <span className="font-semibold">{totalFindings}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Kritisch</span>
            <span className="font-semibold text-red-500">{totalCritical}</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-56 min-h-screen flex flex-col">

        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {view === "scans" ? "Scans" : "Findings"}
          </h1>
          <button onClick={() => setShowDialog(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Scan starten
          </button>
        </header>

        <div className="flex-1 px-6 py-6">

          {/* Error */}
          {(apiError || scanError) && (
            <div className="mb-4 flex items-center justify-between px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              <span>{apiError || scanError}</span>
              <button onClick={() => setApiError(null)} className="ml-4 text-red-400 hover:text-red-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          )}

          {/* Flow Progress */}
          {flowScan && view === "scans" && <FlowProgress scan={flowScan} onDone={() => setFlowScanId(null)}/>}

          {/* ── SCANS VIEW ── */}
          {view === "scans" && (
            <div className="space-y-3">
              {loading && scans.length === 0 && (
                <div className="text-center py-16 text-slate-400 text-sm">Lädt…</div>
              )}
              {!loading && scans.length === 0 && (
                <div className="text-center py-20">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    </svg>
                  </div>
                  <p className="text-slate-500 text-sm">Noch keine Scans vorhanden</p>
                  <p className="text-slate-400 text-xs mt-1">Klicke auf „Scan starten" um loszulegen.</p>
                </div>
              )}
              {scans.map(s => {
                const isConfirming = confirmDeleteId === s.id;
                return (
                  <div key={s.id}
                    onClick={() => { if (s.status === "done" && !isConfirming) { setActiveScan(s); setView("findings"); } }}
                    className={`p-4 rounded-xl border bg-white dark:bg-slate-800/50 transition-all ${s.status === "done" && !isConfirming ? "border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer hover:shadow-sm" : "border-slate-200 dark:border-slate-700"} ${s.status !== "done" && !isConfirming ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{s.url}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400">{new Date(s.created_at).toLocaleString("de-DE")}</span>
                          <ModeBadge mode={s.mode}/>
                          {s.wcag_level && <span className="text-xs text-slate-400">WCAG {s.wcag_level}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {s.status === "running" && !isConfirming && (
                          <span className="flex items-center gap-1.5 text-xs text-blue-500 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"/>Läuft…
                          </span>
                        )}
                        {s.status === "failed" && !isConfirming && (
                          <span className="text-xs text-red-500 font-medium">Fehlgeschlagen</span>
                        )}
                        {s.status === "done" && !isConfirming && (
                          (["critical","serious","moderate","minor"] as const).map(sev =>
                            s[sev] > 0 && <Badge key={sev} sev={sev}/>
                          )
                        )}

                        {/* Löschen-Bereich */}
                        {isConfirming ? (
                          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Scan löschen?</span>
                            <button
                              onClick={() => handleDelete(s.id)}
                              disabled={deleting}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50">
                              {deleting ? "…" : "Löschen"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                              Abbrechen
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); setConfirmDeleteId(s.id); }}
                            className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Scan löschen">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {s.status === "done" && (
                      <>
                        <SevBar scan={s}/>
                        <p className="text-xs text-slate-400 mt-2">{s.total} Findings gesamt</p>
                      </>
                    )}
                    {s.status === "failed" && <p className="text-xs text-red-400 mt-2 truncate">{s.error ?? "Fehler"}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── FINDINGS VIEW ── */}
          {view === "findings" && (
            <div>
              {/* Scan-Auswahl */}
              {doneScan.length > 0 && (
                <div className="flex gap-2 mb-5 flex-wrap">
                  {doneScan.map(s => (
                    <button key={s.id}
                      onClick={() => { setActiveScan(s); setSelected(new Set()); setSevFilter("all"); }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${activeScan?.id === s.id ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300"}`}>
                      <span className="truncate max-w-48">{s.url.replace(/^https?:\/\//, "")}</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">{s.total}</span>
                    </button>
                  ))}
                </div>
              )}

              {!activeScan ? (
                <div className="text-center py-20 text-slate-400 text-sm">Scan oben auswählen</div>
              ) : (
                <>
                  {/* Screenshot (Snapshot) */}
                  {activeScan.mode === "snapshot" && activeScan.flow_meta?.screenshotUrl && (
                    <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-5">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white mb-3">Screenshot mit markierten Verstößen</p>
                      <img
                        src={`${BASE}${activeScan.flow_meta.screenshotUrl}`}
                        alt="Seiten-Screenshot mit markierten Accessibility-Verstößen"
                        loading="lazy"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  )}

                  {/* Flow-Protokoll */}
                  {activeScan.mode === "flow" && <FlowProtocol scan={activeScan} findings={findings}/>}

                  {/* Crawl-Protokoll */}
                  {activeScan.mode === "crawl" && <CrawlProtocol scan={activeScan}/>}

                  {/* Severity Filter */}
                  <div className="flex gap-2 mb-4 flex-wrap">
                    {(["all","critical","serious","moderate","minor"] as const).map(f => (
                      <button key={f}
                        onClick={() => { setSevFilter(f); setSelected(new Set()); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${sevFilter === f ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300"}`}>
                        {f !== "all" && <span className={`w-2 h-2 rounded-full ${SEV[f].dot}`}/>}
                        {f === "all" ? "Alle" : SEV[f].label}
                        <span className="text-slate-400">{f === "all" ? findings.length : findings.filter(x => x.severity === f).length}</span>
                      </button>
                    ))}
                  </div>

                  {/* Toolbar */}
                  <div className="flex items-center gap-3 mb-4">
                    <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                      <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="accent-blue-500"/>
                      Alle auswählen
                    </label>
                    {selected.size > 0 && (
                      <button onClick={handleExport} disabled={exporting}
                        className={`ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors ${exporting ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}>
                        {exporting ? "Exportiert…" : `${selected.size} Findings → Jira`}
                      </button>
                    )}
                  </div>

                  {/* Finding-Liste */}
                  {findLoading ? (
                    <div className="text-center py-12 text-slate-400 text-sm">Lädt…</div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-sm">Keine Findings für diesen Filter</div>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map(f => <FindingCard key={f.id} finding={f} selected={selected.has(f.id)} onToggle={() => toggle(f.id)}/>)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Dialog */}
      {showDialog && <ScanDialog onClose={() => setShowDialog(false)} onStart={handleStart} defaultUrl={lastUrl}/>}
    </div>
  );
}