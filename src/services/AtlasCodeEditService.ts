import * as vscode from "vscode";
import * as path from "path";
import { ChatMessage } from "../interfaces/ApiTypes";
import {
  AtlasCodeEditPlan,
  AtlasCodeEditRequest,
  AtlasCodeEditResult,
  AtlasCodeEditRisk,
  AtlasLineEdit,
} from "../interfaces/AtlasCodeEditTypes";
import { AtlasEditorContext } from "../interfaces/AtlasEditorTypes";
import { AtlasInferenceService } from "./AtlasInferenceService";

const PREVIEW_SCHEME = "atlas-code-edit-preview";

class AtlasCodeEditPreviewProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private readonly contents = new Map<string, string>();
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();

  public readonly onDidChange = this.changeEmitter.event;

  public setContent(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
    this.changeEmitter.fire(uri);
  }

  public provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  public dispose(): void {
    this.contents.clear();
    this.changeEmitter.dispose();
  }
}

export class AtlasCodeEditService implements vscode.Disposable {
  private readonly previewProvider = new AtlasCodeEditPreviewProvider();
  private readonly previewRegistration =
    vscode.workspace.registerTextDocumentContentProvider(
      PREVIEW_SCHEME,
      this.previewProvider,
    );

  constructor(private readonly inferenceService: AtlasInferenceService) {}

  public async applyEdit(
    request: AtlasCodeEditRequest,
  ): Promise<AtlasCodeEditResult> {
    const messages = this.buildEditMessages(request);
    const response = await this.inferenceService.sendChat(messages, undefined, {
      signal: request.signal,
    });
    const plan = this.parsePlan(response.content);
    const normalizedPlan = this.validatePlan(
      plan,
      request.editorContext.document,
    );
    const approved = await this.previewAndConfirm(
      request.editorContext.document,
      normalizedPlan,
      request.signal,
    );
    const appliedEdits = approved
      ? await this.applyLineEdits(
          request.editorContext.document,
          normalizedPlan.edits,
        )
      : 0;

    return {
      ...this.getFinalPlan(normalizedPlan, approved),
      targetFile: request.editorContext.fileName,
      documentUri: request.editorContext.document.uri.toString(),
      appliedEdits,
      approved,
    };
  }

  public dispose(): void {
    this.previewRegistration.dispose();
    this.previewProvider.dispose();
  }

  public formatResultMessage(result: AtlasCodeEditResult): string {
    if (!result.approved) {
      return "";
    }

    const header =
      result.appliedEdits > 0
        ? "### Refatoração aplicada"
        : "### Nenhuma alteração aplicada";
    const verification = result.verification.length
      ? [
          "",
          "**Validação sugerida**",
          ...result.verification.map((item) => `- ${item}`),
        ]
      : [];

    return [
      header,
      "",
      `**Arquivo:** \`${result.targetFile}\``,
      `**Edições aplicadas:** ${result.appliedEdits}`,
      `**Risco estimado:** ${this.formatRisk(result.risk)}`,
      "",
      "**Resumo**",
      result.summary,
      "",
      "**Justificativa técnica**",
      result.rationale,
      ...verification,
    ].join("\n");
  }

  private buildEditMessages(request: AtlasCodeEditRequest): ChatMessage[] {
    return [
      {
        role: "system",
        content: this.buildEditSystemMessage(),
      },
      {
        role: "user",
        content: this.buildEditUserMessage(request),
      },
    ];
  }

  private buildEditSystemMessage(): string {
    return [
      "Você é o ATLAS em modo de edição aplicada de código.",
      "",
      "Sua tarefa é propor edições pequenas e seguras para o arquivo atual, retornando exclusivamente JSON válido.",
      "A edição precisa ser sustentada pelo pedido do usuário, pelo código fornecido e, quando existir, pela análise arquitetural anterior.",
      "",
      "Regras obrigatórias:",
      "- retorne apenas um objeto JSON válido, sem Markdown e sem texto fora do JSON",
      "- altere somente o arquivo atual",
      "- use ranges de linhas inteiras",
      "- use startLine e endLine como números de linha originais do arquivo, 1-based e inclusivos",
      "- replacement deve conter o bloco completo que substituirá as linhas indicadas, sem prefixos de numeração",
      "- preserve comportamento quando a solicitação for refatoração",
      "- não introduza padrões, interfaces ou camadas se o ganho não compensar a complexidade",
      "- se não houver edição segura, retorne edits como array vazio e explique em summary/rationale",
      "- não invente APIs, arquivos, imports ou símbolos que não sejam inferíveis pelo código recebido",
      "- mantenha identificadores existentes quando não houver motivo técnico para renomear",
      "",
      "Schema obrigatorio:",
      "{",
      '  "summary": "resumo curto da alteração ou do motivo para não alterar",',
      '  "rationale": "justificativa técnica ligada a comportamento, teste, manutenção, acoplamento, coesão ou custo de mudança",',
      '  "risk": "low" | "medium" | "high",',
      '  "verification": ["passos objetivos para validar a mudança"],',
      '  "edits": [',
      "    {",
      '      "startLine": 1,',
      '      "endLine": 1,',
      '      "replacement": "código completo que substitui as linhas do intervalo"',
      "    }",
      "  ]",
      "}",
      "",
      "As sugestões e alterações do sistema não substituem revisão humana.",
    ].join("\n");
  }

  private buildEditUserMessage(request: AtlasCodeEditRequest): string {
    const numberedCode = this.addLineNumbers(request.editorContext);
    const architectureBlock = request.architectureAnalysis
      ? [
          "",
          "Análise arquitetural que deve orientar a refatoração:",
          request.architectureAnalysis,
        ]
      : [];
    const structureBlock = request.structureContext
      ? [
          "",
          "Estrutura estatica coletada pelo VS Code:",
          request.structureContext,
          "",
          "Use a estrutura apenas como evidência auxiliar; não invente relações ausentes.",
        ]
      : [];
    const ragBlock = request.ragContext?.length
      ? [
          "",
          "Contexto RAG recuperado para orientar a edição:",
          ...request.ragContext.map((item) => `- ${item}`),
          "",
          "Use o contexto RAG apenas como apoio. O arquivo atual e o pedido do usuário têm prioridade sobre o material recuperado.",
        ]
      : [];
    const selectionBlock =
      request.editorContext.source === "selection" &&
      request.editorContext.selection
        ? [
            `Escopo principal: trecho selecionado nas linhas ${request.editorContext.selection.startLine} ate ${request.editorContext.selection.endLine}.`,
            "Se precisar editar fora da seleção para manter o código válido, limite-se a imports ou declarações diretamente necessárias.",
          ]
        : ["Escopo principal: arquivo completo."];

    return [
      `Fonte da ação: ${request.source}`,
      `Arquivo: ${request.editorContext.fileName}`,
      `Linguagem: ${request.editorContext.languageId}`,
      ...selectionBlock,
      "",
      "Pedido do usuário:",
      request.userRequest,
      ...architectureBlock,
      ...structureBlock,
      ...ragBlock,
      "",
      "Código numerado:",
      numberedCode,
    ].join("\n");
  }

  private addLineNumbers(editorContext: AtlasEditorContext): string {
    const lines = editorContext.code.split(/\r\n|\r|\n/);
    const firstLine =
      editorContext.source === "selection" && editorContext.selection
        ? editorContext.selection.startLine
        : 1;
    const lastLine = firstLine + lines.length - 1;
    const width = String(lastLine).length;

    return lines
      .map((line, index) => {
        const lineNumber = String(firstLine + index).padStart(width, " ");
        return `${lineNumber} | ${line}`;
      })
      .join("\n");
  }

  private parsePlan(raw: string): AtlasCodeEditPlan {
    const extracted = this.extractJsonObject(raw);
    const parsed = JSON.parse(extracted) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("A resposta de edição não retornou um objeto JSON.");
    }

    const value = parsed as Record<string, unknown>;

    return {
      summary: String(value.summary ?? "").trim(),
      rationale: String(value.rationale ?? "").trim(),
      risk: this.normalizeRisk(value.risk),
      verification: this.normalizeStringList(value.verification),
      edits: this.normalizeLineEdits(value.edits),
    };
  }

  private validatePlan(
    plan: AtlasCodeEditPlan,
    document: vscode.TextDocument,
  ): AtlasCodeEditPlan {
    if (!plan.summary) {
      throw new Error("O plano de edição não informou summary.");
    }

    if (!plan.rationale) {
      throw new Error("O plano de edição não informou rationale.");
    }

    const edits = [...plan.edits].sort(
      (left, right) => left.startLine - right.startLine,
    );

    let previousEndLine = 0;

    for (const edit of edits) {
      if (
        !Number.isInteger(edit.startLine) ||
        edit.startLine < 1 ||
        edit.startLine > document.lineCount
      ) {
        throw new Error(
          `Edição inválida: startLine ${edit.startLine} está fora do documento.`,
        );
      }

      if (
        !Number.isInteger(edit.endLine) ||
        edit.endLine < edit.startLine ||
        edit.endLine > document.lineCount
      ) {
        throw new Error(
          `Edição inválida: endLine ${edit.endLine} está fora do documento.`,
        );
      }

      if (edit.startLine <= previousEndLine) {
        throw new Error("O plano de edição contém ranges sobrepostos.");
      }

      previousEndLine = edit.endLine;
    }

    return {
      ...plan,
      verification: plan.verification.slice(0, 8),
      edits,
    };
  }

  private async previewAndConfirm(
    document: vscode.TextDocument,
    plan: AtlasCodeEditPlan,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (!plan.edits.length) {
      return true;
    }

    if (signal?.aborted) {
      this.throwAbortError();
    }

    const previewContent = this.buildPreviewContent(document, plan.edits);
    const previewUri = this.createPreviewUri(document);

    this.previewProvider.setContent(previewUri, previewContent);

    await vscode.commands.executeCommand(
      "vscode.diff",
      document.uri,
      previewUri,
      `ATLAS: Prévia de edição - ${path.basename(document.fileName)}`,
    );

    const action = await vscode.window.showWarningMessage(
      "O diff do ATLAS está aberto. Revise a prévia antes de aplicar no arquivo atual.",
      "Aplicar alterações",
      "Cancelar",
    );

    if (signal?.aborted) {
      this.throwAbortError();
    }

    return action === "Aplicar alterações";
  }

  private buildPreviewContent(
    document: vscode.TextDocument,
    edits: AtlasLineEdit[],
  ): string {
    let content = document.getText();

    for (const edit of [...edits].sort(
      (left, right) => right.startLine - left.startLine,
    )) {
      const range = this.getWholeLineRange(document, edit);
      const startOffset = document.offsetAt(range.start);
      const endOffset = document.offsetAt(range.end);
      const replacement = this.normalizeReplacement(document, edit);

      content =
        content.slice(0, startOffset) +
        replacement +
        content.slice(endOffset);
    }

    return content;
  }

  private createPreviewUri(document: vscode.TextDocument): vscode.Uri {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return vscode.Uri.from({
      scheme: PREVIEW_SCHEME,
      authority: "atlas",
      path: `/${path.basename(document.fileName)}`,
      query: id,
    });
  }

  private getFinalPlan(
    plan: AtlasCodeEditPlan,
    approved: boolean,
  ): AtlasCodeEditPlan {
    if (approved || !plan.edits.length) {
      return plan;
    }

    return {
      ...plan,
      summary: `Alteração cancelada pelo usuário após a prévia. Plano proposto: ${plan.summary}`,
      rationale:
        "Nenhuma edição foi aplicada porque a prévia não foi confirmada.",
      verification: [
        "Revise a prévia aberta pelo ATLAS antes de solicitar nova aplicação.",
      ],
      edits: [],
    };
  }

  private async applyLineEdits(
    document: vscode.TextDocument,
    edits: AtlasLineEdit[],
  ): Promise<number> {
    if (!edits.length) {
      return 0;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();

    for (const edit of [...edits].sort(
      (left, right) => right.startLine - left.startLine,
    )) {
      workspaceEdit.replace(
        document.uri,
        this.getWholeLineRange(document, edit),
        this.normalizeReplacement(document, edit),
      );
    }

    const applied = await vscode.workspace.applyEdit(workspaceEdit);

    if (!applied) {
      throw new Error("O VS Code recusou a aplicação das edições.");
    }

    return edits.length;
  }

  private getWholeLineRange(
    document: vscode.TextDocument,
    edit: AtlasLineEdit,
  ): vscode.Range {
    const startLineIndex = edit.startLine - 1;
    const endLineIndex = edit.endLine - 1;
    const start = new vscode.Position(startLineIndex, 0);

    if (endLineIndex + 1 < document.lineCount) {
      return new vscode.Range(
        start,
        new vscode.Position(endLineIndex + 1, 0),
      );
    }

    return new vscode.Range(start, document.lineAt(endLineIndex).range.end);
  }

  private normalizeReplacement(
    document: vscode.TextDocument,
    edit: AtlasLineEdit,
  ): string {
    const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
    const normalized = edit.replacement.replace(/\r\n|\r|\n/g, eol);

    if (edit.endLine < document.lineCount && normalized && !normalized.endsWith(eol)) {
      return `${normalized}${eol}`;
    }

    return normalized;
  }

  private throwAbortError(): never {
    const error = new Error("Edição cancelada pelo usuário.");
    error.name = "AbortError";
    throw error;
  }

  private normalizeLineEdits(value: unknown): AtlasLineEdit[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((item) => {
      const edit =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};

      return {
        startLine: Number(edit.startLine),
        endLine: Number(edit.endLine),
        replacement: String(edit.replacement ?? ""),
      };
    });
  }

  private normalizeStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
  }

  private normalizeRisk(value: unknown): AtlasCodeEditRisk {
    const normalized = String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

    if (normalized === "medium" || normalized === "medio") {
      return "medium";
    }

    if (normalized === "high" || normalized === "alto") {
      return "high";
    }

    return "low";
  }

  private formatRisk(risk: AtlasCodeEditRisk): string {
    switch (risk) {
      case "high":
        return "alto";
      case "medium":
        return "médio";
      case "low":
      default:
        return "baixo";
    }
  }

  private extractJsonObject(raw: string): string {
    const trimmed = raw.trim();

    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed;
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error(
        "Não foi possível localizar um objeto JSON válido na resposta de edição.",
      );
    }

    return trimmed.slice(firstBrace, lastBrace + 1);
  }
}
