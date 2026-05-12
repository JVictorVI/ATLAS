import * as vscode from "vscode";

export type AtlasEditorContext = {
  document: vscode.TextDocument;
  code: string;
  fileName: string;
  languageId: string;
  lineCount: number;
  source: "selection" | "document";
  selection?: {
    startLine: number;
    endLine: number;
  };
};
