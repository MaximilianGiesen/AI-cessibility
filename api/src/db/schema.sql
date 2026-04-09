CREATE TABLE IF NOT EXISTS scans (
  id           TEXT PRIMARY KEY,
  url          TEXT NOT NULL,
  wcag_level   TEXT NOT NULL DEFAULT 'AA',
  mode         TEXT NOT NULL DEFAULT 'snapshot',
  flow_goal    TEXT,
  flow_meta    TEXT,
  status       TEXT NOT NULL DEFAULT 'running',
  total        INTEGER DEFAULT 0,
  critical     INTEGER DEFAULT 0,
  serious      INTEGER DEFAULT 0,
  moderate     INTEGER DEFAULT 0,
  minor        INTEGER DEFAULT 0,
  error        TEXT,
  created_at   TEXT NOT NULL,
  finished_at  TEXT
);

CREATE TABLE IF NOT EXISTS findings (
  id                    TEXT PRIMARY KEY,
  scan_id               TEXT NOT NULL REFERENCES scans(id),
  rule_id               TEXT NOT NULL,
  description           TEXT NOT NULL,
  selector              TEXT NOT NULL,
  html                  TEXT NOT NULL,
  fix_hint              TEXT NOT NULL,
  help_url              TEXT NOT NULL,
  severity              TEXT NOT NULL,
  wcag_tags             TEXT NOT NULL,
  flow_step             INTEGER,
  flow_step_description TEXT,
  jira_key              TEXT,
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jira_tickets (
  id          TEXT PRIMARY KEY,
  finding_id  TEXT NOT NULL REFERENCES findings(id),
  jira_key    TEXT NOT NULL,
  jira_url    TEXT NOT NULL,
  dedup_key   TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL
);