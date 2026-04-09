import { db } from "../db/client.js";
import { buildIssuePayload } from "./payload-builder.js";
import type { Finding } from "../types.js";

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface AutomatorResult {
    created: CreatedTicket[];
    skipped: number;
    failed:  FailedTicket[];
}

interface CreatedTicket {
    findingId: string;
    jiraKey:   string;
    jiraUrl:   string;
}

interface FailedTicket {
    findingId: string;
    error:     string;
}

interface BulkCreateResponse {
    issues: { key: string; self: string }[];
    errors?: { failedElementNumber: number; elementErrors: unknown }[];
}

// ── Jira REST API ─────────────────────────────────────────────────────────────

async function jiraRequest<T>(path: string, body: unknown): Promise<T> {
    const base  = process.env.JIRA_BASE_URL!;
    const email = process.env.JIRA_EMAIL!;
    const token = process.env.JIRA_API_TOKEN!;
    const auth  = Buffer.from(`${email}:${token}`).toString("base64");

    const res = await fetch(`${base}/rest/api/3/${path}`, {
        method:  "POST",
        headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Jira API ${res.status}: ${err}`);
    }

    return res.json();
}

// ── Deduplizierung ────────────────────────────────────────────────────────────
// Schlüssel: axe-Regel + normalisierter Selector
// Verhindert Doppeltickets bei wiederholten Scans desselben Problems.

function deduplicationKey(f: Finding): string {
    return `${f.ruleId}::${f.selector.replace(/\s+/g, " ").trim()}`;
}

async function filterAlreadyTicketed(findings: Finding[]): Promise<Finding[]> {
    const keys = findings.map(deduplicationKey);

    const existing = await db
        .selectFrom("jira_tickets")
        .select("dedup_key")
        .where("dedup_key", "in", keys)
        .execute();

    const existingSet = new Set(existing.map(r => r.dedup_key));
    return findings.filter(f => !existingSet.has(deduplicationKey(f)));
}

// ── Haupt-Export ──────────────────────────────────────────────────────────────

export async function runJiraAutomator(
    findings:   Finding[],
    projectKey: string,
    sourceUrl?: string,
): Promise<AutomatorResult> {

    // 1. Bereits exportierte Findings herausfiltern
    const fresh   = await filterAlreadyTicketed(findings);
    const skipped = findings.length - fresh.length;

    if (fresh.length === 0) {
        return { created: [], skipped, failed: [] };
    }

    // 2. Jira-Payloads bauen
    const payloads = fresh.map(f => buildIssuePayload(f, projectKey, sourceUrl));

    // 3. Bulk-Create in 50er-Chunks
    const created: CreatedTicket[] = [];
    const failed:  FailedTicket[]  = [];
    const CHUNK    = 50;

    for (let i = 0; i < payloads.length; i += CHUNK) {
        const chunkFindings = fresh.slice(i, i + CHUNK);
        const chunkPayloads = payloads.slice(i, i + CHUNK);

        try {
            const { issues, errors } = await jiraRequest<BulkCreateResponse>(
                "issue/bulk",
                { issueUpdates: chunkPayloads },
            );

            // Erfolgreiche Tickets in DB + Finding verknüpfen
            for (let j = 0; j < issues.length; j++) {
                const finding = chunkFindings[j];
                const issue   = issues[j];
                const jiraUrl = `${process.env.JIRA_BASE_URL}/browse/${issue.key}`;

                await db.insertInto("jira_tickets").values({
                    id:         crypto.randomUUID(),
                    finding_id: finding.id,
                    jira_key:   issue.key,
                    jira_url:   jiraUrl,
                    dedup_key:  deduplicationKey(finding),
                    created_at: new Date().toISOString(),
                }).execute();

                await db
                    .updateTable("findings")
                    .set({ jira_key: issue.key })
                    .where("id", "=", finding.id)
                    .execute();

                created.push({ findingId: finding.id, jiraKey: issue.key, jiraUrl });
            }

            // Teilfehler aus der Bulk-Response
            for (const err of errors ?? []) {
                const finding = chunkFindings[err.failedElementNumber];
                failed.push({
                    findingId: finding?.id ?? "unknown",
                    error:     JSON.stringify(err.elementErrors),
                });
            }

        } catch (err) {
            // Ganzer Chunk fehlgeschlagen
            for (const finding of chunkFindings) {
                failed.push({ findingId: finding.id, error: String(err) });
            }
        }
    }

    return { created, skipped, failed };
}