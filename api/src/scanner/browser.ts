import { chromium, type Browser, type BrowserContext } from "playwright";

const USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0.0.0 Safari/537.36";

export async function launchBrowser(): Promise<Browser> {
    return chromium.launch({
        args: [
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
        ],
    });
}

export async function newStealthContext(browser: Browser): Promise<BrowserContext> {
    const context = await browser.newContext({
        userAgent: USER_AGENT,
        locale:    "de-DE",
        extraHTTPHeaders: {
            "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        },
    });

    // navigator.webdriver auf false setzen — wichtigstes Bot-Signal entfernen
    await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    return context;
}
