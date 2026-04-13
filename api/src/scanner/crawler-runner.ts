import { chromium, type Page } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { randomUUID } from "crypto";
import type { Finding } from "../types.js";
import { takeAnnotatedScreenshot } from "./screenshot-helper.js";

const WCAG_TAGS: Record<"A" | "AA" | "AAA", string[]> = {
    A:   ["wcag2a"],
    AA:  ["wcag2a", "wcag2aa"],
    AAA: ["wcag2a", "wcag2aa", "wcag2aaa"],
};

interface PageResult {
    url:            string;
    status:         "done" | "failed";
    findings:       Omit<Finding, "scanId">[];
    screenshotUrl?: string;
}

export interface CrawlScanResult {
    pages:       PageResult[];
    allFindings: Omit<Finding, "scanId">[];
}

// ── Links auf einer Seite sammeln (nur selbe Origin) ─────────────────────────

async function collectLinks(page: Page, origin: string): Promise<string[]> {
    const hrefs = await page.$$eval("a[href]", els =>
        els.map(el => (el as HTMLAnchorElement).href)
    );

    return hrefs
        .filter(href => {
            try {
                const u = new URL(href);
                return u.origin === origin && !href.includes("#");
            } catch {
                return false;
            }
        })
        .map(href => new URL(href).pathname)  // nur Pfad — Query ignorieren
        .filter((v, i, arr) => arr.indexOf(v) === i); // deduplizieren
}

// ── axe auf einer Seite ausführen ─────────────────────────────────────────────

async function runAxeOnPage(page: Page, wcagLevel: "A" | "AA" | "AAA"): Promise<Omit<Finding, "scanId">[]> {
    const results = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS[wcagLevel])
        .analyze();

    return results.violations.flatMap(violation =>
        violation.nodes.map(node => ({
            id:                    randomUUID(),
            ruleId:                violation.id,
            description:           violation.description,
            selector:              node.target.join(", "),
            html:                  node.html,
            fixHint:               node.failureSummary ?? violation.description,
            helpUrl:               violation.helpUrl,
            severity:              (violation.impact ?? "minor") as Finding["severity"],
            wcagTags:              violation.tags,
            flowStepDescription:   page.url(),  // Seiten-URL als Kontext
        }))
    );
}

// ── Haupt-Export ──────────────────────────────────────────────────────────────

export async function runCrawlScan(
    startUrl:        string,
    wcagLevel:       "A" | "AA" | "AAA",
    maxPages:        number,
    withScreenshots: boolean = false,
    scanId:          string  = "",
): Promise<CrawlScanResult> {
    const origin  = new URL(startUrl).origin;
    const visited = new Set<string>();
    const queue   = [startUrl];
    const pages:  PageResult[] = [];

    const browser = await chromium.launch();
    const context = await browser.newContext();

    try {
        while (queue.length > 0 && pages.length < maxPages) {
            const url = queue.shift()!;
            const key = new URL(url).pathname;

            if (visited.has(key)) continue;
            visited.add(key);

            const page = await context.newPage();
            try {
                await page.goto(url, { waitUntil: "load", timeout: 30000 });

                const findings = await runAxeOnPage(page, wcagLevel);

                let screenshotUrl: string | undefined;
                if (withScreenshots && scanId) {
                    try {
                        screenshotUrl = await takeAnnotatedScreenshot(
                            page,
                            findings.map(f => f.selector),
                            scanId,
                            `page_${pages.length}.jpg`,
                        );
                    } catch { /* Screenshot-Fehler ignorieren */ }
                }

                pages.push({ url, status: "done", findings, screenshotUrl });

                // Neue Links einsammeln
                const links = await collectLinks(page, origin);
                for (const path of links) {
                    const fullUrl = `${origin}${path}`;
                    if (!visited.has(path)) queue.push(fullUrl);
                }
            } catch {
                pages.push({ url, status: "failed", findings: [], screenshotUrl: undefined });
            } finally {
                await page.close();
            }
        }
    } finally {
        await browser.close();
    }

    // Findings über alle Seiten deduplizieren (gleiche Regel + Selektor)
    const seen = new Set<string>();
    const allFindings = pages
        .flatMap(p => p.findings)
        .filter(f => {
            const key = `${f.ruleId}::${f.selector}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

    return { pages, allFindings };
}
