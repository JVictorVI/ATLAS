import {
  AtlasPromptMode,
  AtlasPromptModeResolverInput,
} from "../interfaces/AtlasPromptTypes";

export class AtlasPromptModeResolver {
  private readonly explicitArchitecturalPhrases = [
    "analise arquitetural",
    "analise de arquitetura",
    "analise da arquitetura",
    "analisar arquitetura",
    "avaliacao arquitetural",
    "revisao arquitetural",
    "review arquitetural",
    "problemas arquiteturais",
    "decisoes arquiteturais",
    "decisao arquitetural",
    "decisao de design",
    "impacto arquitetural",
    "risco arquitetural",
    "design arquitetural",
    "bom design de software",
    "analise qualitativa",
    "avaliacao qualitativa",
    "revisao qualitativa",
    "review qualitativo",
    "leitura qualitativa",
    "diagnostico qualitativo",
  ];

  private readonly strongArchitecturalTerms = [
    "arquitetura",
    "arquitetural",
    "acoplamento",
    "coesão",
    "cohesao",
    "solid",
    "srp",
    "ocp",
    "dip",
    "lsp",
    "isp",
    "grasp",
    "clean architecture",
    "arquitetura em camadas",
    "camadas",
    "layering",
    "modularização",
    "modularizacao",
    "desacoplamento",
    "manutenibilidade",
    "manutenção",
    "manutencao",
    "escalabilidade",
    "sustentável",
    "sustentavel",
    "qualitativo",
    "qualitativa",
    "qualitativamente",
    "qualidade arquitetural",
    "qualidade estrutural",
    "qualidade de design",
    "qualidade do design",
  ];

  private readonly contextualArchitecturalTerms = [
    "estrutura",
    "responsabilidade",
    "responsabilidades",
    "trade-off",
    "tradeoff",
    "trade off",
    "impacto estrutural",
    "custo de mudança",
    "custo de mudanca",
    "evolução",
    "evolucao",
    "evoluir",
    "refatoração",
    "refatoracao",
    "refatorar",
    "melhorar arquitetura",
    "isso escala",
    "fronteira",
    "boundary",
    "separação de camadas",
    "separacao de camadas",
    "isso está correto arquiteturalmente",
  ];

  private readonly quickAnalysisTerms = [
    "análise rápida",
    "analise rapida",
    "quick analysis",
    "identificar linhas",
    "destacar linhas",
    "marcar linhas",
    "problemas por linha",
    "detectar linhas problemáticas",
    "detectar linhas problematicas",
    "destacar problemas no editor",
  ];

  private readonly analysisIntentTerms = [
    "analise",
    "analisar",
    "análise",
    "avaliar",
    "avaliação",
    "avaliacao",
    "review",
    "revisão",
    "revisao",
    "verifique",
    "veja",
    "olhe",
    "inspecione",
    "diagnostico",
    "diagnóstico",
  ];

  private readonly strongDeveloperTerms = [
    "erro",
    "bug",
    "debug",
    "corrigir",
    "corrija",
    "consertar",
    "falha",
    "exception",
    "stack trace",
    "teste",
    "testar",
    "unit test",
    "compilar",
    "lint",
    "terminal",
    "vscode",
    "regex",
    "sql",
    "query",
    "json",
  ];

  private readonly developerTerms = [
    "typescript",
    "javascript",
    "python",
    "java",
    "c#",
    "go",
    "api",
    "react",
    "angular",
    "docker",
    "classe",
    "método",
    "metodo",
    "função",
    "funcao",
    "service",
    "repository",
    "dto",
    "entity",
    "model",
  ];

  private readonly generalAssistantTerms = [
    "explique",
    "explica",
    "como funciona",
    "o que faz",
    "o que é",
    "o que e",
    "qual é",
    "qual e",
    "implemente",
    "implementa",
    "crie",
    "adicione",
    "remova",
    "gere",
    "escreva",
    "documente",
    "renomeie",
    "formate",
    "sintaxe",
    "exemplo",
  ];

  public resolve(input: AtlasPromptModeResolverInput): AtlasPromptMode {
    if (input.forcedMode) {
      return input.forcedMode;
    }

    const question = this.normalize(input.userQuestion);
    const hasCodeContext = Boolean(input.hasCodeContext || input.hasAnalysisContext);

    const hasQuickIntent = this.hasAnyTerm(question, this.quickAnalysisTerms);

    if (hasQuickIntent) {
      return "quick-analysis";
    }

    if (!hasCodeContext) {
      return "developer-assistant";
    }

    const hasExplicitArchitecturalIntent = this.hasAnyTerm(
      question,
      this.explicitArchitecturalPhrases,
    );

    if (hasExplicitArchitecturalIntent) {
      return "architectural-analysis";
    }

    const architecturalScore =
      this.scoreTerms(question, this.strongArchitecturalTerms, 3) +
      this.scoreTerms(question, this.contextualArchitecturalTerms, 2) +
      this.scoreTerms(question, this.analysisIntentTerms, 1);
    const developerScore =
      this.scoreTerms(question, this.strongDeveloperTerms, 3) +
      this.scoreTerms(question, this.developerTerms, 2) +
      this.scoreTerms(question, this.generalAssistantTerms, 2);
    const hasAnalysisIntent = this.hasAnyTerm(question, this.analysisIntentTerms);
    const hasStrongArchitecturalSignal = this.hasAnyTerm(
      question,
      this.strongArchitecturalTerms,
    );

    if (
      architecturalScore >= 4 &&
      architecturalScore >= developerScore
    ) {
      return "architectural-analysis";
    }

    if (
      hasAnalysisIntent &&
      architecturalScore >= 3 &&
      developerScore <= 1
    ) {
      return "architectural-analysis";
    }

    if (
      hasStrongArchitecturalSignal &&
      architecturalScore >= 3 &&
      developerScore === 0
    ) {
      return "architectural-analysis";
    }

    return "developer-assistant";
  }

  private hasAnyTerm(question: string, terms: string[]): boolean {
    return terms.some((term) => question.includes(this.normalize(term)));
  }

  private scoreTerms(question: string, terms: string[], weight: number): number {
    return terms.reduce(
      (score, term) =>
        question.includes(this.normalize(term)) ? score + weight : score,
      0,
    );
  }

  private normalize(text: string): string {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }
}
