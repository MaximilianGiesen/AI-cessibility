import { useState, useEffect, useCallback, useRef } from "react";

// ── API-Client ────────────────────────────────────────────────────────────────

const BASE = "http://localhost:3000";

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

const scansApi = {
  list:  ()          => api("/scans"),
  get:   (id)        => api(`/scans/${id}`),
  start: (body)      => api("/scans", { method: "POST", body: JSON.stringify(body) }),
};

const jiraApi = {
  export: (ids, key) => api("/jira/export", { method: "POST", body: JSON.stringify({ finding_ids: ids, project_key: key ?? "ACC" }) }),
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useScans() {
  const [scans,   setScans]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetch_ = useCallback(async () => {
    try {
      setError(null);
      const data = await scansApi.list();
      setScans(data);
    } catch (e) { setError(e.message); }
    finally    { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const startScan = useCallback(async (body) => {
    const { scan_id } = await scansApi.start(body);
    setScans(prev => [{
      id: scan_id, url: body.url, wcag_level: body.wcag_level,
      mode: body.mode, flow_goal: body.flow_goal ?? null,
      status: "running", total: 0,
      critical: 0, serious: 0, moderate: 0, minor: 0,
      created_at: new Date().toISOString(),
    }, ...prev]);
    return scan_id;
  }, []);

  const updateScan = useCallback((updated) => {
    setScans(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
  }, []);

  return { scans, loading, error, startScan, updateScan, refetch: fetch_ };
}

function useScanPoller(onUpdate) {
  const timers = useRef(new Map());

  const poll = useCallback((scanId) => {
    if (timers.current.has(scanId)) return;
    const t = setInterval(async () => {
      try {
        const scan = await scansApi.get(scanId);
        onUpdate(scan);
        if (scan.status === "done" || scan.status === "failed") {
          clearInterval(t);
          timers.current.delete(scanId);
        }
      } catch {
        clearInterval(t);
        timers.current.delete(scanId);
      }
    }, 2000);
    timers.current.set(scanId, t);
  }, [onUpdate]);

  useEffect(() => () => timers.current.forEach(t => clearInterval(t)), []);
  return { poll };
}

// ── Design-Tokens ─────────────────────────────────────────────────────────────

const SEV = {
  critical: { label: "Kritisch", bg: "var(--color-background-danger)",  color: "var(--color-text-danger)" },
  serious:  { label: "Hoch",     bg: "var(--color-background-warning)", color: "var(--color-text-warning)" },
  moderate: { label: "Mittel",   bg: "var(--color-background-info)",    color: "var(--color-text-info)" },
  minor:    { label: "Gering",   bg: "var(--color-background-success)", color: "var(--color-text-success)" },
};

const Badge = ({ sev }) => (
    <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 99,
      background: SEV[sev]?.bg, color: SEV[sev]?.color }}>{SEV[sev]?.label}</span>
);

const SevBar = ({ scan }) => {
  const t = scan.total || 1;
  return (
      <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", gap: 1 }}>
        {["critical","serious","moderate","minor"].map(s => scan[s] > 0 && (
            <div key={s} style={{ flex: scan[s]/t, background: SEV[s].color, opacity: 0.65 }}/>
        ))}
      </div>
  );
};

// ── ScanDialog ────────────────────────────────────────────────────────────────

function ScanDialog({ onClose, onStart }) {
  const [url, setUrl]       = useState("");
  const [wcag, setWcag]     = useState("AA");
  const [mode, setMode]     = useState("snapshot");
  const [goal, setGoal]     = useState("");
  const [autoJira, setAutoJira] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const valid = () => { try { new URL(url); return true; } catch { return false; } };
  const canSubmit = valid() && (mode === "snapshot" || goal.trim().length > 0) && !submitting;

  const submit = async () => {
    if (!valid()) { setUrlError("Gültige URL inkl. https:// eingeben"); return; }
    setSubmitting(true);
    try {
      await onStart({ url, wcag_level: wcag, mode, flow_goal: goal || undefined, auto_jira: autoJira });
    } catch (e) {
      setUrlError(e.message);
      setSubmitting(false);
    }
  };

  const inp = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, boxSizing: "border-box" };
  const lbl = { fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4, display: "block" };

  return (
      <div style={{ minHeight: 400, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--border-radius-lg)", padding: 16 }}>
        <div style={{ background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)", padding: 20, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Neuen Scan starten</div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 18 }}>✕</button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>URL</label>
            <input value={url} onChange={e => { setUrl(e.target.value); setUrlError(""); }}
                   placeholder="https://example.com"
                   style={{ ...inp, borderColor: urlError ? "var(--color-border-danger)" : undefined }}/>
            {urlError && <div style={{ fontSize: 11, color: "var(--color-text-danger)", marginTop: 4 }}>{urlError}</div>}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>WCAG-Level</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["A","AA","AAA"].map(l => (
                  <button key={l} onClick={() => setWcag(l)} style={{ flex: 1, padding: "6px 0", borderRadius: 8, cursor: "pointer", fontSize: 13, border: `1px solid ${wcag===l?"var(--color-border-info)":"var(--color-border-tertiary)"}`, background: wcag===l?"var(--color-background-info)":"transparent", color: wcag===l?"var(--color-text-info)":"var(--color-text-secondary)" }}>WCAG {l}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Scan-Modus</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[["snapshot","Snapshot","Einmaliger DOM-Scan"],["flow","Flow (KI)","Claude steuert User-Flow"]].map(([val,title,sub]) => (
                  <div key={val} onClick={() => setMode(val)} style={{ flex: 1, padding: "10px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid ${mode===val?"var(--color-border-info)":"var(--color-border-tertiary)"}`, background: mode===val?"var(--color-background-info)":"var(--color-background-secondary)" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: mode===val?"var(--color-text-info)":"var(--color-text-primary)" }}>{title}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{sub}</div>
                  </div>
              ))}
            </div>
          </div>

          {mode === "flow" && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Flow-Ziel <span style={{ color: "var(--color-text-danger)" }}>*</span></label>
                <textarea value={goal} onChange={e => setGoal(e.target.value)}
                          placeholder="z.B. Produkt in den Warenkorb legen und Checkout starten"
                          rows={2} style={{ ...inp, resize: "vertical", lineHeight: 1.5 }}/>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 3 }}>Claude plant daraus 3–8 Schritte mit realistischen Testdaten.</div>
              </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "var(--color-text-secondary)", marginBottom: 18 }}>
            <input type="checkbox" checked={autoJira} onChange={e => setAutoJira(e.target.checked)}/>
            Kritische Findings sofort als Jira-Tickets anlegen
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-text-secondary)" }}>Abbrechen</button>
            <button onClick={submit} disabled={!canSubmit} style={{ flex: 2, padding: "9px 0", borderRadius: 8, border: "none", cursor: canSubmit?"pointer":"not-allowed", fontSize: 13, fontWeight: 500, background: "var(--color-text-info)", color: "#fff", opacity: canSubmit?1:0.45 }}>
              {submitting ? "Startet…" : mode === "flow" ? "Flow-Scan starten" : "Snapshot-Scan starten"}
            </button>
          </div>
        </div>
      </div>
  );
}

// ── FlowProgress ──────────────────────────────────────────────────────────────

function FlowProgress({ scan, onDone }) {
  const calledDone = useRef(false);
  useEffect(() => {
    if (!calledDone.current && (scan.status === "done" || scan.status === "failed")) {
      calledDone.current = true;
      setTimeout(onDone, 1200);
    }
  }, [scan.status, onDone]);

  const meta      = scan.flow_meta;
  const steps     = meta?.steps ?? [];
  const doneCount = scan.status === "done" ? steps.length : steps.filter(s => s.status === "ok").length;
  const pct       = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const totalFound = steps.reduce((s, x) => s + (x.findingCount ?? 0), 0);

  return (
      <div style={{ borderRadius: "var(--border-radius-lg)", border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{scan.status === "done" ? "Flow-Scan abgeschlossen" : "Flow-Scan läuft"}</div>
          {totalFound > 0 && <span style={{ fontSize: 12, color: "var(--color-text-warning)" }}>{totalFound} Findings bisher</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scan.url}</div>
        <div style={{ height: 4, borderRadius: 2, background: "var(--color-border-tertiary)", marginBottom: 16, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 2, background: scan.status === "failed" ? "var(--color-text-danger)" : "var(--color-text-info)", width: `${pct}%`, transition: "width 0.5s ease" }}/>
        </div>
        {steps.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {steps.map((s, i) => {
                const isDone    = s.status === "ok" || s.status === "error";
                const isCurrent = !isDone && i === doneCount;
                return (
                    <div key={s.stepIndex} style={{ display: "flex", alignItems: "center", gap: 10, opacity: (!isDone && !isCurrent) ? 0.4 : 1 }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9,
                        background: isDone ? "var(--color-background-success)" : isCurrent ? "var(--color-background-info)" : "var(--color-background-secondary)",
                        border: `1px solid ${isDone ? "var(--color-border-success)" : isCurrent ? "var(--color-border-info)" : "var(--color-border-tertiary)"}`,
                        color: isDone ? "var(--color-text-success)" : isCurrent ? "var(--color-text-info)" : "var(--color-text-tertiary)" }}>
                        {isDone ? "✓" : isCurrent ? "…" : ""}
                      </div>
                      <div style={{ flex: 1, fontSize: 12, fontWeight: isCurrent ? 500 : 400, color: isCurrent ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>{s.description}</div>
                      {s.findingCount > 0 && <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 99, background: "var(--color-background-warning)", color: "var(--color-text-warning)" }}>{s.findingCount}</span>}
                    </div>
                );
              })}
            </div>
        ) : (
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Claude analysiert Seite und plant Schritte…</div>
        )}
        {scan.status === "done"   && <div style={{ marginTop: 14, fontSize: 12, color: "var(--color-text-success)", fontWeight: 500 }}>Abgeschlossen — Ergebnisse werden geladen…</div>}
        {scan.status === "failed" && <div style={{ marginTop: 14, fontSize: 12, color: "var(--color-text-danger)" }}>{scan.error ?? "Scan fehlgeschlagen"}</div>}
      </div>
  );
}

// ── FindingCard ───────────────────────────────────────────────────────────────

function FindingCard({ finding, selected, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const wcagLabel = (finding.wcag_tags ?? [])
      .find(t => /^wcag\d+$/.test(t))?.replace("wcag","")?.split("").join(".") ?? "?";

  return (
      <div style={{ borderRadius: 10, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
          <input type="checkbox" checked={selected} onClick={e => e.stopPropagation()} onChange={onToggle} style={{ cursor: "pointer", flexShrink: 0 }}/>
          <Badge sev={finding.severity}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{finding.rule_id}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {finding.flow_step_description
                ? finding.flow_step_description.startsWith("http")
                  ? finding.flow_step_description
                  : `Schritt: ${finding.flow_step_description}`
                : finding.selector}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "var(--color-background-primary)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-tertiary)" }}>WCAG {wcagLabel}</span>
            {finding.jira_key && <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "var(--color-background-success)", color: "var(--color-text-success)" }}>{finding.jira_key}</span>}
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{expanded ? "▲" : "▼"}</span>
          </div>
        </div>
        {expanded && (
            <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--color-border-tertiary)" }}>
              {finding.flow_step_description && (
                finding.flow_step_description.startsWith("http")
                  ? <div style={{ marginTop: 10, fontSize: 12, padding: "6px 10px", borderRadius: 6, background: "var(--color-background-info)", color: "var(--color-text-info)" }}>
                      Seite: <a href={finding.flow_step_description} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{finding.flow_step_description}</a>
                    </div>
                  : <div style={{ marginTop: 10, fontSize: 12, padding: "6px 10px", borderRadius: 6, background: "var(--color-background-info)", color: "var(--color-text-info)" }}>Reproduzieren: {finding.flow_step_description}</div>
              )}
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>Betroffenes Element</div>
              <pre style={{ margin: 0, fontSize: 11, padding: "8px 10px", borderRadius: 6, background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", overflowX: "auto", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{finding.html}</pre>
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>Fix-Hinweis</div>
              <div style={{ fontSize: 13, padding: "8px 10px", borderRadius: 6, background: "var(--color-background-success)", color: "var(--color-text-success)", border: "1px solid var(--color-border-success)" }}>{finding.fix_hint}</div>
              {finding.help_url && <a href={finding.help_url} style={{ display: "block", marginTop: 8, fontSize: 11, color: "var(--color-text-info)" }}>Dokumentation →</a>}
            </div>
        )}
      </div>
  );
}

// ── Haupt-Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [view,        setView]        = useState("scans");
  const [activeScan,  setActiveScan]  = useState(null);
  const [findings,    setFindings]    = useState([]);
  const [findLoading, setFindLoading] = useState(false);
  const [sevFilter,   setSevFilter]   = useState("all");
  const [selected,    setSelected]    = useState(new Set());
  const [showDialog,  setShowDialog]  = useState(false);
  const [flowScanId,  setFlowScanId]  = useState(null);
  const [exporting,   setExporting]   = useState(false);
  const [apiError,    setApiError]    = useState(null);

  const { scans, loading, error: scanError, startScan, updateScan } = useScans();

  // Polling
  const handleUpdate = useCallback((updated) => {
    updateScan(updated);
    if (activeScan?.id === updated.id) setActiveScan(updated);
    if (updated.id === flowScanId && updated.status !== "running") setFlowScanId(null);
  }, [activeScan, flowScanId, updateScan]);
  const { poll } = useScanPoller(handleUpdate);

  // Findings laden wenn Scan ausgewählt
  useEffect(() => {
    if (!activeScan?.id || activeScan.status !== "done") { setFindings([]); return; }
    setFindLoading(true);
    scansApi.get(activeScan.id)
        .then(data => setFindings(data.findings ?? []))
        .catch(() => setFindings([]))
        .finally(() => setFindLoading(false));
  }, [activeScan?.id, activeScan?.status]);

  const handleStart = useCallback(async (body) => {
    setShowDialog(false);
    setApiError(null);
    try {
      const scanId = await startScan(body);
      poll(scanId);
      if (body.mode === "flow") setFlowScanId(scanId);
    } catch (e) { setApiError(e.message); }
  }, [startScan, poll]);

  const filtered = sevFilter === "all" ? findings : findings.filter(f => f.severity === sevFilter);
  const toggle   = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(f => f.id)));

  const handleExport = async () => {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      const result = await jiraApi.export([...selected]);
      result.created.forEach(({ findingId, jiraKey }) => {
        setFindings(fs => fs.map(f => f.id === findingId ? { ...f, jira_key: jiraKey } : f));
      });
      setSelected(new Set());
    } catch (e) { setApiError(e.message); }
    finally    { setExporting(false); }
  };

  const navBtn = (id, label) => (
      <button onClick={() => setView(id)} style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, background: view===id?"var(--color-background-info)":"transparent", color: view===id?"var(--color-text-info)":"var(--color-text-secondary)" }}>{label}</button>
  );

  const flowScan = flowScanId ? scans.find(s => s.id === flowScanId) : null;

  if (showDialog) return <ScanDialog onClose={() => setShowDialog(false)} onStart={handleStart}/>;

  return (
      <div style={{ fontFamily: "var(--font-sans)", color: "var(--color-text-primary)", padding: "16px 0" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>Accessibility Dashboard</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>axe-core · WCAG 2.1</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4, background: "var(--color-background-secondary)", borderRadius: 8, padding: 4 }}>
              {navBtn("scans","Scans")}{navBtn("findings","Findings")}
            </div>
            <button onClick={() => setShowDialog(true)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "var(--color-text-info)", color: "#fff", fontSize: 13, fontWeight: 500 }}>+ Scan starten</button>
          </div>
        </div>

        {/* Fehleranzeige */}
        {(apiError || scanError) && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--color-background-danger)", color: "var(--color-text-danger)", fontSize: 13, marginBottom: 16 }}>
              {apiError || scanError}
              <button onClick={() => setApiError(null)} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "inherit" }}>✕</button>
            </div>
        )}

        {/* Flow-Fortschritt */}
        {flowScan && view === "scans" && (
            <FlowProgress scan={flowScan} onDone={() => setFlowScanId(null)}/>
        )}

        {/* SCANS VIEW */}
        {view === "scans" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {loading && scans.length === 0 && (
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "40px 0", textAlign: "center" }}>Lädt…</div>
              )}
              {!loading && scans.length === 0 && (
                  <div style={{ textAlign: "center", padding: "48px 0", color: "var(--color-text-secondary)" }}>
                    <div style={{ fontSize: 14, marginBottom: 8 }}>Noch keine Scans</div>
                    <div style={{ fontSize: 13 }}>Klicke auf „+ Scan starten" um loszulegen.</div>
                  </div>
              )}
              {scans.map(s => (
                  <div key={s.id} onClick={() => s.status==="done" && (setActiveScan(s), setView("findings"))}
                       style={{ padding: 14, borderRadius: 10, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", cursor: s.status==="done"?"pointer":"default", opacity: s.status==="running"?0.65:1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4, display: "flex", gap: 8 }}>
                          <span>{new Date(s.created_at).toLocaleString("de-DE")}</span>
                          <span style={{ padding: "1px 6px", borderRadius: 4, background: s.mode==="flow"?"var(--color-background-info)":"var(--color-background-secondary)", color: s.mode==="flow"?"var(--color-text-info)":"var(--color-text-tertiary)", border: "0.5px solid var(--color-border-tertiary)" }}>
                      {s.mode==="flow"?"Flow (KI)":"Snapshot"}
                    </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>
                        {s.status==="running" ? <span style={{ fontSize: 12, color: "var(--color-text-info)" }}>Läuft…</span>
                            : s.status==="failed" ? <span style={{ fontSize: 12, color: "var(--color-text-danger)" }}>Fehlgeschlagen</span>
                                : ["critical","serious","moderate","minor"].map(sev => s[sev]>0 && (
                                    <span key={sev} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 99, background: SEV[sev].bg, color: SEV[sev].color }}>{s[sev]} {SEV[sev].label}</span>
                                ))
                        }
                      </div>
                    </div>
                    {s.status==="done" && <SevBar scan={s}/>}
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 6 }}>
                      {s.status==="running" ? "Scan läuft…" : s.status==="failed" ? (s.error ?? "Fehler") : `${s.total} Findings gesamt`}
                    </div>
                  </div>
              ))}
            </div>
        )}

        {/* FINDINGS VIEW */}
        {view === "findings" && (
            <div>
              {/* Scan-Tabs */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {scans.filter(s => s.status==="done").map(s => (
                    <button key={s.id} onClick={() => { setActiveScan(s); setSelected(new Set()); setSevFilter("all"); }}
                            style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid var(--color-border-secondary)", cursor: "pointer", fontSize: 12, fontWeight: 500, background: activeScan?.id===s.id?"var(--color-background-info)":"var(--color-background-secondary)", color: activeScan?.id===s.id?"var(--color-text-info)":"var(--color-text-secondary)" }}>
                      {s.url.replace("https://","")} <span style={{ opacity: 0.6 }}>{s.total}</span>
                    </button>
                ))}
              </div>

              {!activeScan ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-secondary)", fontSize: 13 }}>Scan oben auswählen</div>
              ) : (<>
                {/* Severity-Filter */}
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  {["all","critical","serious","moderate","minor"].map(f => (
                      <button key={f} onClick={() => { setSevFilter(f); setSelected(new Set()); }}
                              style={{ padding: "4px 12px", borderRadius: 20, border: "1px solid var(--color-border-secondary)", cursor: "pointer", fontSize: 12, background: sevFilter===f?"var(--color-background-info)":"transparent", color: sevFilter===f?"var(--color-text-info)":"var(--color-text-secondary)" }}>
                        {f==="all"?"Alle":SEV[f].label}{f!=="all"&&<span style={{ marginLeft:5,opacity:.6 }}>{findings.filter(x=>x.severity===f).length}</span>}
                      </button>
                  ))}
                </div>

                {/* Toolbar */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", color: "var(--color-text-secondary)" }}>
                    <input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleAll}/>
                    Alle wählen
                  </label>
                  {selected.size > 0 && (
                      <button onClick={handleExport} disabled={exporting} style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "none", cursor: exporting?"not-allowed":"pointer", background: "var(--color-text-info)", color: "#fff", fontSize: 12, fontWeight: 500, opacity: exporting?0.6:1 }}>
                        {exporting ? "Exportiert…" : `${selected.size} Findings → Jira`}
                      </button>
                  )}
                </div>

                {/* Findings */}
                {findLoading ? (
                    <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "24px 0", textAlign: "center" }}>Lädt…</div>
                ) : filtered.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "24px 0", textAlign: "center" }}>Keine Findings für diesen Filter</div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {filtered.map(f => <FindingCard key={f.id} finding={f} selected={selected.has(f.id)} onToggle={() => toggle(f.id)}/>)}
                    </div>
                )}
              </>)}
            </div>
        )}
      </div>
  );
}