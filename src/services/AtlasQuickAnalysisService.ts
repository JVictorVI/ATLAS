import { AtlasPromptAssemblyService } from "../prompt/AtlasPromptAssemblyService";
import { CloudApiService } from "./CloudApiService";
import { AtlasQuickIssue } from "../interfaces/AtlasQuickAnalysisTypes";

export class AtlasQuickAnalysisService {
  constructor(
    private readonly promptAssemblyService: AtlasPromptAssemblyService,
    private readonly cloudApiService: CloudApiService,
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

    const response = await this.cloudApiService.sendChat(promptResult.messages);
    return this.parseIssues(response.content);
  }

  private buildQuickAnalysisPrompt(
    code: string,
    languageId?: string,
    fileName?: string,
  ): string {
    return [
      "Realize uma análise rápida arquitetural do código abaixo.",
      "Identifique apenas linhas ou blocos com problemas arquiteturais observáveis.",
      "Retorne exclusivamente JSON válido no formato solicitado.",
      "",
      fileName ? `Arquivo: ${fileName}` : "",
      languageId ? `Linguagem: ${languageId}` : "",
      "",
      "Código:",
      code,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private parseIssues(raw: string): AtlasQuickIssue[] {
    const extracted = this.extractJsonArray(raw);
    const parsed = JSON.parse(extracted);

    if (!Array.isArray(parsed)) {
      throw new Error("A resposta da análise rápida não é um array JSON.");
    }

    const validSeverities = new Set(["low", "medium", "high"]);
    const validCategories = new Set([
      "coupling",
      "cohesion",
      "responsibility",
      "abstraction",
      "dependency",
      "layering",
      "solid",
      "grasp",
      "maintainability",
    ]);

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        startLine: Number((item as any).startLine),
        endLine: Number((item as any).endLine),
        severity: String((item as any).severity ?? "").trim(),
        category: String((item as any).category ?? "").trim(),
        message: String((item as any).message ?? "").trim(),
      }))
      .filter(
        (item) =>
          Number.isInteger(item.startLine) &&
          item.startLine >= 1 &&
          Number.isInteger(item.endLine) &&
          item.endLine >= item.startLine &&
          validSeverities.has(item.severity) &&
          validCategories.has(item.category) &&
          item.message.length > 0,
      ) as AtlasQuickIssue[];
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
