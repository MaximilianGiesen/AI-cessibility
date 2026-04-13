import { useState, useMemo } from "react";
import type { Scan, Finding, FlowMeta, SnapshotMeta } from "../api/client";
import { API_BASE } from "../api/client";

interface Props {
    scans:        Scan[];
    activeScan:   Scan | null;
    findings:     Finding[];
    loading:      boolean;
    exporting:    boolean;
    onSelectScan: (scan: Scan) => void;
    onExport:     (ids: string[], projectKey?: string) => void;
}

// ── Kleine Hilfskomponenten ───────────────────────────────────────────────────

const SEV = {
    critical: { label: "Kritisch", bg: "var(--color-background-danger)",  color: "var(--color-text-danger)" },
    serious:  { label: "Hoch",     bg: "var(--color-background-warning)", color: "var(--color-text-warning)" },
    moderate: { label: "Mittel",   bg: "var(--color-background-info)",    color: "var(--color-text-info)" },
    minor:    { label: "Gering",   bg: "var(--color-background-success)", color: "var(--color-text-success)" },
} as const;

function SevBadge({ sev }: { sev: keyof typeof SEV }) {
    return (
        <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 99,
            background: SEV[sev].bg, color: SEV[sev].color }}>
      {SEV[sev].label}
    </span>
    );
}

// ── Flow-Protokoll ────────────────────────────────────────────────────────────

function FlowProtocol({ scan, findings }: { scan: Scan; findings: Finding[] }) {
    const [open, setOpen] = useState<number | null>(null);
    const meta = scan.flow_meta as FlowMeta | null;
    if (!meta?.steps) return null;

    return (
        <div style={{ borderRadius: "var(--border-radius-lg)", border: "1px solid var(--color-border-tertiary)",
            background: "var(--color-background-secondary)", padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Flow-Protokoll</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                Ziel: {meta.goal}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {meta.steps.map(s => {
                    const stepFindings = findings.filter(f => f.flow_step === s.stepIndex);
                    const hasContent   = stepFindings.length > 0 || !!s.screenshotUrl;
                    const isOpen       = open === s.stepIndex;
                    return (
                        <div key={s.stepIndex}>
                            <div
                                onClick={() => hasContent && setOpen(isOpen ? null : s.stepIndex)}
                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                                    borderRadius: 8, background: "var(--color-background-primary)",
                                    border: "0.5px solid var(--color-border-tertiary)",
                                    cursor: hasContent ? "pointer" : "default" }}>
                                <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9,
                                    background: s.status === "ok" ? "var(--color-background-success)" : "var(--color-background-danger)",
                                    color: s.status === "ok" ? "var(--color-text-success)" : "var(--color-text-danger)" }}>
                                    {s.status === "ok" ? "✓" : "✕"}
                                </div>
                                <div style={{ flex: 1, fontSize: 12 }}>{s.description}</div>
                                {s.findingCount > 0 && (
                                    <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 99,
                                        background: "var(--color-background-warning)", color: "var(--color-text-warning)" }}>
                    {s.findingCount}
                  </span>
                                )}
                                {s.screenshotUrl && (
                                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99,
                                        background: "var(--color-background-secondary)",
                                        color: "var(--color-text-tertiary)",
                                        border: "0.5px solid var(--color-border-tertiary)" }}>
                    Screenshot
                  </span>
                                )}
                                {hasContent && (
                                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {isOpen ? "▲" : "▼"}
                  </span>
                                )}
                            </div>
                            {isOpen && (
                                <div>
                                    {stepFindings.map(f => (
                                        <div key={f.id} style={{ marginTop: 4, marginLeft: 24, padding: "8px 12px",
                                            borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)",
                                            background: "var(--color-background-secondary)", fontSize: 12 }}>
                                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                                                <SevBadge sev={f.severity as keyof typeof SEV} />
                                                <span style={{ fontWeight: 500 }}>{f.rule_id}</span>
                                                <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>
                          WCAG {f.wcag_tags[0]?.replace("wcag","")?.split("").join(".")}
                        </span>
                                            </div>
                                            <div style={{ color: "var(--color-text-secondary)" }}>{f.fix_hint}</div>
                                        </div>
                                    ))}
                                    {s.screenshotUrl && (
                                        <div style={{ marginTop: 6, marginLeft: 24 }}>
                                            <img
                                                src={`${API_BASE}${s.screenshotUrl}`}
                                                alt={`Screenshot: ${s.description}`}
                                                loading="lazy"
                                                style={{ width: "100%", display: "block",
                                                    borderRadius: 6,
                                                    border: "1px solid var(--color-border-tertiary)" }}
                                            />
                                        </div>
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

// ── Finding-Karte ─────────────────────────────────────────────────────────────

function FindingCard({ finding, selected, onToggle }: {
    finding:  Finding;
    selected: boolean;
    onToggle: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const wcagLabel = finding.wcag_tags[0]?.replace("wcag","")?.split("").join(".") ?? "?";

    return (
        <div style={{ borderRadius: 10, border: "1px solid var(--color-border-tertiary)",
            background: "var(--color-background-secondary)", overflow: "hidden" }}>

            {/* Kompaktzeile */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
                 onClick={() => setExpanded(e => !e)}>
                <input type="checkbox" checked={selected} onClick={e => e.stopPropagation()}
                       onChange={onToggle} style={{ cursor: "pointer", flexShrink: 0 }}/>
                <SevBadge sev={finding.severity as keyof typeof SEV} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{finding.rule_id}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {finding.flow_step_description
                            ? `Schritt: ${finding.flow_step_description}`
                            : finding.selector}
                    </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4,
              background: "var(--color-background-primary)", color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-tertiary)" }}>
            WCAG {wcagLabel}
          </span>
                    {finding.jira_key && (
                        <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4,
                            background: "var(--color-background-success)", color: "var(--color-text-success)" }}>
              {finding.jira_key}
            </span>
                    )}
                    <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            {expanded ? "▲" : "▼"}
          </span>
                </div>
            </div>

            {/* Detailbereich */}
            {expanded && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--color-border-tertiary)" }}>
                    {finding.flow_step_description && (
                        <div style={{ marginTop: 10, fontSize: 12, padding: "6px 10px", borderRadius: 6,
                            background: "var(--color-background-info)", color: "var(--color-text-info)" }}>
                            Reproduzieren: {finding.flow_step_description}
                        </div>
                    )}
                    <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                        Betroffenes Element
                    </div>
                    <pre style={{ margin: 0, fontSize: 11, padding: "8px 10px", borderRadius: 6,
                        background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)",
                        overflowX: "auto", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>
            {finding.html}
          </pre>
                    <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                        Fix-Hinweis
                    </div>
                    <div style={{ fontSize: 13, padding: "8px 10px", borderRadius: 6,
                        background: "var(--color-background-success)", color: "var(--color-text-success)",
                        border: "1px solid var(--color-border-success)" }}>
                        {finding.fix_hint}
                    </div>
                    {finding.help_url && (
                        <a href={finding.help_url} style={{ display: "block", marginTop: 8, fontSize: 11,
                            color: "var(--color-text-info)" }}>
                            Dokumentation →
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}

// ── FindingsPanel ─────────────────────────────────────────────────────────────

export function FindingsPanel({ scans, activeScan, findings, loading, exporting, onSelectScan, onExport }: Props) {
    const [sevFilter,  setSevFilter]  = useState<string>("all");
    const [selected,   setSelected]   = useState<Set<string>>(new Set());

    const filtered = useMemo(() =>
            sevFilter === "all" ? findings : findings.filter(f => f.severity === sevFilter),
        [findings, sevFilter]
    );

    const toggle = (id: string) =>
        setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const toggleAll = () =>
        setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(f => f.id)));

    const handleExport = () => {
        onExport([...selected]);
        setSelected(new Set());
    };

    // Scan-Selektor
    const scanTabs = scans.map(s => (
        <button key={s.id} onClick={() => { onSelectScan(s); setSelected(new Set()); setSevFilter("all"); }}
                style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid var(--color-border-secondary)",
                    cursor: "pointer", fontSize: 12, fontWeight: 500,
                    background: activeScan?.id === s.id ? "var(--color-background-info)" : "var(--color-background-secondary)",
                    color:      activeScan?.id === s.id ? "var(--color-text-info)"       : "var(--color-text-secondary)" }}>
            {s.url.replace("https://","")}
            <span style={{ marginLeft: 6, opacity: 0.6 }}>{s.total}</span>
        </button>
    ));

    // Severity-Filter
    const sevTabs = (["all","critical","serious","moderate","minor"] as const).map(f => (
        <button key={f} onClick={() => { setSevFilter(f); setSelected(new Set()); }}
                style={{ padding: "4px 12px", borderRadius: 20, border: "1px solid var(--color-border-secondary)",
                    cursor: "pointer", fontSize: 12,
                    background: sevFilter === f ? "var(--color-background-info)" : "transparent",
                    color:      sevFilter === f ? "var(--color-text-info)"       : "var(--color-text-secondary)" }}>
            {f === "all" ? "Alle" : SEV[f].label}
            {f !== "all" && (
                <span style={{ marginLeft: 5, opacity: 0.6 }}>
          {findings.filter(x => x.severity === f).length}
        </span>
            )}
        </button>
    ));

    return (
        <div>
            {/* Scan-Selektor */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {scanTabs}
            </div>

            {!activeScan ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-secondary)", fontSize: 13 }}>
                    Scan oben auswählen um Findings zu sehen
                </div>
            ) : (
                <>
                    {/* Flow-Protokoll (nur bei Flow-Scans) */}
                    {activeScan.mode === "flow" && activeScan.flow_meta && (
                        <FlowProtocol scan={activeScan} findings={findings} />
                    )}

                    {/* Screenshot (Snapshot-Scan) */}
                    {activeScan.mode === "snapshot" && (activeScan.flow_meta as SnapshotMeta)?.screenshotUrl && (
                        <div style={{ borderRadius: "var(--border-radius-lg)",
                            border: "1px solid var(--color-border-tertiary)",
                            background: "var(--color-background-secondary)",
                            padding: 16, marginBottom: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
                                Screenshot mit markierten Verstößen
                            </div>
                            <img
                                src={`${API_BASE}${(activeScan.flow_meta as SnapshotMeta).screenshotUrl}`}
                                alt="Seiten-Screenshot mit markierten Accessibility-Verstößen"
                                loading="lazy"
                                style={{ width: "100%", display: "block",
                                    borderRadius: 6,
                                    border: "1px solid var(--color-border-tertiary)" }}
                            />
                        </div>
                    )}

                    {/* Severity-Filter */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                        {sevTabs}
                    </div>

                    {/* Toolbar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                            cursor: "pointer", color: "var(--color-text-secondary)" }}>
                            <input type="checkbox"
                                   checked={selected.size === filtered.length && filtered.length > 0}
                                   onChange={toggleAll} style={{ cursor: "pointer" }}/>
                            Alle wählen
                        </label>
                        {selected.size > 0 && (
                            <button onClick={handleExport} disabled={exporting}
                                    style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8,
                                        border: "none", cursor: exporting ? "not-allowed" : "pointer",
                                        background: "var(--color-text-info)", color: "#fff",
                                        fontSize: 12, fontWeight: 500, opacity: exporting ? 0.6 : 1 }}>
                                {exporting ? "Exportiert…" : `${selected.size} Findings → Jira`}
                            </button>
                        )}
                    </div>

                    {/* Findings-Liste */}
                    {loading ? (
                        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "24px 0", textAlign: "center" }}>
                            Lädt…
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "24px 0", textAlign: "center" }}>
                            Keine Findings für diesen Filter
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {filtered.map(f => (
                                <FindingCard key={f.id} finding={f} selected={selected.has(f.id)} onToggle={() => toggle(f.id)} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}