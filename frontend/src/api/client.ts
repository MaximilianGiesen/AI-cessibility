// Zentraler API-Client — alle fetch()-Aufrufe laufen hier durch.
// BASE_URL kommt aus der Umgebungsvariable, sodass dev/staging/prod
// unterschiedliche Backends nutzen können.

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const BASE = API_BASE;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        headers: { "Content-Type": "application/json", ...init?.headers },
        ...init,
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`API ${res.status}: ${err}`);
    }
    return res.json();
}

// ── Scans ─────────────────────────────────────────────────────────────────────

export interface StartScanBody {
    url:         string;
    wcag_level:  "A" | "AA" | "AAA";
    mode:        "snapshot" | "flow";
    flow_goal?:  string;
    screenshots?: boolean;
    auto_jira?:  boolean;
    project_key?: string;
}

export interface Scan {
    id:          string;
    url:         string;
    wcag_level:  string;
    mode:        "snapshot" | "flow";
    status:      "running" | "done" | "failed";
    total:       number;
    critical:    number;
    serious:     number;
    moderate:    number;
    minor:       number;
    flow_goal?:  string;
    flow_meta?:  FlowMeta;
    error?:      string;
    created_at:  string;
    finished_at?: string;
}

export interface FlowMeta {
    goal:      string;
    testData:  Record<string, string>;
    steps:     FlowStepSummary[];
}

export interface FlowStepSummary {
    stepIndex:     number;
    description:   string;
    action:        string;
    status:        "ok" | "error";
    findingCount:  number;
    screenshotUrl?: string;
}

export const scansApi = {
    start:  (body: StartScanBody) =>
        request<{ scan_id: string; status: string }>("/scans", { method: "POST", body: JSON.stringify(body) }),

    get:    (id: string) =>
        request<Scan & { findings: Finding[] }>(`/scans/${id}`),

    list:   () =>
        request<Scan[]>("/scans"),
};

// ── Findings ──────────────────────────────────────────────────────────────────

export interface Finding {
    id:                   string;
    scan_id:              string;
    rule_id:              string;
    description:          string;
    selector:             string;
    html:                 string;
    fix_hint:             string;
    help_url:             string;
    severity:             "critical" | "serious" | "moderate" | "minor";
    wcag_tags:            string[];
    flow_step?:           number;
    flow_step_description?: string;
    jira_key?:            string;
    created_at:           string;
}

export const findingsApi = {
    list: (scanId: string) =>
        request<Finding[]>(`/findings?scan_id=${scanId}`),
};

// ── Jira ──────────────────────────────────────────────────────────────────────

export interface ExportResult {
    created: { findingId: string; jiraKey: string; jiraUrl: string }[];
    skipped: number;
    failed:  { findingId: string; error: string }[];
}

export const jiraApi = {
    export: (findingIds: string[], projectKey = "ACC") =>
        request<ExportResult>("/jira/export", {
            method: "POST",
            body: JSON.stringify({ finding_ids: findingIds, project_key: projectKey }),
        }),
};