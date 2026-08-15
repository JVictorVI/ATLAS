import { createHash } from "crypto";
import * as vscode from "vscode";
import { ChatMessage } from "../interfaces/ApiTypes";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import {
  AtlasCodeEditRefactorMetadata,
  AtlasCodeEditResult,
} from "../interfaces/AtlasCodeEditTypes";
import { AtlasEditorContext } from "../interfaces/AtlasEditorTypes";
import { AtlasCodeEditService } from "../services/AtlasCodeEditService";
import { AtlasDocumentStructureService } from "../services/AtlasDocumentStructureService";
import { AtlasInferenceService } from "../services/AtlasInferenceService";
import { AtlasEditorContextService } from "./AtlasEditorContextService";
import type {
  ActiveGenerationPayload,
  GenerationTarget,
} from "./ChatMessageRouterTypes";

type AtlasDirectCodeEditOptions = {
  userRequest: string;
  sessionId?: string;
  generationId?: string;
  ragContext?: string[];
  signal?: AbortSignal;
};

type AtlasArchitectureGuidedEditOptions = {
  analysisContent: string;
  refactorMetadata: AtlasCodeEditRefactorMetadata;
  sessionId?: string;
  generationId?: string;
  ragContext?: string[];
  signal?: AbortSignal;
};

type AtlasCodeEditStatusSource = "developer-assistant" | "architectural-analysis";

type ActiveCodeEdit = {
  key: string;
  sessionId?: string;
  generationId?: string;
  userContent: string;
  source: AtlasCodeEditStatusSource;
};

type AtlasOperationalEditDecisionOptions = {
  editorContext?: AtlasEditorContext | null;
  history?: ChatMessage[];
  signal?: AbortSignal;
};

type AtlasCodeEditIntentConfidence = "low" | "medium" | "high";

type AtlasCodeEditIntentDecision = {
  shouldApplyCodeEdit: boolean;
  confidence: AtlasCodeEditIntentConfidence;
  reason: string;
};

export class AtlasCodeEditController {
  private readonly activeControllers = new Map<string, AbortController>();
  private readonly activeEdits = new Map<string, ActiveCodeEdit>();

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
    private readonly inferenceService?: AtlasInferenceService,
  ) {}

  public isOperationalEditRequest(userRequest: string): boolean {
    const normalized = this.normalize(userRequest);

    if (!this.passesDeterministicEditGuards(normalized)) {
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

  public async shouldApplyDirectEditRequest(
    userRequest: string,
    options: AtlasOperationalEditDecisionOptions = {},
  ): Promise<boolean> {
    const normalized = this.normalize(userRequest);

    if (!this.configManager.isRefactoringEnabled()) {
      return false;
    }

    if (!this.passesDeterministicEditGuards(normalized)) {
      return false;
    }

    if (!this.configManager.useModelIntentDetectionForCodeEditing()) {
      return this.isOperationalEditRequest(userRequest);
    }

    const modelDecision = await this.classifyEditIntentWithModel(
      userRequest,
      options,
    );

    if (typeof modelDecision === "boolean") {
      return modelDecision;
    }

    return this.isOperationalEditRequest(userRequest);
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

    const editKey =
      options.sessionId ?? options.generationId ?? "standalone-code-edit";
    const signal = this.prepareSignal(editKey, options.signal);
    const activeEdit: ActiveCodeEdit = {
      key: editKey,
      sessionId: options.sessionId,
      generationId: options.generationId,
      userContent: options.userRequest,
      source: "developer-assistant",
    };
    this.activeEdits.set(editKey, activeEdit);

    try {
      await this.postStatus(webview, activeEdit, {
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
      if (this.activeEdits.get(editKey) === activeEdit) {
        this.activeEdits.delete(editKey);
      }

      this.releaseSignal(editKey, signal);
      await this.postStatus(webview, activeEdit, {
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

    const editKey =
      options.sessionId ?? options.generationId ?? "standalone-code-edit";
    const signal = this.prepareSignal(editKey, options.signal);
    const activeEdit: ActiveCodeEdit = {
      key: editKey,
      sessionId: options.sessionId,
      generationId: options.generationId,
      userContent: "Refatorar com base na anÃ¡lise arquitetural anterior.",
      source: "architectural-analysis",
    };
    this.activeEdits.set(editKey, activeEdit);

    try {
      await this.postStatus(webview, activeEdit, {
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
      if (this.activeEdits.get(editKey) === activeEdit) {
        this.activeEdits.delete(editKey);
      }

      this.releaseSignal(editKey, signal);
      await this.postStatus(webview, activeEdit, {
        loading: false,
        source: "architectural-analysis",
      });
    }
  }

  public cancelActiveEdit(target: GenerationTarget = {}): void {
    const activeEdit = this.findActiveEdit(target);

    if (!activeEdit) {
      return;
    }

    this.activeControllers.get(activeEdit.key)?.abort();
    this.activeControllers.delete(activeEdit.key);
    this.activeEdits.delete(activeEdit.key);
  }

  public serializeActiveGenerations(): ActiveGenerationPayload[] {
    return [...this.activeEdits.values()]
      .filter(
        (edit): edit is ActiveCodeEdit & { sessionId: string } =>
          typeof edit.sessionId === "string",
      )
      .map((edit) => ({
        sessionId: edit.sessionId,
        userContent: edit.userContent,
        partialContent: "",
        isStreaming: false,
        generationId: edit.generationId,
        forcedMode:
          edit.source === "architectural-analysis"
            ? "architecture-code-edit"
            : "code-edit",
      }));
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

  private prepareSignal(
    editKey: string,
    signal?: AbortSignal,
  ): AbortSignal | undefined {
    if (signal) {
      return signal;
    }

    this.activeControllers.get(editKey)?.abort();
    const controller = new AbortController();
    this.activeControllers.set(editKey, controller);
    return controller.signal;
  }

  private releaseSignal(editKey: string, signal?: AbortSignal): void {
    if (this.activeControllers.get(editKey)?.signal === signal) {
      this.activeControllers.delete(editKey);
    }
  }

  private findActiveEdit(target: GenerationTarget): ActiveCodeEdit | null {
    if (target.sessionId) {
      const activeEdit = this.activeEdits.get(target.sessionId) ?? null;

      return activeEdit &&
        (!target.generationId || activeEdit.generationId === target.generationId)
        ? activeEdit
        : null;
    }

    if (target.generationId) {
      return (
        [...this.activeEdits.values()].find(
          (edit) => edit.generationId === target.generationId,
        ) ?? null
      );
    }

    return null;
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

  private passesDeterministicEditGuards(normalizedUserRequest: string): boolean {
    if (this.hasAnyTerm(normalizedUserRequest, this.explicitNoEditTerms)) {
      return false;
    }

    if (
      this.hasAnyTerm(normalizedUserRequest, this.broadScopeTerms) &&
      !this.hasAnyTerm(normalizedUserRequest, this.localScopeTerms)
    ) {
      return false;
    }

    return true;
  }

  private async classifyEditIntentWithModel(
    userRequest: string,
    options: AtlasOperationalEditDecisionOptions,
  ): Promise<boolean | null> {
    if (!this.inferenceService) {
      return null;
    }

    try {
      const response = await this.inferenceService.sendChat(
        this.buildEditIntentMessages(userRequest, options),
        undefined,
        { signal: options.signal },
      );
      const decision = this.parseEditIntentDecision(response.content);

      if (!decision) {
        return null;
      }

      return decision.shouldApplyCodeEdit && decision.confidence !== "low";
    } catch (error) {
      if (
        AtlasInferenceService.isAbortError(error) ||
        options.signal?.aborted
      ) {
        throw error;
      }

      console.warn(
        "[ATLAS] Falha ao classificar intenção de edição; usando heurística local:",
        error,
      );
      return null;
    }
  }

  private buildEditIntentMessages(
    userRequest: string,
    options: AtlasOperationalEditDecisionOptions,
  ): ChatMessage[] {
    return [
      {
        role: "system",
        content: [
          "Você é o classificador de intenção operacional do ATLAS.",
          "",
          "Decida se a mensagem atual do usuário deve acionar edição aplicada no arquivo aberto ou apenas resposta textual no chat.",
          "",
          "Retorne exclusivamente JSON válido, sem Markdown e sem texto fora do JSON.",
          "",
          "Use shouldApplyCodeEdit=true somente quando o usuário pedir que o ATLAS altere, implemente, corrija, refatore, remova, crie, ajuste, formate ou aplique mudanças no código agora.",
          "Use shouldApplyCodeEdit=false para dúvidas, explicações, análises, brainstorm, planejamento, revisão, perguntas de possibilidade ou pedidos explícitos para não editar.",
          "Quando a mensagem for curta, como 'faça isso' ou 'vamos fazer essas', use o histórico recente para decidir se ela retoma sugestões de alteração no código.",
          "Se houver incerteza relevante, escolha shouldApplyCodeEdit=false e confidence='low'.",
          "",
          "Schema obrigatório:",
          "{",
          '  "shouldApplyCodeEdit": true | false,',
          '  "confidence": "low" | "medium" | "high",',
          '  "reason": "motivo curto em português"',
          "}",
        ].join("\n"),
      },
      {
        role: "user",
        content: this.buildEditIntentUserMessage(userRequest, options),
      },
    ];
  }

  private buildEditIntentUserMessage(
    userRequest: string,
    options: AtlasOperationalEditDecisionOptions,
  ): string {
    const editorContext = options.editorContext;
    const editorBlock = editorContext
      ? [
          "Arquivo aberto:",
          `- Nome: ${editorContext.fileName}`,
          `- Linguagem: ${editorContext.languageId}`,
          `- Linhas: ${editorContext.lineCount}`,
          `- Contexto enviado: ${
            editorContext.source === "selection" ? "seleção" : "arquivo"
          }`,
        ]
      : ["Arquivo aberto: indisponível"];
    const historyBlock = this.buildEditIntentHistoryBlock(
      options.history ?? [],
    );

    return [
      ...editorBlock,
      "",
      "Histórico recente:",
      historyBlock || "- nenhum",
      "",
      "Mensagem atual do usuário:",
      this.limitText(userRequest, 2000),
      "",
      "Classifique apenas a intenção desta mensagem atual.",
    ].join("\n");
  }

  private buildEditIntentHistoryBlock(history: ChatMessage[]): string {
    return history
      .slice(-6)
      .map((message) => {
        return `- ${message.role}: ${this.limitText(message.content, 1200)}`;
      })
      .join("\n");
  }

  private parseEditIntentDecision(
    content: string,
  ): AtlasCodeEditIntentDecision | null {
    const jsonText = this.extractJsonObject(content);

    if (!jsonText) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;

      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }

      return {
        shouldApplyCodeEdit: parsed.shouldApplyCodeEdit === true,
        confidence: this.normalizeIntentConfidence(parsed.confidence),
        reason:
          typeof parsed.reason === "string"
            ? this.limitText(parsed.reason, 300)
            : "",
      };
    } catch {
      return null;
    }
  }

  private extractJsonObject(content: string): string | null {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");

    if (start < 0 || end <= start) {
      return null;
    }

    return content.slice(start, end + 1);
  }

  private normalizeIntentConfidence(
    value: unknown,
  ): AtlasCodeEditIntentConfidence {
    return value === "high" || value === "medium" || value === "low"
      ? value
      : "low";
  }

  private limitText(value: string, maxCharacters: number): string {
    if (value.length <= maxCharacters) {
      return value;
    }

    return `${value.slice(0, maxCharacters)}...`;
  }

  private async postStatus(
    webview: vscode.Webview | undefined,
    activeEdit: ActiveCodeEdit,
    value: {
      loading: boolean;
      source: AtlasCodeEditStatusSource;
      message?: string;
    },
  ): Promise<void> {
    await webview?.postMessage({
      type: "edicaoCodigoStatus",
      sessionId: activeEdit.sessionId,
      generationId: activeEdit.generationId,
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
