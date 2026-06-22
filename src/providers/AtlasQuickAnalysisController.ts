import * as vscode from "vscode";
import { AtlasQuickAnalysisService } from "../services/AtlasQuickAnalysisService";
import { AtlasEditorContextService } from "./AtlasEditorContextService";
import {
  AtlasQuickIssue,
  AtlasQuickIssueCategory,
  AtlasQuickIssueSeverity,
} from "../interfaces/AtlasQuickAnalysisTypes";

type AtlasQuickAnalysisExecutionOptions = {
  source?: "button" | "chat";
  sessionId?: string;
};

export class AtlasQuickAnalysisController {
  private readonly lowIssueDecoration: vscode.TextEditorDecorationType;
  private readonly mediumIssueDecoration: vscode.TextEditorDecorationType;
  private readonly highIssueDecoration: vscode.TextEditorDecorationType;

  constructor(
    private readonly quickAnalysisService: AtlasQuickAnalysisService,
    private readonly editorContextService: AtlasEditorContextService,
  ) {
    this.lowIssueDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      backgroundColor: "rgba(59, 130, 246, 0.16)",
      borderWidth: "0 0 0 3px",
      borderStyle: "solid",
      borderColor: "rgba(37, 99, 235, 0.95)",
      overviewRulerColor: "rgba(37, 99, 235, 0.95)",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    this.mediumIssueDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      backgroundColor: "rgba(250, 204, 21, 0.22)",
      borderWidth: "0 0 0 3px",
      borderStyle: "solid",
      borderColor: "rgba(202, 138, 4, 0.98)",
      overviewRulerColor: "rgba(202, 138, 4, 0.98)",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    this.highIssueDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      backgroundColor: "rgba(220, 38, 38, 0.16)",
      borderWidth: "0 0 0 3px",
      borderStyle: "solid",
      borderColor: "rgba(185, 28, 28, 1)",
      overviewRulerColor: "rgba(185, 28, 28, 1)",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
  }

  public async execute(
    webview?: vscode.Webview,
    options: AtlasQuickAnalysisExecutionOptions = {},
  ): Promise<void> {
    const source = options.source ?? "button";
    const editorContext = this.editorContextService.getFullDocumentContext();

    if (!editorContext) {
      const message =
        "Nenhum arquivo válido aberto no editor para análise rápida.";

      await webview?.postMessage({
        type: "erro",
        sessionId: options.sessionId,
        value: message,
      });

      vscode.window.showWarningMessage(message);
      return;
    }

    const editor = vscode.window.activeTextEditor;

    if (
      !editor ||
      editor.document.uri.toString() !== editorContext.document.uri.toString()
    ) {
      const message =
        "Não foi possível localizar o editor ativo correspondente ao documento analisado.";

      await webview?.postMessage({
        type: "erro",
        sessionId: options.sessionId,
        value: message,
      });

      vscode.window.showWarningMessage(message);
      return;
    }

    try {
      await webview?.postMessage({
        type: "analiseRapidaStatus",
        sessionId: options.sessionId,
        value: { loading: true, source },
      });

      const issues = await this.quickAnalysisService.analyzeCode(
        editorContext.document,
        editorContext.code,
        editorContext.languageId,
        editorContext.fileName,
      );

      const sanitizedIssues = this.sanitizeIssues(
        issues,
        editorContext.lineCount,
      );

      if (sanitizedIssues.length === 0) {
        this.clearDecorations(editor);

        await webview?.postMessage({
          type: "analiseRapidaConcluida",
          sessionId: options.sessionId,
          value: {
            source,
            total: 0,
            issues: [],
          },
        });

        vscode.window.showInformationMessage(
          "ATLAS: nenhuma evidência arquitetural relevante foi detectada neste arquivo.",
        );
        return;
      }

      this.clearDecorations(editor);
      this.applyDecorations(editor, sanitizedIssues);

      await webview?.postMessage({
        type: "analiseRapidaConcluida",
        sessionId: options.sessionId,
        value: {
          source,
          total: sanitizedIssues.length,
          issues: sanitizedIssues,
        },
      });

      vscode.window.showInformationMessage(
        `ATLAS: ${sanitizedIssues.length} problema(s) arquitetural(is) destacado(s) no editor.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao executar análise rápida.";

      await webview?.postMessage({
        type: "erro",
        sessionId: options.sessionId,
        value: message,
      });

      vscode.window.showErrorMessage(`ATLAS: ${message}`);
    } finally {
      await webview?.postMessage({
        type: "analiseRapidaStatus",
        sessionId: options.sessionId,
        value: { loading: false, source },
      });
    }
  }

  public clearDecorations(editor?: vscode.TextEditor): void {
    const targetEditor = editor ?? vscode.window.activeTextEditor;

    if (!targetEditor) {
      return;
    }

    targetEditor.setDecorations(this.lowIssueDecoration, []);
    targetEditor.setDecorations(this.mediumIssueDecoration, []);
    targetEditor.setDecorations(this.highIssueDecoration, []);
  }

  public dispose(): void {
    this.lowIssueDecoration.dispose();
    this.mediumIssueDecoration.dispose();
    this.highIssueDecoration.dispose();
  }

  private sanitizeIssues(
    issues: AtlasQuickIssue[],
    lineCount: number,
  ): AtlasQuickIssue[] {
    return issues
      .map((issue) => {
        const startLine = Math.min(Math.max(issue.startLine, 1), lineCount);
        const endLine = Math.min(Math.max(issue.endLine, startLine), lineCount);

        return {
          ...issue,
          startLine,
          endLine,
          message: issue.message.trim(),
        };
      })
      .filter((issue) => issue.message.length > 0);
  }

  private applyDecorations(
    editor: vscode.TextEditor,
    issues: AtlasQuickIssue[],
  ): void {
    const lowRanges: vscode.DecorationOptions[] = [];
    const mediumRanges: vscode.DecorationOptions[] = [];
    const highRanges: vscode.DecorationOptions[] = [];

    for (const issue of issues) {
      const startLineIndex = issue.startLine - 1;
      const endLineIndex = issue.endLine - 1;

      const startPosition = new vscode.Position(startLineIndex, 0);
      const endLineText = editor.document.lineAt(endLineIndex).text;
      const endPosition = new vscode.Position(
        endLineIndex,
        Math.max(endLineText.length, 1),
      );

      const range = new vscode.Range(startPosition, endPosition);

      const option: vscode.DecorationOptions = {
        range,
        hoverMessage: this.buildHoverMessage(issue),
      };

      if (issue.severity === "low") {
        lowRanges.push(option);
      } else if (issue.severity === "medium") {
        mediumRanges.push(option);
      } else {
        highRanges.push(option);
      }
    }

    editor.setDecorations(this.lowIssueDecoration, lowRanges);
    editor.setDecorations(this.mediumIssueDecoration, mediumRanges);
    editor.setDecorations(this.highIssueDecoration, highRanges);
  }

  private buildHoverMessage(issue: AtlasQuickIssue): vscode.MarkdownString {
    const severity = this.getSeverityLabel(issue.severity);
    const category = this.getCategoryLabel(issue.category);
    const lineLabel =
      issue.startLine === issue.endLine
        ? `Linha ${issue.startLine}`
        : `Linhas ${issue.startLine}-${issue.endLine}`;

    return new vscode.MarkdownString(
      [
        `**ATLAS - ${severity.label}**`,
        `**Categoria:** ${category}`,
        `**Trecho:** ${lineLabel}`,
        issue.message,
      ].join("\n\n"),
    );
  }

  private getSeverityLabel(severity: AtlasQuickIssueSeverity): {
    label: string;
    color: string;
  } {
    switch (severity) {
      case "low":
        return { label: "Baixo impacto", color: "azul" };
      case "medium":
        return { label: "Médio impacto", color: "amarelo" };
      case "high":
      default:
        return { label: "Alto impacto", color: "vermelho" };
    }
  }

  private getCategoryLabel(category: AtlasQuickIssueCategory): string {
    switch (category) {
      case "coupling":
        return "Acoplamento";
      case "cohesion":
        return "Coesão";
      case "responsibility":
        return "Responsabilidade";
      case "abstraction":
        return "Abstração";
      case "dependency":
        return "Dependência";
      case "layering":
        return "Camadas";
      case "solid":
        return "SOLID";
      case "grasp":
        return "GRASP";
      case "maintainability":
      default:
        return "Manutenibilidade";
    }
  }
}
