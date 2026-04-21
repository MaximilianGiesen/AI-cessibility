import { AxeBuilder } from "@axe-core/playwright";
import { randomUUID } from "crypto";
import type { Finding } from "../types.js";
import { takeAnnotatedScreenshot } from "./screenshot-helper.js";
import { launchBrowser, newStealthContext } from "./browser.js";

const WCAG_TAGS: Record<"A" | "AA" | "AAA", string[]> = {
    A:   ["wcag2a"],
    AA:  ["wcag2a", "wcag2aa"],
    AAA: ["wcag2a", "wcag2aa", "wcag2aaa"],
};

export interface AxeScanResult {
    findings:       Omit<Finding, "scanId">[];
    screenshotUrl?: string;
}

export async function runAxe(
    url:             string,
    wcagLevel:       "A" | "AA" | "AAA",
    withScreenshots: boolean = false,
    scanId:          string  = "",
): Promise<AxeScanResult> {
    const browser = await launchBrowser();
    try {
        const context = await newStealthContext(browser);
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

        const results = await new AxeBuilder({ page })
            .withTags(WCAG_TAGS[wcagLevel])
            .analyze();

        const findings: Omit<Finding, "scanId">[] = results.violations.flatMap(violation =>
            violation.nodes.map(node => ({
                id:                   randomUUID(),
                ruleId:               violation.id,
                description:          violation.description,
                selector:             node.target.join(", "),
                html:                 node.html,
                fixHint:              node.failureSummary ?? violation.description,
                helpUrl:              violation.helpUrl,
                severity:             (violation.impact ?? "minor") as Finding["severity"],
                wcagTags:             violation.tags,
                flowStepDescription:  url,
            }))
        );

        let screenshotUrl: string | undefined;
        if (withScreenshots && scanId) {
            try {
                screenshotUrl = await takeAnnotatedScreenshot(
                    page,
                    findings.map(f => f.selector),
                    scanId,
                    "snapshot.jpg",
                );
            } catch { /* Screenshot-Fehler ignorieren */ }
        }

        return { findings, screenshotUrl };
    } finally {
        await browser.close();
    }
}
