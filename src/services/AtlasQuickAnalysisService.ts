import { AtlasPromptAssemblyService } from "../prompt/AtlasPromptAssemblyService";
import { AtlasInferenceService } from "./AtlasInferenceService";
import {
  AtlasQuickIssue,
  AtlasQuickIssueCategory,
  AtlasQuickIssueSeverity,
} from "../interfaces/AtlasQuickAnalysisTypes";

export class AtlasQuickAnalysisService {
  constructor(
    private readonly promptAssemblyService: AtlasPromptAssemblyService,
    private readonly inferenceService: AtlasInferenceService,
  ) {}

  public async analyzeCode(
    code: string,
    languageId?: string,
    fileName?: string,
  ): Promise<AtlasQuickIssue[]> {
    const promptResult = this.promptAssemblyService.buildMessages({
      forcedMode: "quick-analysis",
      userQuestion: this.buildQuickAnalysisPrompt(code, languageId, fileName),
      history: [],
      analysisContext: [],
      ragContext: [],
      hasCodeContext: true,
    });

    const response = await this.inferenceService.sendChat(promptResult.messages);
    return this.parseIssues(response.content);
  }

  private buildQuickAnalysisPrompt(
    code: string,
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

  private normalizeSeverity(
    value: unknown,
  ): AtlasQuickIssueSeverity | null {
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

  private normalizeCategory(
    value: unknown,
  ): AtlasQuickIssueCategory | null {
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
