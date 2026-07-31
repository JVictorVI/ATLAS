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
    "aplicar isso",
    "aplica",
    "aplica isso",
    "aplicar as mudancas",
    "aplique as mudancas",
    "altere",
    "alterar",
    "altera",
    "ajuste",
    "ajustar",
    "ajusta",
    "arrume",
    "arrumar",
    "arruma",
    "atualize",
    "atualizar",
    "atualiza",
    "corrija",
    "corrigir",
    "corrige",
    "conserte",
    "consertar",
    "conserta",
    "coloque",
    "colocar",
    "coloca",
    "configure",
    "configurar",
    "configura",
    "crie",
    "criar",
    "cria",
    "deixe",
    "deixar",
    "deixa",
    "edite",
    "editar",
    "edita",
    "exclua",
    "excluir",
    "exiba",
    "exibir",
    "faça",
    "faca",
    "formate",
    "formatar",
    "gere",
    "gerar",
    "fazer essas",
    "fazer isso",
    "vamos aplicar",
    "vamos editar",
    "vamos fazer",
    "vamos implementar",
    "comece a implementacao",
    "comece a implementar",
    "comecar a implementacao",
    "comecar a implementar",
    "implemente",
    "implementar",
    "implementa",
    "inclua",
    "incluir",
    "inclui",
    "insira",
    "inserir",
    "insere",
    "limpe",
    "limpar",
    "limpa",
    "melhore",
    "melhorar",
    "melhora",
    "modifique",
    "modificar",
    "modifica",
    "mova",
    "mover",
    "move",
    "otimize",
    "otimizar",
    "otimiza",
    "pare de",
    "adicione",
    "adicionar",
    "adiciona",
    "reescreva",
    "reescrever",
    "reorganize",
    "reorganizar",
    "reorganiza",
    "remova",
    "remover",
    "remove",
    "renomeie",
    "renomear",
    "renomeia",
    "retire",
    "retirar",
    "retira",
    "resolva",
    "resolver",
    "simplifique",
    "simplificar",
    "simplifica",
    "extraia",
    "extrair",
    "extrai",
    "refatore",
    "refatorar",
    "refatora",
    "comece a refatoracao",
    "comecar a refatoracao",
    "mude",
    "mudar",
    "muda",
    "troque",
    "trocar",
    "troca",
    "substitua",
    "substituir",
    "substitui",
    "torne",
    "tornar",
    "torna",
    "transforme",
    "transformar",
    "transforma",
  ];

  private readonly analyticalBlockers = [
    "como ",
    "como eu",
    "como faço",
    "como faco",
    "dá pra",
    "da pra",
    "dá para",
    "da para",
    "explique",
    "explica",
    "analise",
    "analisar",
    "avaliar",
    "avaliacao",
    "devo",
    "deveria",
    "me diga",
    "me explique",
    "o que ",
    "revisao",
    "review",
    "o que acha",
    "pense",
    "pensar",
    "planeje",
    "plano",
    "por que",
    "porque",
    "qual ",
    "qual é",
    "qual e",
    "quais ",
    "quais seriam",
    "sugira",
    "sugerir",
    "vale a pena",
    "tem como",
    "é possível",
    "e possivel",
    "seria possível",
    "seria possivel",
  ];

  private readonly explicitNoEditTerms = [
    "apenas explique",
    "apenas responda",
    "apenas diga",
    "somente explique",
    "somente responda",
    "somente diga",
    "só explique",
    "so explique",
    "so responda",
    "so diga",
    "apenas analise",
    "somente analise",
    "só analise",
    "so analise",
    "não altere",
    "nao altere",
    "não aplique",
    "nao aplique",
    "não edite",
    "nao edite",
    "não mexa",
    "nao mexa",
    "não mude",
    "nao mude",
    "sem alterar",
    "sem aplicar",
    "sem editar",
    "sem modificar",
    "sem refatorar",
    "sem implementar",
    "sem corrigir",
    "sem mexer",
    "sem mudar",
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
    "arquivo aberto",
    "no arquivo atual",
    "no editor",
    "codigo atual",
    "código atual",
    "neste codigo",
    "neste código",
    "nesse codigo",
    "nesse código",
    "nesta funcao",
    "nesta função",
    "nessa funcao",
    "nessa função",
    "neste metodo",
    "neste método",
    "nesse metodo",
    "nesse método",
    "nesta classe",
    "nessa classe",
    "neste trecho",
    "nesse trecho",
    "nesta selecao",
    "nessa selecao",
    "trecho selecionado",
    "selecao",
  ];

  private readonly strongApplyTerms = [
    "aplique",
    "aplicar",
    "aplica",
    "ajuste",
    "ajusta",
    "arrume",
    "arruma",
    "atualize",
    "atualiza",
    "coloque",
    "coloca",
    "configure",
    "configura",
    "crie",
    "cria",
    "deixe",
    "deixa",
    "faca",
    "faça",
    "fazer agora",
    "fazer isso",
    "fazer essas",
    "vamos aplicar",
    "vamos editar",
    "vamos fazer",
    "vamos implementar",
    "comece a implementacao",
    "comece a implementar",
    "edite",
    "editar",
    "edita",
    "altere",
    "altera",
    "corrija",
    "corrige",
    "implemente",
    "implementa",
    "adicione",
    "adiciona",
    "inclua",
    "inclui",
    "insira",
    "insere",
    "limpe",
    "limpa",
    "melhore",
    "melhora",
    "modifique",
    "modifica",
    "mova",
    "move",
    "otimize",
    "otimiza",
    "reescreva",
    "reorganize",
    "reorganiza",
    "remova",
    "remove",
    "renomeie",
    "renomeia",
    "retire",
    "retira",
    "resolva",
    "simplifique",
    "simplifica",
    "substitua",
    "substitui",
    "torne",
    "torna",
    "transforme",
    "transforma",
  ];

  private readonly exploratoryQuestionPrefixes = [
    "como eu",
    "como faco",
    "como fazer",
    "como posso",
    "como voce",
    "como o atlas",
    "da pra",
    "da para",
    "e possivel",
    "existe como",
    "o que",
    "qual",
    "quais",
    "seria possivel",
    "tem como",
  ];

  constructor(
    private readonly codeEditService: AtlasCodeEditService,
    private readonly editorContextService: AtlasEditorContextService,
    private readonly documentStructureService: AtlasDocumentStructureService,
    private readonly configManager: AtlasConfigManager,
  ) {}

  public isOperationalEditRequest(userRequest: string): boolean {
    const normalized = this.normalize(userRequest);

    if (this.hasAnyTerm(normalized, this.explicitNoEditTerms)) {
      return false;
    }

    if (this.startsWithAnyTerm(normalized, this.exploratoryQuestionPrefixes)) {
      return false;
    }

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

    if (
      !hasStrongApplyTerm &&
      this.hasAnyTerm(normalized, this.analyticalBlockers)
    ) {
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

  private startsWithAnyTerm(question: string, terms: string[]): boolean {
    return terms.some((term) => {
      const normalizedTerm = this.normalize(term);

      if (question === normalizedTerm) {
        return true;
      }

      if (!question.startsWith(normalizedTerm)) {
        return false;
      }

      const nextCharacter = question.charAt(normalizedTerm.length);
      return !nextCharacter || !/[a-z0-9]/.test(nextCharacter);
    });
  }

  private normalize(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/([a-z])\1+/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }
}
