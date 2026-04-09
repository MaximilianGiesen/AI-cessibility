import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { runJiraAutomator } from "../jira/automator.js";

const ExportBody = z.object({
    finding_ids: z.array(z.string().uuid()).min(1).max(100),
    project_key: z.string().default("ACC"),
});

export async function jiraRoutes(app: FastifyInstance) {

    // POST /jira/export — Findings als Jira-Tickets anlegen
    app.post("/jira/export", async (req, reply) => {
        const body = ExportBody.safeParse(req.body);
        if (!body.success) return reply.status(400).send(body.error);

        const { finding_ids, project_key } = body.data;

        // Findings aus DB laden (inkl. Scan-URL für Ticket-Kontext)
        const findings = await db
            .selectFrom("findings as f")
            .innerJoin("scans as s", "s.id", "f.scan_id")
            .select([
                "f.id",
                "f.rule_id as ruleId",
                "f.description",
                "f.selector",
                "f.html",
                "f.fix_hint as fixHint",
                "f.help_url as helpUrl",
                "f.severity",
                "f.wcag_tags as wcagTags",
                "f.scan_id as scanId",
                "f.flow_step as flowStep",
                "f.flow_step_description as flowStepDescription",
                "s.url as sourceUrl",
            ])
            .where("f.id", "in", finding_ids)
            .where("f.jira_key", "is", null)  // bereits exportierte überspringen
            .execute();

        if (findings.length === 0) {
            return reply.send({ created: [], skipped: finding_ids.length, failed: [] });
        }

        // wcag_tags ist JSON-String in der DB → parsen
        const parsed = findings.map(f => ({
            ...f,
            wcagTags: JSON.parse(f.wcagTags as string),
        }));

        const sourceUrl = parsed[0]?.sourceUrl;
        const result    = await runJiraAutomator(parsed as any, project_key, sourceUrl);

        return reply.send(result);
    });

    // GET /jira/tickets?finding_id=… — Ticket zu einem Finding abrufen
    app.get("/jira/tickets", async (req, reply) => {
        const { finding_id } = req.query as { finding_id?: string };
        if (!finding_id) return reply.status(400).send({ error: "finding_id required" });

        const ticket = await db
            .selectFrom("jira_tickets")
            .selectAll()
            .where("finding_id", "=", finding_id)
            .executeTakeFirst();

        if (!ticket) return reply.status(404).send({ error: "Kein Ticket gefunden" });
        return reply.send(ticket);
    });
}