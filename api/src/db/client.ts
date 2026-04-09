import { Kysely, SqliteDialect } from "kysely";
import Database from "better-sqlite3";

interface ScansTable {
    id:          string;
    url:         string;
    wcag_level:  string;
    mode:        string;
    flow_goal:   string | null;
    flow_meta:   string | null;
    status:      string;
    total:       number;
    critical:    number;
    serious:     number;
    moderate:    number;
    minor:       number;
    error:       string | null;
    created_at:  string;
    finished_at: string | null;
}

interface FindingsTable {
    id:                    string;
    scan_id:               string;
    rule_id:               string;
    description:           string;
    selector:              string;
    html:                  string;
    fix_hint:              string;
    help_url:              string;
    severity:              string;
    wcag_tags:             string;
    flow_step:             number | null;
    flow_step_description: string | null;
    jira_key:              string | null;
    created_at:            string;
}

interface JiraTicketsTable {
    id:         string;
    finding_id: string;
    jira_key:   string;
    jira_url:   string;
    dedup_key:  string;
    created_at: string;
}

interface DB {
    scans:        ScansTable;
    findings:     FindingsTable;
    jira_tickets: JiraTicketsTable;
}

export const db = new Kysely<DB>({
    dialect: new SqliteDialect({ database: new Database(process.env.DB_PATH ?? "data.db") }),
});
