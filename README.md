# AI-cessibility

KI-gestütztes Accessibility-Tool zum automatischen Testen von Webseiten auf WCAG-Konformität. Findings können direkt als Jira-Tickets exportiert werden.

## Architektur

```
AI-cessibility/
├── api/          # Fastify-Backend (Node.js + TypeScript)
└── frontend/     # React-Frontend (Vite + TypeScript)
```

**Stack:**
- **Backend:** Fastify, better-sqlite3, Kysely, Playwright, axe-core, Anthropic SDK
- **Frontend:** React 19, Vite
- **Datenbank:** SQLite (`identifier.sqlite`)

---

## Voraussetzungen

- Node.js >= 22.12
- pnpm (für Node-Versionsverwaltung)

---

## Setup

### API

```bash
cd api
npm install
npm run migrate       # Datenbank-Schema anlegen
npm run dev           # Entwicklungsserver starten (Port 3000)
```

**Umgebungsvariablen** (`.env` oder Shell-Export):

| Variable | Beschreibung |
|---|---|
| `ANTHROPIC_API_KEY` | API-Key für Claude (Flow-Scan) |
| `JIRA_BASE_URL` | Jira-Instanz, z.B. `https://yourorg.atlassian.net` |
| `JIRA_EMAIL` | Jira-Benutzerkonto |
| `JIRA_API_TOKEN` | Jira API-Token |
| `DB_PATH` | Pfad zur SQLite-Datei (default: `data.db`) |
| `CORS_ORIGIN` | Erlaubte Origins, kommasepariert (default: localhost:5173, 5174) |
| `PORT` | API-Port (default: `3000`) |

### Frontend

```bash
cd frontend
npm install
npm run dev           # Entwicklungsserver starten (Port 5173)
```

---

## Scan-Modi

### Snapshot

Prüft eine einzelne URL einmalig mit axe-core auf WCAG-Verstöße.

```bash
curl -X POST http://localhost:3000/scans \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","wcag_level":"AA","mode":"snapshot"}'
```

### Crawl

Folgt allen Links derselben Domain und prüft jede gefundene Seite. Findings werden seitenübergreifend dedupliziert.

```bash
curl -X POST http://localhost:3000/scans \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","mode":"crawl","max_pages":20}'
```

| Parameter | Default | Beschreibung |
|---|---|---|
| `max_pages` | `20` | Maximale Anzahl zu prüfender Seiten (1–100) |

### Flow

Claude analysiert die Seite, plant 3–8 Interaktionsschritte basierend auf dem Testziel und führt axe-core nach jedem Schritt aus. Erfordert `ANTHROPIC_API_KEY`.

```bash
curl -X POST http://localhost:3000/scans \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "mode": "flow",
    "flow_goal": "Teste den Checkout-Prozess auf Accessibility",
    "screenshots": false
  }'
```

---

## API-Referenz

### Scans

| Method | Endpoint | Beschreibung |
|---|---|---|
| `POST` | `/scans` | Scan starten |
| `GET` | `/scans` | Alle Scans auflisten (max. 50) |
| `GET` | `/scans/:id` | Scan-Status und Findings abrufen |
| `GET` | `/findings?scan_id=` | Findings eines Scans abrufen |

**POST /scans — Body:**

```json
{
  "url":         "https://example.com",
  "wcag_level":  "AA",
  "mode":        "snapshot",
  "flow_goal":   "",
  "screenshots": false,
  "max_pages":   20,
  "auto_jira":   false,
  "project_key": "ACC"
}
```

**GET /scans/:id — Response:**

```json
{
  "id": "...",
  "url": "https://example.com",
  "status": "done",
  "total": 5,
  "critical": 1,
  "serious": 2,
  "moderate": 2,
  "minor": 0,
  "findings": [...]
}
```

### Jira

| Method | Endpoint | Beschreibung |
|---|---|---|
| `POST` | `/jira/export` | Findings als Jira-Tickets anlegen |
| `GET` | `/jira/tickets?finding_id=` | Ticket zu einem Finding abrufen |

**POST /jira/export — Body:**

```json
{
  "finding_ids": ["uuid-1", "uuid-2"],
  "project_key": "ACC"
}
```

Bereits exportierte Findings werden übersprungen (Deduplizierung via `rule_id + selector`).

---

## Datenbankschema

| Tabelle | Beschreibung |
|---|---|
| `scans` | Scan-Aufträge mit Status und Ergebnis-Countern |
| `findings` | Einzelne WCAG-Verstöße je Scan |
| `jira_tickets` | Verknüpfung zwischen Finding und Jira-Issue |