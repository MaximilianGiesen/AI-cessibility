import { useState, useEffect, useCallback, useRef } from "react";
import { scansApi, jiraApi, type Scan, type Finding, type StartScanBody, type ExportResult } from "../api/client";

// ── usePolling ────────────────────────────────────────────────────────────────
// Generischer Polling-Hook: ruft fn() alle intervalMs auf bis stop() true zurückgibt.

export function usePolling<T>(
    fn: () => Promise<T>,
    shouldStop: (result: T) => boolean,
    intervalMs = 2000,
) {
    const [data,    setData]    = useState<T | null>(null);
    const [error,   setError]   = useState<string | null>(null);
    const [polling, setPolling] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stop = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setPolling(false);
    }, []);

    const start = useCallback(() => {
        setPolling(true);
        timerRef.current = setInterval(async () => {
            try {
                const result = await fn();
                setData(result);
                if (shouldStop(result)) stop();
            } catch (e) {
                setError(String(e));
                stop();
            }
        }, intervalMs);
    }, [fn, shouldStop, intervalMs, stop]);

    useEffect(() => () => stop(), [stop]); // cleanup beim Unmount

    return { data, error, polling, start, stop };
}

// ── useScans ──────────────────────────────────────────────────────────────────

export function useScans() {
    const [scans,   setScans]   = useState<Scan[]>([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const fetchScans = useCallback(async () => {
        try {
            const data = await scansApi.list();
            setScans(data);
        } catch (e) {
            setError(String(e));
        }
    }, []);

    useEffect(() => { fetchScans(); }, [fetchScans]);

    const startScan = useCallback(async (body: StartScanBody): Promise<string> => {
        setLoading(true);
        try {
            const { scan_id } = await scansApi.start(body);
            // Optimistisch einen "running"-Scan eintragen
            setScans(prev => [{
                id: scan_id, url: body.url, wcag_level: body.wcag_level,
                mode: body.mode, status: "running", total: 0,
                critical: 0, serious: 0, moderate: 0, minor: 0,
                flow_goal: body.flow_goal, created_at: new Date().toISOString(),
            }, ...prev]);
            return scan_id;
        } finally {
            setLoading(false);
        }
    }, []);

    // Einen einzelnen Scan in der Liste aktualisieren
    const updateScan = useCallback((updated: Scan) => {
        setScans(prev => prev.map(s => s.id === updated.id ? updated : s));
    }, []);

    return { scans, loading, error, startScan, updateScan, refetch: fetchScans };
}

// ── useScanPoller ─────────────────────────────────────────────────────────────
// Pollt einen laufenden Scan bis status "done" oder "failed".

export function useScanPoller(onUpdate: (scan: Scan) => void) {
    const activeRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

    const poll = useCallback((scanId: string) => {
        if (activeRef.current.has(scanId)) return; // schon aktiv

        const timer = setInterval(async () => {
            try {
                const scan = await scansApi.get(scanId);
                onUpdate(scan);
                if (scan.status === "done" || scan.status === "failed") {
                    clearInterval(timer);
                    activeRef.current.delete(scanId);
                }
            } catch {
                clearInterval(timer);
                activeRef.current.delete(scanId);
            }
        }, 2000);

        activeRef.current.set(scanId, timer);
    }, [onUpdate]);

    // Cleanup beim Unmount
    useEffect(() => () => {
        activeRef.current.forEach(t => clearInterval(t));
    }, []);

    return { poll };
}

// ── useFindings ───────────────────────────────────────────────────────────────

export function useFindings(scanId: string | null) {
    const [findings, setFindings] = useState<Finding[]>([]);
    const [loading,  setLoading]  = useState(false);

    useEffect(() => {
        if (!scanId) { setFindings([]); return; }
        setLoading(true);
        scansApi.get(scanId)
            .then(data => setFindings(data.findings ?? []))
            .catch(() => setFindings([]))
            .finally(() => setLoading(false));
    }, [scanId]);

    const updateFinding = useCallback((id: string, patch: Partial<Finding>) => {
        setFindings(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
    }, []);

    return { findings, loading, updateFinding };
}

// ── useJiraExport ─────────────────────────────────────────────────────────────

export function useJiraExport(onSuccess: (result: ExportResult, ids: string[]) => void) {
    const [exporting, setExporting] = useState(false);
    const [error,     setError]     = useState<string | null>(null);

    const exportFindings = useCallback(async (ids: string[], projectKey?: string) => {
        if (ids.length === 0) return;
        setExporting(true);
        setError(null);
        try {
            const result = await jiraApi.export(ids, projectKey);
            onSuccess(result, ids);
        } catch (e) {
            setError(String(e));
        } finally {
            setExporting(false);
        }
    }, [onSuccess]);

    return { exportFindings, exporting, error };
}