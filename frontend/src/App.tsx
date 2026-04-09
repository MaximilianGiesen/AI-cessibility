import { useState, useCallback } from "react";
import { useScans, useScanPoller, useFindings, useJiraExport } from "./hooks/useScans";
import { ScanDialog }      from "./components/ScanDialog";
import { ScanList }        from "./components/ScanList";
import { FlowProgress }    from "./components/FlowProgress";
import { FindingsPanel }   from "./components/FindingsPanel";
import type { Scan, StartScanBody } from "./api/client";

type View = "scans" | "findings";

export default function App() {
  const [view,       setView]       = useState<View>("scans");
  const [activeScan, setActiveScan] = useState<Scan | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [flowScanId, setFlowScanId] = useState<string | null>(null);

  // ── Scans ──────────────────────────────────────────────────────────────────

  const { scans, loading, startScan, updateScan } = useScans();

  const handleScanUpdate = useCallback((updated: Scan) => {
    updateScan(updated);
    // Wenn der aktive Scan fertig ist → Findings aktualisieren
    if (activeScan?.id === updated.id) setActiveScan(updated);
    // Flow-Fortschrittsbalken ausblenden wenn fertig
    if (updated.id === flowScanId && updated.status !== "running") {
      setFlowScanId(null);
    }
  }, [activeScan, flowScanId, updateScan]);

  const { poll } = useScanPoller(handleScanUpdate);

  const handleStart = useCallback(async (body: StartScanBody) => {
    setShowDialog(false);
    const scanId = await startScan(body);
    poll(scanId);
    if (body.mode === "flow") setFlowScanId(scanId);
  }, [startScan, poll]);

  // ── Findings + Jira-Export ─────────────────────────────────────────────────

  const { findings, loading: findingsLoading, updateFinding } = useFindings(activeScan?.id ?? null);

  const handleExportSuccess = useCallback((result, ids: string[]) => {
    result.created.forEach(({ findingId, jiraKey }) => {
      updateFinding(findingId, { jira_key: jiraKey });
    });
  }, [updateFinding]);

  const { exportFindings, exporting } = useJiraExport(handleExportSuccess);

  // ── Render ─────────────────────────────────────────────────────────────────

  const flowScan = flowScanId ? scans.find(s => s.id === flowScanId) : null;

  return (
      <div style={{ fontFamily: "var(--font-sans)", maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Accessibility Dashboard</h1>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "4px 0 0" }}>axe-core · WCAG 2.1</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <nav style={{ display: "flex", gap: 4, background: "var(--color-background-secondary)", borderRadius: 8, padding: 4 }}>
              {(["scans", "findings"] as View[]).map(v => (
                  <button key={v} onClick={() => setView(v)} style={{
                    padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 500, textTransform: "capitalize",
                    background: view === v ? "var(--color-background-info)" : "transparent",
                    color:      view === v ? "var(--color-text-info)"       : "var(--color-text-secondary)",
                  }}>{v === "scans" ? "Scans" : "Findings"}</button>
              ))}
            </nav>
            <button onClick={() => setShowDialog(true)} style={{
              padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              background: "var(--color-text-info)", color: "#fff", fontSize: 13, fontWeight: 500,
            }}>+ Scan starten</button>
          </div>
        </header>

        {/* Flow-Fortschritt (nur sichtbar während KI-Flow läuft) */}
        {flowScan && view === "scans" && (
            <FlowProgress scan={flowScan} onDone={() => setFlowScanId(null)} />
        )}

        {/* Hauptinhalt */}
        {view === "scans" && (
            <ScanList
                scans={scans}
                loading={loading}
                onSelectScan={scan => { setActiveScan(scan); setView("findings"); }}
            />
        )}

        {view === "findings" && (
            <FindingsPanel
                scans={scans.filter(s => s.status === "done")}
                activeScan={activeScan}
                findings={findings}
                loading={findingsLoading}
                exporting={exporting}
                onSelectScan={setActiveScan}
                onExport={exportFindings}
            />
        )}

        {/* Scan-Dialog */}
        {showDialog && (
            <ScanDialog onClose={() => setShowDialog(false)} onStart={handleStart} />
        )}
      </div>
  );
}