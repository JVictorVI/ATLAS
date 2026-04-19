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
