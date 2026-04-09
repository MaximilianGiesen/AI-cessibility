import { useState } from "react";
import type { StartScanBody } from "../api/client";

interface Props {
    onClose: () => void;
    onStart: (body: StartScanBody) => void;
}

export function ScanDialog({ onClose, onStart }: Props) {
    const [url,       setUrl]       = useState("");
    const [wcag,      setWcag]      = useState<"A"|"AA"|"AAA">("AA");
    const [mode,      setMode]      = useState<"snapshot"|"flow">("snapshot");
    const [goal,      setGoal]      = useState("");
    const [screenshots, setScreenshots] = useState(false);
    const [autoJira,  setAutoJira]  = useState(false);
    const [urlError,  setUrlError]  = useState("");

    const isValidUrl = (s: string) => { try { new URL(s); return true; } catch { return false; } };
    const canSubmit  = isValidUrl(url) && (mode === "snapshot" || goal.trim().length > 0);

    const handleSubmit = () => {
        if (!isValidUrl(url)) { setUrlError("Gültige URL inkl. https:// eingeben"); return; }
        onStart({ url, wcag_level: wcag, mode, flow_goal: goal || undefined, screenshots, auto_jira: autoJira });
    };

    // Gemeinsame Styles
    const inp: React.CSSProperties = {
        width: "100%", padding: "8px 10px", borderRadius: 8,
        border: "1px solid var(--color-border-secondary)",
        background: "var(--color-background-primary)",
        color: "var(--color-text-primary)", fontSize: 13, boxSizing: "border-box",
    };
    const lbl: React.CSSProperties = {
        fontSize: 12, color: "var(--color-text-secondary)",
        marginBottom: 4, display: "block",
    };

    return (
        // Overlay
        <div style={{ minHeight: 400, background: "rgba(0,0,0,0.35)", display: "flex",
            alignItems: "center", justifyContent: "center",
            borderRadius: "var(--border-radius-lg)", padding: 16 }}>

            {/* Dialog */}
            <div style={{ background: "var(--color-background-primary)",
                borderRadius: "var(--border-radius-lg)",
                border: "0.5px solid var(--color-border-tertiary)",
                padding: 20, width: "100%" }}>

                {/* Titel */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>Neuen Scan starten</div>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer",
                        color: "var(--color-text-secondary)", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>✕</button>
                </div>

                {/* URL */}
                <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>URL</label>
                    <input value={url} onChange={e => { setUrl(e.target.value); setUrlError(""); }}
                           placeholder="https://example.com"
                           style={{ ...inp, borderColor: urlError ? "var(--color-border-danger)" : undefined }}/>
                    {urlError && (
                        <div style={{ fontSize: 11, color: "var(--color-text-danger)", marginTop: 4 }}>{urlError}</div>
                    )}
                </div>

                {/* WCAG-Level */}
                <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>WCAG-Level</label>
                    <div style={{ display: "flex", gap: 6 }}>
                        {(["A","AA","AAA"] as const).map(l => (
                            <button key={l} onClick={() => setWcag(l)} style={{
                                flex: 1, padding: "6px 0", borderRadius: 8, cursor: "pointer", fontSize: 13,
                                border: `1px solid ${wcag===l ? "var(--color-border-info)" : "var(--color-border-tertiary)"}`,
                                background: wcag===l ? "var(--color-background-info)" : "transparent",
                                color:      wcag===l ? "var(--color-text-info)"       : "var(--color-text-secondary)",
                            }}>WCAG {l}</button>
                        ))}
                    </div>
                </div>

                {/* Scan-Modus */}
                <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Scan-Modus</label>
                    <div style={{ display: "flex", gap: 8 }}>
                        {([
                            ["snapshot", "Snapshot",   "Einmaliger DOM-Scan"],
                            ["flow",     "Flow (KI)",  "Claude steuert User-Flow"],
                        ] as const).map(([val, title, sub]) => (
                            <div key={val} onClick={() => setMode(val)} style={{
                                flex: 1, padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                                border: `1px solid ${mode===val ? "var(--color-border-info)" : "var(--color-border-tertiary)"}`,
                                background: mode===val ? "var(--color-background-info)" : "var(--color-background-secondary)",
                            }}>
                                <div style={{ fontSize: 13, fontWeight: 500,
                                    color: mode===val ? "var(--color-text-info)" : "var(--color-text-primary)" }}>{title}</div>
                                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{sub}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Flow-Ziel */}
                {mode === "flow" && (
                    <div style={{ marginBottom: 14 }}>
                        <label style={lbl}>
                            Flow-Ziel <span style={{ color: "var(--color-text-danger)" }}>*</span>
                        </label>
                        <textarea value={goal} onChange={e => setGoal(e.target.value)}
                                  placeholder="z.B. Produkt in den Warenkorb legen und Checkout starten"
                                  rows={2} style={{ ...inp, resize: "vertical", lineHeight: 1.5 }}/>
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 3 }}>
                            Claude plant daraus 3–8 Schritte mit realistischen Testdaten.
                        </div>
                    </div>
                )}

                {/* Optionen */}
                <div style={{ marginBottom: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                    {mode === "flow" && (
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13,
                            cursor: "pointer", color: "var(--color-text-secondary)" }}>
                            <input type="checkbox" checked={screenshots} onChange={e => setScreenshots(e.target.checked)}/>
                            Screenshots nach jedem Schritt speichern
                        </label>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13,
                        cursor: "pointer", color: "var(--color-text-secondary)" }}>
                        <input type="checkbox" checked={autoJira} onChange={e => setAutoJira(e.target.checked)}/>
                        Kritische Findings sofort als Jira-Tickets anlegen
                    </label>
                </div>

                {/* Buttons */}
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={onClose} style={{
                        flex: 1, padding: "9px 0", borderRadius: 8, cursor: "pointer", fontSize: 13,
                        border: "0.5px solid var(--color-border-secondary)",
                        background: "transparent", color: "var(--color-text-secondary)",
                    }}>Abbrechen</button>
                    <button onClick={handleSubmit} disabled={!canSubmit} style={{
                        flex: 2, padding: "9px 0", borderRadius: 8, border: "none",
                        cursor: canSubmit ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 500,
                        background: "var(--color-text-info)", color: "#fff", opacity: canSubmit ? 1 : 0.45,
                    }}>{mode === "flow" ? "Flow-Scan starten" : "Snapshot-Scan starten"}</button>
                </div>
            </div>
        </div>
    );
}