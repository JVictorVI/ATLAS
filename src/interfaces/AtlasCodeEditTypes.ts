import { AtlasEditorContext } from "./AtlasEditorTypes";

export type AtlasCodeEditIntent =
  | "answer-only"
  | "apply-edit"
  | "architecture-guided-edit";

export type AtlasCodeEditRisk = "low" | "medium" | "high";

export type AtlasCodeEditSource = "developer-assistant" | "architectural-analysis";

export interface AtlasLineEdit {
  startLine: number;
  endLine: number;
  replacement: string;
}

export interface AtlasCodeEditPlan {
  summary: string;
  rationale: string;
  risk: AtlasCodeEditRisk;
  verification: string[];
  edits: AtlasLineEdit[];
}

export interface AtlasCodeEditResult extends AtlasCodeEditPlan {
  targetFile: string;
  documentUri: string;
  appliedEdits: number;
  approved: boolean;
}

export interface AtlasCodeEditRequest {
  editorContext: AtlasEditorContext;
  userRequest: string;
  source: AtlasCodeEditSource;
  architectureAnalysis?: string;
  structureContext?: string;
  ragContext?: string[];
  signal?: AbortSignal;
}

export interface AtlasCodeEditRefactorMetadata {
  documentUri: string;
  fileName: string;
  languageId: string;
  contentHash: string;
  source: AtlasEditorContext["source"];
  selection?: {
    startLine: number;
    endLine: number;
  };
}

export interface AtlasCodeEditResponseMetadata {
  refactorable?: boolean;
  refactorContext?: AtlasCodeEditRefactorMetadata;
}

export interface AtlasArchitectureRefactorRequest {
  sessionId?: string;
  generationId?: string;
}
