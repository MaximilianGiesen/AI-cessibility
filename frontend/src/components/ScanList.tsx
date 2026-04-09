import type { Scan } from "../api/client";

interface Props {
    scans:        Scan[];
    loading:      boolean;
    onSelectScan: (scan: Scan) => void;
}

const SEV_COLOR: Record<string, string> = {
    critical: "var(--color-text-danger)",
    serious:  "var(--color-text-warning)",
    moderate: "var(--color-text-info)",
    minor:    "var(--color-text-success)",
};

const SEV_BG: Record<string, string> = {
    critical: "var(--color-background-danger)",
    serious:  "var(--color-background-warning)",
    moderate: "var(--color-background-info)",
    minor:    "var(--color-background-success)",
};

const SEV_LABEL: Record<string, string> = {
    critical: "Kritisch",
    serious:  "Hoch",
    moderate: "Mittel",
    minor:    "Gering",
};

function SevBar({ scan }: { scan: Scan }) {
    const t = scan.total || 1;
    return (
        <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", gap: 1 }}>
            {(["critical","serious","moderate","minor"] as const).map(s =>
                scan[s] > 0 ? (
                    <div key={s} style={{ flex: scan[s] / t, background: SEV_COLOR[s], opacity: 0.65 }}/>
                ) : null
            )}
        </div>
    );
}

function SevPill({ sev, count }: { sev: string; count: number }) {
    if (count === 0) return null;
    return (
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99,
            background: SEV_BG[sev], color: SEV_COLOR[sev] }}>
      {count} {SEV_LABEL[sev]}
    </span>
    );
}

function ModeBadge({ mode }: { mode: "snapshot" | "flow" }) {
    return (
        <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 4,
            background: mode === "flow" ? "var(--color-background-info)" : "var(--color-background-secondary)",
            color:      mode === "flow" ? "var(--color-text-info)"       : "var(--color-text-tertiary)",
            border: "0.5px solid var(--color-border-tertiary)" }}>
      {mode === "flow" ? "Flow (KI)" : "Snapshot"}
    </span>
    );
}

export function ScanList({ scans, loading, onSelectScan }: Props) {
    if (loading && scans.length === 0) {
        return <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "32px 0", textAlign: "center" }}>Lädt…</div>;
    }

    if (scans.length === 0) {
        return (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--color-text-secondary)" }}>
                <div style={{ fontSize: 14, marginBottom: 8 }}>Noch keine Scans</div>
                <div style={{ fontSize: 13 }}>Klicke auf „+ Scan starten" um den ersten Scan anzulegen.</div>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {scans.map(scan => (
                <div
                    key={scan.id}
                    onClick={() => scan.status === "done" && onSelectScan(scan)}
                    style={{
                        padding: 16, borderRadius: 10,
                        border: "1px solid var(--color-border-tertiary)",
                        background: "var(--color-background-secondary)",
                        cursor: scan.status === "done" ? "pointer" : "default",
                        opacity: scan.status === "running" ? 0.65 : 1,
                        transition: "opacity 0.2s",
                    }}
                >
                    {/* Kopfzeile */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
                            <div style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {scan.url}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <span>{new Date(scan.created_at).toLocaleString("de-DE")}</span>
                                <ModeBadge mode={scan.mode} />
                                <span style={{ padding: "1px 7px", borderRadius: 4, fontSize: 11,
                                    background: "var(--color-background-secondary)", color: "var(--color-text-tertiary)",
                                    border: "0.5px solid var(--color-border-tertiary)" }}>
                  WCAG {scan.wcag_level}
                </span>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>
                            {scan.status === "running" ? (
                                <span style={{ fontSize: 12, color: "var(--color-text-info)" }}>Läuft…</span>
                            ) : scan.status === "failed" ? (
                                <span style={{ fontSize: 12, color: "var(--color-text-danger)" }}>Fehlgeschlagen</span>
                            ) : (
                                (["critical","serious","moderate","minor"] as const).map(s => (
                                    <SevPill key={s} sev={s} count={scan[s]} />
                                ))
                            )}
                        </div>
                    </div>

                    {/* Flow-Ziel (nur bei Flow-Scans) */}
                    {scan.mode === "flow" && scan.flow_goal && (
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 8,
                            padding: "4px 8px", borderRadius: 4, background: "var(--color-background-primary)",
                            border: "0.5px solid var(--color-border-tertiary)", overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            Ziel: {scan.flow_goal}
                        </div>
                    )}

                    {/* Severity-Balken */}
                    {scan.status === "done" && <SevBar scan={scan} />}

                    {/* Fußzeile */}
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 8 }}>
                        {scan.status === "running" ? "Scan läuft…"
                            : scan.status === "failed" ? (scan.error ?? "Unbekannter Fehler")
                                : `${scan.total} Findings gesamt`}
                    </div>
                </div>
            ))}
        </div>
    );
}