import { chromium, type Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { planFlow } from "./flow-planner.js";
import type { Finding } from "../types.js";

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface StepResult {
    stepIndex:    number;
    description:  string;
    action:       string;
    status:       "ok" | "error";
    error?:       string;
    findings:     Finding[];
}

export interface FlowScanResult {
    goal:        string;
    testData:    Record<string, string>;
    steps:       StepResult[];
    allFindings: Finding[];   // dedupliziert über alle Schritte
}

// ── Einen Schritt ausführen ───────────────────────────────────────────────────

async function executeStep(page: Page, step: {
    action:   string;
    selector?: string;
    value?:   string;
    url?:     string;
    waitMs?:  number;
}): Promise<void> {
    switch (step.action) {
        case "click":
            await page.locator(step.selector!).first().click({ timeout: 5000 });
            break;
        case "fill":
            await page.locator(step.selector!).first().fill(step.value ?? "");
            break;
        case "select":
            await page.locator(step.selector!).first().selectOption(step.value ?? "");
            break;
        case "navigate":
            await page.goto(step.url!, { waitUntil: "load" });
            break;
        case "wait":
            await page.waitForTimeout(step.waitMs ?? 1000);
            break;
    }

    // Kurz warten nach jeder Interaktion — DOM-Updates, Animationen
    await page.waitForTimeout(400);
}

// ── axe nach einem Schritt ausführen ─────────────────────────────────────────

async function runAxeOnStep(
    page:        Page,
    stepIndex:   number,
    description: string,
    wcagLevel:   "A" | "AA" | "AAA",
): Promise<Finding[]> {
    const tagMap = {
        A:   ["wcag2a"],
        AA:  ["wcag2a", "wcag2aa"],
        AAA: ["wcag2a", "wcag2aa", "wcag2aaa"],
    };

    const results = await new AxeBuilder({ page })
        .withTags(tagMap[wcagLevel])
        .analyze();

    return results.violations.flatMap(v =>
        v.nodes.map(node => ({
            id:                   crypto.randomUUID(),
            ruleId:               v.id,
            description:          v.description,
            wcagTags:             v.tags.filter(t => t.startsWith("wcag")),
            severity:             v.impact as Finding["severity"],
            selector:             node.target.join(", "),
            html:                 node.html,
            helpUrl:              v.helpUrl,
            fixHint:              node.failureSummary ?? v.description,
            scanId:               "",  // wird in routes/scan.ts gesetzt
            flowStep:             stepIndex,
            flowStepDescription:  description,
        }))
    );
}

// ── Haupt-Flow-Runner ─────────────────────────────────────────────────────────

export async function runFlowScan(
    url:             string,
    goal:            string,
    wcagLevel:       "A" | "AA" | "AAA" = "AA",
    withScreenshots: boolean             = false,
): Promise<FlowScanResult> {

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page    = await context.newPage();

    try {
        await page.goto(url, { waitUntil: "load" });

        // Initialen DOM für Claude bereitstellen
        const pageHtml = await page.content();

        // Claude plant den Flow
        const plan = await planFlow(url, goal, pageHtml);

        const stepResults: StepResult[] = [];
        const seenFindings = new Set<string>(); // Dedup über alle Schritte

        // Schritt 0: Initiale Prüfung vor jeder Interaktion
        const initialFindings = await runAxeOnStep(page, 0, "Initialer Seitenaufruf", wcagLevel);
        stepResults.push({
            stepIndex:   0,
            description: "Initialer Seitenaufruf",
            action:      "navigate",
            status:      "ok",
            findings:    initialFindings,
        });
        initialFindings.forEach(f => seenFindings.add(`${f.ruleId}::${f.selector}`));

        // Jeden geplanten Schritt ausführen
        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            let status: "ok" | "error" = "ok";
            let error: string | undefined;

            try {
                await executeStep(page, step);
            } catch (err) {
                status = "error";
                error  = String(err);
                // Weitermachen — axe trotzdem ausführen
            }

            // axe nach diesem Schritt
            const stepFindings = await runAxeOnStep(page, i + 1, step.description, wcagLevel);

            // Nur neue Findings aufnehmen
            const newFindings = stepFindings.filter(f => {
                const key = `${f.ruleId}::${f.selector}`;
                if (seenFindings.has(key)) return false;
                seenFindings.add(key);
                return true;
            });

            stepResults.push({
                stepIndex:   i + 1,
                description: step.description,
                action:      step.action,
                status,
                error,
                findings:    newFindings,
            });
        }

        const allFindings = stepResults.flatMap(s => s.findings);

        return {
            goal:     plan.goal,
            testData: plan.testData,
            steps:    stepResults,
            allFindings,
        };

    } finally {
        await browser.close();
    }
}