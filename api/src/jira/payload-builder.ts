import type { Finding } from "../types.js";

// ── Severity → Jira-Priorität ─────────────────────────────────────────────────

const PRIORITY: Record<Finding["severity"], string> = {
    critical: "Highest",
    serious:  "High",
    moderate: "Medium",
    minor:    "Low",
};

// ── WCAG-Tag → lesbares Kriterium ─────────────────────────────────────────────
// axe gibt Tags wie "wcag111", "wcag143" zurück → "1.1.1", "1.4.3"

function wcagCriterion(tags: string[]): string {
    const tag = tags.find(t => /^wcag\d{3,4}$/.test(t));
    if (!tag) return "?";
    return tag.replace("wcag", "").split("").join(".");
}

function wcagLevel(tags: string[]): string {
    if (tags.includes("wcag2aaa")) return "AAA";
    if (tags.includes("wcag2aa"))  return "AA";
    return "A";
}

// ── ADF-Hilfsbausteine (Atlassian Document Format) ───────────────────────────

const h3 = (text: string) => ({
    type: "heading", attrs: { level: 3 },
    content: [{ type: "text", text }],
});

const p = (text: string) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
});

const code = (text: string, language: string) => ({
    type: "codeBlock", attrs: { language },
    content: [{ type: "text", text }],
});

const bullet = (text: string) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

// ── Haupt-Builder ─────────────────────────────────────────────────────────────

export function buildIssuePayload(
    f:          Finding,
    projectKey: string,
    sourceUrl?: string,
) {
    const criterion = wcagCriterion(f.wcagTags);
    const level     = wcagLevel(f.wcagTags);
    const summary   = `[WCAG ${criterion}] ${f.description.slice(0, 90)}`;

    const descriptionContent = [
        p(
            `axe-core hat${sourceUrl ? ` auf ${sourceUrl}` : ""} einen Accessibility-Verstoß gefunden. ` +
            `Verletzt WCAG 2.1 Erfolgskriterium ${criterion} (Level ${level}).`
        ),

        // Flow-Kontext (nur bei Flow-Scans)
        ...(f.flowStepDescription ? [
            h3("Reproduzieren"),
            p(`Tritt auf in: ${f.flowStepDescription}`),
        ] : []),

        h3("Betroffenes Element"),
        p("CSS-Selektor"),
        code(f.selector, "css"),
        p("HTML-Snippet"),
        code(f.html, "html"),

        h3("Fix-Hinweis"),
        p(f.fixHint),

        h3("Metadaten"),
        {
            type: "bulletList",
            content: [
                bullet(`axe-Regel: ${f.ruleId}`),
                bullet(`WCAG-Kriterium: ${criterion} · Level ${level}`),
                bullet(`Severity: ${f.severity}`),
                ...(sourceUrl       ? [bullet(`Geprüfte URL: ${sourceUrl}`)]         : []),
                ...(f.flowStepDescription ? [bullet(`Flow-Schritt: ${f.flowStepDescription}`)] : []),
                bullet(`Scan-ID: ${f.scanId}`),
                bullet("Quelle: axe-core · auto-generated"),
            ],
        },

        p(`Weitere Infos: ${f.helpUrl}`),
    ];

    return {
        fields: {
            project:     { key: projectKey },
            issuetype:   { name: process.env.JIRA_ISSUE_TYPE ?? "Bug" },
            priority:    { name: PRIORITY[f.severity] },
            summary,
            description: { type: "doc", version: 1, content: descriptionContent },
            labels: [
                "a11y",
                f.severity,
                `wcag-${criterion}`,
                `wcag-${level}`,
                f.ruleId,
                "auto-generated",
            ],
        },
    };
}