import { type Page } from "playwright";
import { mkdir } from "fs/promises";
import { join } from "path";

export const SCREENSHOTS_BASE = process.env.SCREENSHOTS_DIR ?? join(process.cwd(), "screenshots");

/**
 * Nimmt einen annotierten Screenshot der aktuellen Seite.
 * Alle übergebenen CSS-Selektoren werden kurz rot hervorgehoben,
 * damit Accessibility-Verstöße im Screenshot sichtbar sind.
 * Die Hervorhebung wird nach dem Screenshot wieder entfernt.
 */
export async function takeAnnotatedScreenshot(
    page:      Page,
    selectors: string[],
    scanId:    string,
    filename:  string,
): Promise<string> {
    const dir = join(SCREENSHOTS_BASE, scanId);
    await mkdir(dir, { recursive: true });

    const outputPath = join(dir, filename);

    // Hervorhebungs-CSS injizieren
    const unique = [...new Set(selectors.filter(s => s?.trim()))];
    if (unique.length > 0) {
        const css = unique
            .map(s =>
                `${s} { outline: 3px solid #e53935 !important; ` +
                `outline-offset: 2px !important; ` +
                `background: rgba(229,57,53,0.07) !important; }`
            )
            .join("\n");
        try {
            await page.evaluate((style: string) => {
                const el = document.createElement("style");
                el.id = "__a11y_highlight__";
                el.textContent = style;
                document.head.appendChild(el);
            }, css);
        } catch {
            // Injektion fehlgeschlagen — trotzdem Screenshot machen
        }
    }

    try {
        await page.screenshot({ path: outputPath, fullPage: true, type: "jpeg", quality: 75 });
    } finally {
        // CSS immer wieder entfernen, auch bei Fehler
        try {
            await page.evaluate(() => {
                document.getElementById("__a11y_highlight__")?.remove();
            });
        } catch {
            // Ignorieren
        }
    }

    return `/screenshots/${scanId}/${filename}`;
}
