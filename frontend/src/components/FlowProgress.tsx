import { useEffect, useRef } from "react";
import type { Scan } from "../api/client";

interface Props {
    scan:   Scan;
    onDone: () => void;
}

// Schritt-Status aus flowMeta ableiten
type StepStatus = "done" | "running" | "pending" | "error";

function stepStatus(stepIndex: number, scan: Scan): StepStatus {
    if (scan.status === "done" || scan.status === "failed") return "done";

    const meta  = scan.flow_meta;
    const steps = meta?.steps ?? [];

    // Letzter abgeschlossener Schritt
    const lastDone = steps.reduce((max, s) => Math.max(max, s.stepIndex), -1);

    if (stepIndex <= lastDone) return "done";
    if (stepIndex === lastDone + 1) return "running";
    return "pending";
}

function StepIcon({ status }: { status: StepStatus }) {
    const base: React.CSSProperties = {
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 500, transition: "background 0.3s, border-color 0.3s",
    };

    const styles: Record<StepStatus, React.CSSProperties> = {
        done:    { ...base, background: "var(--color-background-success)", border: "1px solid var(--color-border-success)",  color: "var(--color-text-success)" },
        running: { ...base, background: "var(--color-background-info)",    border: "1px solid var(--color-border-info)",     color: "var(--color-text-info)" },
        pending: { ...base, background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", color: "var(--color-text-tertiary)" },
        error:   { ...base, background: "var(--color-background-danger)",  border: "1px solid var(--color-border-danger)",   color: "var(--color-text-danger)" },
    };

    return (
        <div style={styles[status]}>
            {status === "done"    && "✓"}
            {status === "running" && "…"}
            {status === "error"   && "✕"}
        </div>
    );
}

export function FlowProgress({ scan, onDone }: Props) {
    const calledDone = useRef(false);

    useEffect(() => {
        if (!calledDone.current && (scan.status === "done" || scan.status === "failed")) {
            calledDone.current = true;
            // Kurz warten damit QA den finalen Zustand sieht
            setTimeout(onDone, 1200);
        }
    }, [scan.status, onDone]);

    const meta      = scan.flow_meta;
    const steps     = meta?.steps ?? [];
    const stepCount = Math.max(steps.length, 1);

    // Fortschritt: wie viele Schritte sind abgeschlossen?
    const doneCount = scan.status === "done"
        ? stepCount
        : steps.filter(s => s.status === "ok").length;

    const progressPct = Math.round((doneCount / stepCount) * 100);

    // Gesamt-Findings bisher
    const findingsTotal = steps.reduce((sum, s) => sum + (s.findingCount ?? 0), 0);

    return (
        <div style={{
            borderRadius: "var(--border-radius-lg)",
            border: "1px solid var(--color-border-tertiary)",
            background: "var(--color-background-secondary)",
            padding: 20, marginBottom: 20,
        }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {scan.status === "done" ? "Flow-Scan abgeschlossen" : "Flow-Scan läuft"}
                </div>
                {findingsTotal > 0 && (
                    <span style={{ fontSize: 12, color: "var(--color-text-warning)" }}>
            {findingsTotal} Findings bisher
          </span>
                )}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {scan.url}
            </div>
            {scan.flow_goal && (
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 14 }}>
                    Ziel: {scan.flow_goal}
                </div>
            )}

            {/* Fortschrittsbalken */}
            <div style={{ height: 4, borderRadius: 2, background: "var(--color-border-tertiary)", marginBottom: 18, overflow: "hidden" }}>
                <div style={{
                    height: "100%", borderRadius: 2,
                    background: scan.status === "failed" ? "var(--color-text-danger)" : "var(--color-text-info)",
                    width: `${progressPct}%`, transition: "width 0.5s ease",
                }}/>
            </div>

            {/* Schritte */}
            {steps.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {steps.map(s => {
                        const status = s.status === "error" ? "error" : stepStatus(s.stepIndex, scan);
                        return (
                            <div key={s.stepIndex} style={{ display: "flex", alignItems: "center", gap: 10,
                                opacity: status === "pending" ? 0.4 : 1, transition: "opacity 0.3s" }}>
                                <StepIcon status={status} />
                                <div style={{ flex: 1, fontSize: 12,
                                    color: status === "running" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                                    fontWeight: status === "running" ? 500 : 400 }}>
                                    {s.description}
                                </div>
                                {s.findingCount > 0 && (
                                    <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 99,
                                        background: "var(--color-background-warning)", color: "var(--color-text-warning)" }}>
                    {s.findingCount}
                  </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                // Noch keine Schritte vom Backend — Claude plant gerade
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    Claude analysiert Seite und plant Schritte…
                </div>
            )}

            {/* Abschlussmeldung */}
            {scan.status === "done" && (
                <div style={{ marginTop: 14, fontSize: 12, color: "var(--color-text-success)", fontWeight: 500 }}>
                    Scan abgeschlossen — Ergebnisse werden geladen…
                </div>
            )}
            {scan.status === "failed" && (
                <div style={{ marginTop: 14, fontSize: 12, color: "var(--color-text-danger)" }}>
                    {scan.error ?? "Scan fehlgeschlagen"}
                </div>
            )}
        </div>
    );
}