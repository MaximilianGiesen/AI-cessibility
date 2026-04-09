// Claude analysiert die Seite und plant einen User-Flow-Test.
// Gibt strukturierte Schritte + realistische Testdaten zurück.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface FlowStep {
    description: string;          // menschenlesbar, landet im Jira-Ticket
    action:      "click" | "fill" | "select" | "navigate" | "wait";
    selector?:   string;          // CSS-Selektor des Ziel-Elements
    value?:      string;          // Wert bei fill/select
    url?:        string;          // bei navigate
    waitMs?:     number;          // bei wait
}

export interface FlowPlan {
    goal:     string;
    steps:    FlowStep[];
    testData: Record<string, string>;  // generierte Testdaten
}

// ── Claude plant den Flow ─────────────────────────────────────────────────────

export async function planFlow(
    url:      string,
    goal:     string,
    pageHtml: string,             // initialer DOM für Kontext
): Promise<FlowPlan> {

    const msg = await anthropic.messages.create({
        model:      "claude-opus-4-6",
        max_tokens: 1000,
        messages: [{
            role:    "user",
            content: `Du bist ein Accessibility-Test-Planer.
Analysiere diese Webseite und plane einen User-Flow-Test.

URL: ${url}
Ziel: ${goal}

Initialer HTML-Ausschnitt (erste 3000 Zeichen):
${pageHtml.slice(0, 3000)}

Antworte NUR mit einem JSON-Objekt ohne Markdown-Backticks:
{
  "goal": "...",
  "testData": {
    "feldname": "realistischer Testwert"
  },
  "steps": [
    {
      "description": "Klicke auf den Startbutton",
      "action": "click",
      "selector": "button[type=submit]"
    },
    {
      "description": "Fülle Vorname aus",
      "action": "fill",
      "selector": "input[name=firstname]",
      "value": "{{vorname}}"
    }
  ]
}

Regeln:
- Verwende {{feldname}} als Platzhalter für Werte aus testData
- Plane 3–8 realistische Schritte
- Fokus auf Formular-Interaktionen, Modale, Fehlerbehandlung, Zustandswechsel
- Selektoren müssen valides CSS sein
- Keine Schritte die einen Login erfordern sofern nicht explizit gefordert`,
        }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";

    let plan: FlowPlan;
    try {
        // Markdown-Backticks entfernen falls Claude sie trotzdem schickt
        const clean = text.replace(/```json|```/g, "").trim();
        plan = JSON.parse(clean);
    } catch {
        throw new Error(`Claude hat kein valides JSON zurückgegeben: ${text}`);
    }

    // Platzhalter mit generierten Testdaten ersetzen
    plan.steps = plan.steps.map(step => ({
        ...step,
        value: step.value
            ? step.value.replace(/\{\{(\w+)\}\}/g, (_, k) => plan.testData[k] ?? k)
            : step.value,
    }));

    return plan;
}