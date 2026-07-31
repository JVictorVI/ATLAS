import { createHash } from "crypto";
import * as vscode from "vscode";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import {
  AtlasCodeEditRefactorMetadata,
  AtlasCodeEditResult,
} from "../interfaces/AtlasCodeEditTypes";
import { AtlasEditorContext } from "../interfaces/AtlasEditorTypes";
import { AtlasCodeEditService } from "../services/AtlasCodeEditService";
import { AtlasDocumentStructureService } from "../services/AtlasDocumentStructureService";
import { AtlasEditorContextService } from "./AtlasEditorContextService";

type AtlasDirectCodeEditOptions = {
  userRequest: string;
  sessionId?: string;
  ragContext?: string[];
  signal?: AbortSignal;
};

type AtlasArchitectureGuidedEditOptions = {
  analysisContent: string;
  refactorMetadata: AtlasCodeEditRefactorMetadata;
  sessionId?: string;
  ragContext?: string[];
  signal?: AbortSignal;
};

type AtlasCodeEditStatusSource = "developer-assistant" | "architectural-analysis";

export class AtlasCodeEditController {
  private activeController: AbortController | null = null;

  private readonly operationalEditTerms = [
    "aplique",
    "aplicar",
    "altere",
    "alterar",
    "atualize",
    "atualizar",
    "corrija",
    "corrigir",
    "conserte",
    "consertar",
    "edite",
    "editar",
    "implemente",
    "implementar",
    "adicione",
    "adicionar",
    "remova",
    "remover",
    "renomeie",
    "renomear",
    "extraia",
    "extrair",
    "refatore",
    "refatorar",
    "mude",
    "mudar",
    "troque",
    "trocar",
    "substitua",
    "substituir",
  ];

  private readonly analyticalBlockers = [
    "como ",
    "explique",
    "explica",
    "analise",
    "analisar",
    "avaliar",
    "avaliacao",
    "revisao",
    "review",
    "o que acha",
    "pense",
    "pensar",
    "planeje",
    "plano",
    "sugira",
    "sugerir",
  ];

  private readonly broadScopeTerms = [
    "projeto inteiro",
    "workspace",
    "todos os arquivos",
    "todo o projeto",
    "sistema inteiro",
    "aplicacao inteira",
    "varios arquivos",
    "multiplos arquivos",
    "multi arquivo",
    "funcionalidade completa",
    "feature completa",
  ];

  private readonly localScopeTerms = [
    "neste arquivo",
    "nesse arquivo",
    "no arquivo atual",
    "codigo atual",
    "neste codigo",
    "nesse codigo",
    "nesta funcao",
    "nessa funcao",
    "neste metodo",
    "nesse metodo",
    "nesta classe",
    "nessa classe",
    "trecho selecionado",
    "selecao",
  ];

  private readonly strongApplyTerms = [
    "aplique",
    "aplicar",
    "faca",
    "fazer agora",
    "edite",
    "editar",
    "altere",
    "corrija",
    "implemente",
    "adicione",
    "remova",
    "renomeie",
    "substitua",
  ];

  constructor(
    private readonly codeEditService: AtlasCodeEditService,
    private readonly editorContextService: AtlasEditorContextService,
    private readonly documentStructureService: AtlasDocumentStructureService,
    private readonly configManager: AtlasConfigManager,
  ) {}

  public isOperationalEditRequest(userRequest: string): boolean {
    const normalized = this.normalize(userRequest);

    if (!this.hasAnyTerm(normalized, this.operationalEditTerms)) {
      return false;
    }

    if (
      this.hasAnyTerm(normalized, this.broadScopeTerms) &&
      !this.hasAnyTerm(normalized, this.localScopeTerms)
    ) {
      return false;
    }

    const hasStrongApplyTerm = this.hasAnyTerm(
      normalized,
      this.strongApplyTerms,
    );

    if (!hasStrongApplyTerm && this.hasAnyTerm(normalized, this.analyticalBlockers)) {
      return false;
    }

    if (normalized.startsWith("como ") && !hasStrongApplyTerm) {
      return false;
    }

    return true;
  }

  public async executeDirectEdit(
    webview: vscode.Webview | undefined,
    options: AtlasDirectCodeEditOptions,
  ): Promise<AtlasCodeEditResult> {
    this.assertRefactoringEnabled();

    const editorContext = this.editorContextService.getChatEditorContext();

    if (!editorContext) {
      throw new Error("Abra um arquivo no editor antes de aplicar alteracoes.");
    }

    const signal = this.prepareSignal(options.signal);

    try {
      await this.postStatus(webview, options.sessionId, {
        loading: true,
        source: "developer-assistant",
        message: "Aplicando alteração no código...",
      });

      const result = await this.codeEditService.applyEdit({
        editorContext,
        userRequest: options.userRequest,
        source: "developer-assistant",
        structureContext: await this.buildOptionalStructureSummary(
          editorContext.document,
          this.isRefactoringRequest(options.userRequest),
        ),
        ragContext: options.ragContext,
        signal,
      });

      this.showResultNotification(result);
      return result;
    } finally {
      this.releaseSignal(signal);
      await this.postStatus(webview, options.sessionId, {
        loading: false,
        source: "developer-assistant",
      });
    }
  }

  public async executeArchitectureGuidedEdit(
    webview: vscode.Webview | undefined,
    options: AtlasArchitectureGuidedEditOptions,
  ): Promise<AtlasCodeEditResult> {
    this.assertRefactoringEnabled();

    const editorContext = this.editorContextService.getFullDocumentContext();

    if (!editorContext) {
      throw new Error(
        "Abra o arquivo analisado no editor antes de aplicar a refatoração.",
      );
    }

    this.assertDocumentStillMatches(editorContext, options.refactorMetadata);

    const signal = this.prepareSignal(options.signal);

    try {
      await this.postStatus(webview, options.sessionId, {
        loading: true,
        source: "architectural-analysis",
        message: "Refatorando com base na análise...",
      });

      const result = await this.codeEditService.applyEdit({
        editorContext,
        userRequest:
          "Refatore o código atual com base na análise arquitetural fornecida.",
        source: "architectural-analysis",
        architectureAnalysis: options.analysisContent,
        structureContext: await this.buildOptionalStructureSummary(
          editorContext.document,
          true,
        ),
        ragContext: options.ragContext,
        signal,
      });

      this.showResultNotification(result);
      return result;
    } finally {
      this.releaseSignal(signal);
      await this.postStatus(webview, options.sessionId, {
        loading: false,
        source: "architectural-analysis",
      });
    }
  }

  public cancelActiveEdit(): void {
    this.activeController?.abort();
    this.activeController = null;
  }

  public static buildRefactorMetadata(
    editorContext: AtlasEditorContext,
  ): AtlasCodeEditRefactorMetadata {
    return {
      documentUri: editorContext.document.uri.toString(),
      fileName: editorContext.fileName,
      languageId: editorContext.languageId,
      contentHash: AtlasCodeEditController.hashContent(
        editorContext.document.getText(),
      ),
      source: editorContext.source,
      selection: editorContext.selection,
    };
  }

  private static hashContent(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex");
  }

  private prepareSignal(signal?: AbortSignal): AbortSignal | undefined {
    if (signal) {
      return signal;
    }

    this.activeController?.abort();
    this.activeController = new AbortController();
    return this.activeController.signal;
  }

  private releaseSignal(signal?: AbortSignal): void {
    if (this.activeController?.signal === signal) {
      this.activeController = null;
    }
  }

  private assertRefactoringEnabled(): void {
    if (this.configManager.isRefactoringEnabled()) {
      return;
    }

    throw new Error(
      "A refatoração aplicada está desativada nas configurações do ATLAS.",
    );
  }

  private assertDocumentStillMatches(
    editorContext: AtlasEditorContext,
    metadata: AtlasCodeEditRefactorMetadata,
  ): void {
    const currentUri = editorContext.document.uri.toString();

    if (currentUri !== metadata.documentUri) {
      throw new Error(
        "O arquivo aberto não corresponde ao arquivo da análise arquitetural.",
      );
    }

    const currentHash = AtlasCodeEditController.hashContent(
      editorContext.document.getText(),
    );

    if (currentHash !== metadata.contentHash) {
      throw new Error(
        "O arquivo mudou desde a análise arquitetural. Execute a análise novamente antes de aplicar a refatoração.",
      );
    }
  }

  private async buildOptionalStructureSummary(
    document: vscode.TextDocument,
    isRefactoring: boolean,
  ): Promise<string | undefined> {
    if (!this.shouldUseStaticAnalysisForRefactoring(isRefactoring)) {
      return undefined;
    }

    const structure = await this.documentStructureService.collect(document);
    const summaries = [this.documentStructureService.buildSummary(structure)];

    if (this.configManager.getStaticAnalysisConfig().includeDiagnostics) {
      summaries.push(
        this.documentStructureService.buildDiagnosticsSummary(document),
      );
    }

    if (
      this.configManager.getStaticAnalysisConfig().includeSymbolRelations
    ) {
      summaries.push(
        await this.documentStructureService.buildSymbolRelationsSummary(
          document,
        ),
      );
    }

    return summaries.join("\n\n");
  }

  private shouldUseStaticAnalysisForRefactoring(isRefactoring: boolean): boolean {
    const settings = this.configManager.getStaticAnalysisConfig();
    const contextProfile = this.configManager.getContextProfile();

    return (
      isRefactoring &&
      settings.enabled &&
      settings.useInRefactoring &&
      contextProfile.includeStaticAnalysis
    );
  }

  private isRefactoringRequest(userRequest: string): boolean {
    const normalized = this.normalize(userRequest);

    return normalized.includes("refator");
  }

  private async postStatus(
    webview: vscode.Webview | undefined,
    sessionId: string | undefined,
    value: {
      loading: boolean;
      source: AtlasCodeEditStatusSource;
      message?: string;
    },
  ): Promise<void> {
    await webview?.postMessage({
      type: "edicaoCodigoStatus",
      sessionId,
      value,
    });
  }

  private showResultNotification(result: AtlasCodeEditResult): void {
    if (!result.approved) {
      return;
    }

    if (result.appliedEdits > 0) {
      vscode.window.showInformationMessage(
        `ATLAS: ${result.appliedEdits} edição(ões) aplicada(s) em ${result.targetFile}.`,
      );
      return;
    }

    vscode.window.showInformationMessage(
      `ATLAS: nenhuma edição aplicada em ${result.targetFile}.`,
    );
  }

  private hasAnyTerm(question: string, terms: string[]): boolean {
    return terms.some((term) => question.includes(this.normalize(term)));
  }

  private normalize(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }
}
