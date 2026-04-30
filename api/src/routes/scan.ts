import { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { readFile, rm } from "fs/promises";
import { join } from "path";
import { db } from "../db/client.js";
import { runJiraAutomator } from "../jira/automator.js";
import { SCREENSHOTS_BASE } from "../scanner/screenshot-helper.js";

const ScanBody = z.object({
    url:          z.string().url(),
    wcag_level:   z.enum(["A", "AA", "AAA"]).default("AA"),
    project_key:  z.string().default("AC"),
    auto_jira:    z.boolean().default(false),
    mode:         z.enum(["snapshot", "flow", "crawl"]).default("snapshot"),
    flow_goal:    z.string().optional(),
    screenshots:  z.boolean().default(false),
    max_pages:    z.number().int().min(1).max(100).default(20),
});

export async function scanRoutes(app: FastifyInstance) {

    // POST /scans — Scan starten
    app.post("/scans", async (req, reply) => {
        const body = ScanBody.safeParse(req.body);
        if (!body.success) return reply.status(400).send(body.error);

        const { url, wcag_level, project_key, auto_jira, mode, flow_goal, screenshots, max_pages } = body.data;
        const scanId = randomUUID();

        await db.insertInto("scans").values({
            id:         scanId,
            url,
            wcag_level,
            mode,
            flow_goal:  flow_goal ?? null,
            status:     "running",
            total:      0,
            critical:   0,
            serious:    0,
            moderate:   0,
            minor:      0,
            created_at: new Date().toISOString(),
        }).execute();

        // Sofort 202 zurückgeben — Scan läuft im Hintergrund
        reply.status(202).send({ scan_id: scanId, status: "running" });

        // Fire-and-forget
        void runScanInBackground({ scanId, url, wcag_level, project_key, auto_jira, mode, flow_goal, screenshots, max_pages });
    });

    // GET /scans/:id — Status + Ergebnis abfragen
    app.get("/scans/:id", async (req, reply) => {
        const { id } = req.params as { id: string };

        const scan = await db
            .selectFrom("scans")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();

        if (!scan) return reply.status(404).send({ error: "Scan nicht gefunden" });

        const findings = scan.status === "done"
            ? (await db.selectFrom("findings").selectAll().where("scan_id", "=", id).execute())
                .map(f => ({ ...f, wcag_tags: JSON.parse(f.wcag_tags as string) }))
            : [];

        return reply.send({
            ...scan,
            flow_meta: scan.flow_meta ? JSON.parse(scan.flow_meta as string) : null,
            findings,
        });
    });

    // DELETE /scans/:id — Scan + Findings + Screenshots löschen
    app.delete("/scans/:id", async (req, reply) => {
        const { id } = req.params as { id: string };

        const scan = await db
            .selectFrom("scans").select("id")
            .where("id", "=", id)
            .executeTakeFirst();

        if (!scan) return reply.status(404).send({ error: "Scan nicht gefunden" });

        // Jira-Tickets für Findings dieses Scans löschen
        const findingIds = (await db
            .selectFrom("findings").select("id")
            .where("scan_id", "=", id)
            .execute()
        ).map(f => f.id);

        if (findingIds.length > 0) {
            await db.deleteFrom("jira_tickets")
                .where("finding_id", "in", findingIds)
                .execute();
        }

        // Findings löschen
        await db.deleteFrom("findings").where("scan_id", "=", id).execute();

        // Scan löschen
        await db.deleteFrom("scans").where("id", "=", id).execute();

        // Screenshot-Verzeichnis entfernen (best-effort)
        rm(join(SCREENSHOTS_BASE, id), { recursive: true, force: true }).catch(() => {});

        return reply.send({ ok: true });
    });

    // GET /screenshots/:scanId/:filename — Screenshot ausliefern
    app.get("/screenshots/:scanId/:filename", async (req, reply) => {
        const { scanId, filename } = req.params as { scanId: string; filename: string };
        // Pfad-Traversal verhindern: nur UUID-Format und sichere Dateinamen erlauben
        if (!/^[\da-f-]{36}$/.test(scanId) || !/^[\w.]+$/.test(filename)) {
            return reply.status(400).send({ error: "Ungültiger Pfad" });
        }
        const filePath = join(SCREENSHOTS_BASE, scanId, filename);
        try {
            const data = await readFile(filePath);
            return reply.type("image/jpeg").send(data);
        } catch {
            return reply.status(404).send({ error: "Screenshot nicht gefunden" });
        }
    });

    // GET /scans — Liste aller Scans
    app.get("/scans", async (_req, reply) => {
        const scans = await db
            .selectFrom("scans")
            .selectAll()
            .orderBy("created_at", "desc")
            .limit(50)
            .execute();

        return reply.send(scans.map(s => ({
            ...s,
            flow_meta: s.flow_meta ? JSON.parse(s.flow_meta as string) : null,
        })));
    });

    // GET /findings — Findings eines Scans
    app.get("/findings", async (req, reply) => {
        const { scan_id } = req.query as { scan_id?: string };
        if (!scan_id) return reply.status(400).send({ error: "scan_id required" });

        const findings = await db
            .selectFrom("findings")
            .selectAll()
            .where("scan_id", "=", scan_id)
            .execute();

        return reply.send(findings.map(f => ({
            ...f,
            wcag_tags: JSON.parse(f.wcag_tags as string),
        })));
    });
}

// Hintergrundlogik

async function runScanInBackground(opts: {
    scanId:      string;
    url:         string;
    wcag_level:  "A" | "AA" | "AAA";
    project_key: string;
    auto_jira:   boolean;
    mode:        "snapshot" | "flow" | "crawl";
    flow_goal?:  string;
    screenshots: boolean;
    max_pages:   number;
}) {
    const { scanId, url, wcag_level, project_key, auto_jira, mode, flow_goal, screenshots, max_pages } = opts;

    try {
        let findings: any[];
        let flowMeta: object | undefined;

        if (mode === "flow") {
            const { runFlowScan } = await import("../scanner/flow-runner.js");
            const result = await runFlowScan(
                url,
                flow_goal ?? "Prüfe die wichtigsten User-Flows auf Accessibility",
                wcag_level,
                screenshots,
                scanId,
            );
            findings = result.allFindings;
            flowMeta = {
                goal:     result.goal,
                testData: result.testData,
                steps:    result.steps.map(s => ({
                    stepIndex:     s.stepIndex,
                    description:   s.description,
                    status:        s.status,
                    findingCount:  s.findings.length,
                    screenshotUrl: s.screenshotUrl,
                })),
            };
        } else if (mode === "crawl") {
            const { runCrawlScan } = await import("../scanner/crawler-runner.js");
            const result = await runCrawlScan(url, wcag_level, max_pages, screenshots, scanId);
            findings = result.allFindings;
            flowMeta = {
                pagesScanned: result.pages.length,
                pages: result.pages.map((p: { url: string; status: string; findings: unknown[]; screenshotUrl?: string }) => ({
                    url:           p.url,
                    status:        p.status,
                    findingCount:  p.findings.length,
                    screenshotUrl: p.screenshotUrl,
                })),
            };
        } else {
            const { runAxe } = await import("../scanner/axe-runner.js");
            const result = await runAxe(url, wcag_level, screenshots, scanId);
            findings = result.findings;
            if (result.screenshotUrl) {
                flowMeta = { screenshotUrl: result.screenshotUrl };
            }
        }

        if (findings.length > 0) {
            await db.insertInto("findings").values(
                findings.map(f => ({
                    id:                    f.id ?? randomUUID(),
                    scan_id:               scanId,
                    rule_id:               f.ruleId,
                    description:           f.description,
                    selector:              f.selector,
                    html:                  f.html,
                    fix_hint:              f.fixHint,
                    help_url:              f.helpUrl,
                    severity:              f.severity,
                    wcag_tags:             JSON.stringify(f.wcagTags),
                    flow_step:             f.flowStep ?? null,
                    flow_step_description: f.flowStepDescription ?? null,
                    jira_key:              null,
                    created_at:            new Date().toISOString(),
                }))
            ).execute();
        }

        await db.updateTable("scans").set({
            status:      "done",
            total:       findings.length,
            critical:    findings.filter(f => f.severity === "critical").length,
            serious:     findings.filter(f => f.severity === "serious").length,
            moderate:    findings.filter(f => f.severity === "moderate").length,
            minor:       findings.filter(f => f.severity === "minor").length,
            flow_meta:   flowMeta ? JSON.stringify(flowMeta) : null,
            finished_at: new Date().toISOString(),
        }).where("id", "=", scanId).execute();

        if (auto_jira && findings.length > 0) {
            const critical = findings.filter(f =>
                f.severity === "critical" || f.severity === "serious"
            );
            if (critical.length > 0) await runJiraAutomator(critical, project_key, url);
        }

    } catch (err) {
        await db.updateTable("scans").set({
            status: "failed",
            error:  String(err),
        }).where("id", "=", scanId).execute();
    }
}