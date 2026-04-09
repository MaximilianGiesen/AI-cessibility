// src/types.ts
export interface Finding {
    id:                   string;
    ruleId:               string;
    description:          string;
    selector:             string;
    html:                 string;
    fixHint:              string;
    helpUrl:              string;
    severity:             "critical" | "serious" | "moderate" | "minor";
    wcagTags:             string[];
    scanId:               string;
    flowStep?:            number | null;
    flowStepDescription?: string | null;
}