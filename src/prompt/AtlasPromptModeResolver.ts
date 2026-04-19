export type AtlasPromptMode =
  | "architectural-analysis"
  | "developer-assistant"
  | "out-of-scope";

export type AtlasPromptModeResolverInput = {
  userQuestion: string;
  hasCodeContext?: boolean;
  hasAnalysisContext?: boolean;
  hasRagContext?: boolean;
};

export class AtlasPromptModeResolver {
  public resolve(input: {
    userQuestion: string;
    hasCodeContext?: boolean;
    hasAnalysisContext?: boolean;
    hasRagContext?: boolean;
  }): AtlasPromptMode {
    const text = this.normalize(input.userQuestion);

    let architecturalScore = 0;
    let developerScore = 0;

    const strongArchitecturalSignals = [
      "analise",
      "analisar",
      "trade-off",
      "tradeoff",
      "impacto arquitetural",
      "risco arquitetural",
      "sustentavel",
      "sustentável",
      "acoplamento",
      "coesao",
      "coesão",
      "solid",
      "decisao de design",
      "decisão de design",
    ];

    const developerSignals = [
      "como",
      "o que e",
      "o que é",
      "por que",
      "erro",
      "bug",
      "typescript",
      "javascript",
      "python",
      "api",
      "fetch",
      "teste",
      "mock",
      "interface",
      "dto",
      "pattern",
      "react",
      "angular",
      "sql",
    ];

    for (const term of strongArchitecturalSignals) {
      if (text.includes(this.normalize(term))) {
        architecturalScore += 2;
      }
    }

    for (const term of developerSignals) {
      if (text.includes(this.normalize(term))) {
        developerScore += 1;
      }
    }

    const asksForAnalysis =
      /(analis(e|ar)|avalie|critique|quais os trade|quais os riscos|isso escala|isso sustenta)/i.test(
        input.userQuestion,
      );

    if (asksForAnalysis) {
      architecturalScore += 3;
    }

    const hasContext =
      Boolean(input.hasCodeContext) ||
      Boolean(input.hasAnalysisContext) ||
      Boolean(input.hasRagContext);

    if (hasContext) {
      architecturalScore += 1;
    }

    const asksForExplanation =
      /^(o que e|o que é|como|qual a diferenca|qual a diferença|por que)/i.test(
        text,
      );

    if (asksForExplanation) {
      developerScore += 2;
    }

    if (architecturalScore >= 4 && architecturalScore > developerScore) {
      return "architectural-analysis";
    }

    if (developerScore > 0 || hasContext) {
      return "developer-assistant";
    }

    return "out-of-scope";
  }

  private normalize(text: string): string {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }
}

/* Versão anterior mais rígida, baseada em palavras-chave específicas. A nova versão é mais flexível e adaptativa
Analisar qual a melhor depois 
export class AtlasPromptModeResolver {
  private readonly architecturalTerms = [
    "analise",
    "analisar",
    "análise",
    "arquitetura",
    "arquitetural",
    "trade-off",
    "tradeoff",
    "acoplamento",
    "coesão",
    "cohesao",
    "solid",
    "srp",
    "ocp",
    "dip",
    "design",
    "decisão de design",
    "decisao de design",
    "sustentável",
    "sustentavel",
    "escalabilidade",
    "manutenção",
    "manutencao",
    "modularização",
    "modularizacao",
    "refatoração",
    "refatoracao",
    "impacto arquitetural",
    "risco arquitetural",
    "essa classe",
    "esse código",
    "esse codigo",
    "esse trecho",
    "esse serviço",
    "esse servico",
  ];

  private readonly developerTerms = [
    "typescript",
    "javascript",
    "python",
    "java",
    "c#",
    "csharp",
    "sql",
    "api",
    "rest",
    "graphql",
    "fetch",
    "async",
    "await",
    "promise",
    "bug",
    "erro",
    "exception",
    "teste",
    "mock",
    "interface",
    "classe",
    "função",
    "funcao",
    "objeto",
    "dto",
    "controller",
    "service",
    "repository",
    "hook",
    "frontend",
    "backend",
    "framework",
    "biblioteca",
    "pattern",
    "design pattern",
    "strategy",
    "observer",
    "factory",
    "injeção de dependência",
    "injecao de dependencia",
    "dependency injection",
    "debounce",
    "regex",
    "docker",
    "json",
    "xml",
    "html",
    "css",
    "node",
    "react",
    "angular",
    "vue",
    "vscode",
  ];

  public resolve(input: AtlasPromptModeResolverInput): AtlasPromptMode {
    const question = this.normalize(input.userQuestion);

    const hasStructuralContext =
      input.hasCodeContext === true ||
      input.hasAnalysisContext === true ||
      input.hasRagContext === true;

    const hasArchitecturalIntent = this.architecturalTerms.some((term) =>
      question.includes(this.normalize(term)),
    );

    if (hasStructuralContext || hasArchitecturalIntent) {
      return "architectural-analysis";
    }

    const hasDeveloperIntent = this.developerTerms.some((term) =>
      question.includes(this.normalize(term)),
    );

    if (hasDeveloperIntent) {
      return "developer-assistant";
    }

    return "out-of-scope";
  }

  private normalize(text: string): string {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }
}*/
