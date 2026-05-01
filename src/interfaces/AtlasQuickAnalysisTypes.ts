export type AtlasQuickIssueSeverity = "low" | "medium" | "high";

export type AtlasQuickIssueCategory =
  | "coupling"
  | "cohesion"
  | "responsibility"
  | "abstraction"
  | "dependency"
  | "layering"
  | "solid"
  | "grasp"
  | "maintainability";

export interface AtlasQuickIssue {
  startLine: number;
  endLine: number;
  severity: AtlasQuickIssueSeverity;
  category: AtlasQuickIssueCategory;
  message: string;
}

export type AtlasArchitectureScoreLevel =
  | "excellent"
  | "good"
  | "attention"
  | "critical";

export interface AtlasArchitectureScore {
  score: number;
  level: AtlasArchitectureScoreLevel;
  totalIssues: number;
  severityCount: Record<AtlasQuickIssueSeverity, number>;
  categoryCount: Partial<Record<AtlasQuickIssueCategory, number>>;
}
