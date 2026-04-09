import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { randomUUID } from "crypto";
import type { Finding } from "../types.js";

const WCAG_TAGS: Record<"A" | "AA" | "AAA", string[]> = {
    A:   ["wcag2a"],
    AA:  ["wcag2a", "wcag2aa"],
    AAA: ["wcag2a", "wcag2aa", "wcag2aaa"],
};

export async function runAxe(url: string, wcagLevel: "A" | "AA" | "AAA"): Promise<Omit<Finding, "scanId">[]> {
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "networkidle" });

        const results = await new AxeBuilder({ page })
            .withTags(WCAG_TAGS[wcagLevel])
            .analyze();

        return results.violations.flatMap(violation =>
            violation.nodes.map(node => ({
                id:          randomUUID(),
                ruleId:      violation.id,
                description: violation.description,
                selector:    node.target.join(", "),
                html:        node.html,
                fixHint:     node.failureSummary ?? violation.description,
                helpUrl:     violation.helpUrl,
                severity:    (violation.impact ?? "minor") as Finding["severity"],
                wcagTags:    violation.tags,
            }))
        );
    } finally {
        await browser.close();
    }
}