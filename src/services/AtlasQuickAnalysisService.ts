import * as vscode from "vscode";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasPromptAssemblyService } from "../prompt/AtlasPromptAssemblyService";
import { AtlasInferenceService } from "./AtlasInferenceService";
import { AtlasDocumentStructureService } from "./AtlasDocumentStructureService";
import {
  AtlasQuickIssue,
  AtlasQuickIssueCategory,
  AtlasQuickIssueSeverity,
} from "../interfaces/AtlasQuickAnalysisTypes";

export class AtlasQuickAnalysisService {
  constructor(
    private readonly promptAssemblyService: AtlasPromptAssemblyService,
    private readonly inferenceService: AtlasInferenceService,
    private readonly documentStructureService: AtlasDocumentStructureService,
    private readonly configManager: AtlasConfigManager,
  ) {}

  public async analyzeCode(
    document: vscode.TextDocument,
    code: string,
    languageId?: string,
    fileName?: string,
    signal?: AbortSignal,
  ): Promise<AtlasQuickIssue[]> {
    this.throwIfAborted(signal);

    const structureSummary = await this.buildOptionalStructureSummary(document);

    this.throwIfAborted(signal);

    const promptResult = this.promptAssemblyService.buildMessages({
      forcedMode: "quick-analysis",
      userQuestion: this.buildQuickAnalysisPrompt(
        code,
        structureSummary,
        languageId,
        fileName,
      ),
      history: [],
      analysisContext: [],
      ragContext: [],
      hasCodeContext: true,
    });

    const response = await this.inferenceService.sendChat(
      promptResult.messages,
      undefined,
      { signal },
    );

    this.throwIfAborted(signal);

    const issues = this.parseIssues(response.content);

    this.throwIfAborted(signal);

    return issues;
  }

  private buildQuickAnalysisPrompt(
    code: string,
    structureSummary: string,
    languageId?: string,
    fileName?: string,
  ): string {
    const numberedCode = this.addLineNumbers(code);
    const lineCount = numberedCode.lineCount;

    return [
      "Realize uma análise rápida arquitetural do código abaixo.",
      "Faça uma varredura completa do arquivo, cobrindo início, meio e fim.",
      "Identifique todas as linhas ou blocos com problemas arquiteturais observáveis e distintos.",
      "Não limite a resposta aos primeiros problemas encontrados.",
      "Avalie cada classe e função declarada, inclusive repositories, services, gateways, adapters e helpers pequenos.",
      "Não ignore uma classe auxiliar quando ela define uma fronteira de persistência, integração, notificação ou contrato de domínio.",
      "Use os números no início de cada linha para preencher startLine e endLine.",
      "Os prefixos no formato '<linha> |' são apenas referência; não fazem parte do código original.",
      "Retorne exclusivamente JSON válido no formato solicitado.",
      "",
      "Estrutura coletada pelos provedores da linguagem no VS Code:",
      structureSummary,
      "",
      "Use a estrutura acima apenas como evidência auxiliar para localizar e compreender os elementos do arquivo.",
      "Quando a coleta estiver limitada ou não trouxer símbolos, analise normalmente o código numerado.",
      "Não invente relações, dependências ou símbolos que não estejam visíveis no código ou na estrutura coletada.",
      "",
      fileName ? `Arquivo: ${fileName}` : "",
      languageId ? `Linguagem: ${languageId}` : "",
      `Total de linhas recebidas: ${lineCount}`,
      "",
      "Código numerado:",
      numberedCode.content,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private addLineNumbers(code: string): { content: string; lineCount: number } {
    const lines = code.split(/\r\n|\r|\n/);
    const width = String(lines.length).length;
    const content = lines
      .map((line, index) => {
        const lineNumber = String(index + 1).padStart(width, " ");
        return `${lineNumber} | ${line}`;
      })
      .join("\n");

    return {
      content,
      lineCount: lines.length,
    };
  }

  private async buildOptionalStructureSummary(
    document: vscode.TextDocument,
  ): Promise<string> {
    if (!this.configManager.isStaticAnalysisEnabledFor("quick-analysis")) {
      return "Coleta estática desativada para a análise rápida nas configurações do ATLAS.";
    }

    const structure = await this.documentStructureService.collect(document);
    const summaries = [this.documentStructureService.buildSummary(structure)];

    if (this.configManager.getStaticAnalysisConfig().includeDiagnostics) {
      summaries.push(
        this.documentStructureService.buildDiagnosticsSummary(document),
      );
    }

    if (this.configManager.getStaticAnalysisConfig().includeSymbolRelations) {
      summaries.push(
        await this.documentStructureService.buildSymbolRelationsSummary(
          document,
        ),
      );
    }

    const summary = summaries.join("\n\n");

    console.log("[ATLAS] Análise estática gerada (análise rápida):\n", summary);

    return summary;
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    const error = new Error("Análise rápida cancelada pelo usuário.");
    error.name = "AbortError";
    throw error;
  }

  private parseIssues(raw: string): AtlasQuickIssue[] {
    const extracted = this.extractJsonArray(raw);
    const parsed = JSON.parse(extracted);

    if (!Array.isArray(parsed)) {
      throw new Error("A resposta da análise rápida não é um array JSON.");
    }

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        startLine: Number((item as any).startLine),
        endLine: Number((item as any).endLine),
        severity: this.normalizeSeverity((item as any).severity),
        category: this.normalizeCategory((item as any).category),
        message: String((item as any).message ?? "").trim(),
        impact: String(
          (item as any).impact ??
            (item as any).problem ??
            (item as any).consequence ??
            "",
        ).trim(),
        suggestion: String(
          (item as any).suggestion ??
            (item as any).recommendation ??
            (item as any).fix ??
            "",
        ).trim(),
      }))
      .filter((item): item is AtlasQuickIssue => {
        return (
          Number.isInteger(item.startLine) &&
          item.startLine >= 1 &&
          Number.isInteger(item.endLine) &&
          item.endLine >= item.startLine &&
          item.severity !== null &&
          item.category !== null &&
          item.message.length > 0
        );
      });
  }

  private normalizeSeverity(value: unknown): AtlasQuickIssueSeverity | null {
    const normalized = this.normalizeClassifierToken(value);
    const aliases: Record<string, AtlasQuickIssueSeverity> = {
      low: "low",
      baixo: "low",
      baixa: "low",
      leve: "low",
      azul: "low",
      blue: "low",
      info: "low",
      informational: "low",
      medium: "medium",
      medio: "medium",
      media: "medium",
      moderado: "medium",
      moderada: "medium",
      amarelo: "medium",
      yellow: "medium",
      warning: "medium",
      high: "high",
      alto: "high",
      alta: "high",
      grave: "high",
      severo: "high",
      severa: "high",
      vermelho: "high",
      red: "high",
      error: "high",
      critical: "high",
    };

    return aliases[normalized] ?? null;
  }

  private normalizeCategory(value: unknown): AtlasQuickIssueCategory | null {
    const normalized = this.normalizeClassifierToken(value);
    const aliases: Record<string, AtlasQuickIssueCategory> = {
      coupling: "coupling",
      acoplamento: "coupling",
      tightcoupling: "coupling",
      temporalcoupling: "coupling",
      acoplamentotemporal: "coupling",
      cohesion: "cohesion",
      coesao: "cohesion",
      lowcohesion: "cohesion",
      baixacoesao: "cohesion",
      responsibility: "responsibility",
      responsibilities: "responsibility",
      responsabilidade: "responsibility",
      responsabilidades: "responsibility",
      srp: "responsibility",
      singleresponsibility: "responsibility",
      abstraction: "abstraction",
      abstracao: "abstraction",
      abstract: "abstraction",
      interface: "abstraction",
      contract: "abstraction",
      contrato: "abstraction",
      dependency: "dependency",
      dependencies: "dependency",
      dependencia: "dependency",
      dependencias: "dependency",
      concrete_dependency: "dependency",
      concretedependency: "dependency",
      dip: "dependency",
      dependencyinversion: "dependency",
      layering: "layering",
      layer: "layering",
      layers: "layering",
      camada: "layering",
      camadas: "layering",
      layerviolation: "layering",
      quebradecamada: "layering",
      solid: "solid",
      ocp: "solid",
      lsp: "solid",
      isp: "solid",
      grasp: "grasp",
      controller: "grasp",
      creator: "grasp",
      informationexpert: "grasp",
      maintainability: "maintainability",
      manutenibilidade: "maintainability",
      manutencao: "maintainability",
      manutenção: "maintainability",
      complexity: "maintainability",
      complexidade: "maintainability",
      duplication: "maintainability",
      duplicacao: "maintainability",
      duplicação: "maintainability",
    };

    return aliases[normalized] ?? null;
  }

  private normalizeClassifierToken(value: unknown): string {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "");
  }

  private extractJsonArray(raw: string): string {
    const trimmed = raw.trim();

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return trimmed;
    }

    const firstBracket = trimmed.indexOf("[");
    const lastBracket = trimmed.lastIndexOf("]");

    if (
      firstBracket === -1 ||
      lastBracket === -1 ||
      lastBracket <= firstBracket
    ) {
      throw new Error(
        "Não foi possível localizar um array JSON válido na resposta.",
      );
    }

    return trimmed.slice(firstBracket, lastBracket + 1);
  }
}
