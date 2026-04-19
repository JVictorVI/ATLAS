import {
  AtlasPromptMode,
  AtlasPromptModeResolverInput,
} from "../interfaces/AtlasPromptTypes";

export class AtlasPromptModeResolver {
  private readonly architecturalTerms = [
    "analise",
    "analisar",
    "análise",
    "avaliar",
    "avaliação",
    "avaliacao",
    "review",
    "revisão",
    "revisao",
    "arquitetura",
    "arquitetural",
    "design",
    "decisão de design",
    "decisao de design",
    "decisão arquitetural",
    "decisao arquitetural",
    "estrutura",
    "acoplamento",
    "coesão",
    "cohesao",
    "responsabilidade",
    "responsabilidades",
    "solid",
    "srp",
    "ocp",
    "dip",
    "lsp",
    "isp",
    "trade-off",
    "tradeoff",
    "impacto arquitetural",
    "impacto estrutural",
    "risco arquitetural",
    "escalabilidade",
    "manutenibilidade",
    "manutenção",
    "manutencao",
    "modularização",
    "modularizacao",
    "desacoplamento",
    "arquitetura em camadas",
    "clean architecture",
    "refatoração",
    "refatoracao",
    "melhorar arquitetura",
    "isso escala",
    "isso é sustentável",
    "isso é sustentavel",
    "isso é bom design",
    "isso faz sentido",
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

  private readonly developerTerms = [
    "typescript",
    "javascript",
    "python",
    "java",
    "c#",
    "go",
    "erro",
    "bug",
    "debug",
    "teste",
    "api",
    "react",
    "angular",
    "sql",
    "query",
    "docker",
    "json",
    "regex",
    "vscode",
    "terminal",
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

  public resolve(input: AtlasPromptModeResolverInput): AtlasPromptMode {
    if (input.forcedMode) {
      return input.forcedMode;
    }

    const question = this.normalize(input.userQuestion);

    const hasQuickIntent = this.quickAnalysisTerms.some((term) =>
      question.includes(this.normalize(term)),
    );

    if (hasQuickIntent) {
      return "quick-analysis";
    }

    const hasArchitecturalIntent = this.architecturalTerms.some((term) =>
      question.includes(this.normalize(term)),
    );

    if (hasArchitecturalIntent) {
      return "architectural-analysis";
    }

    const hasDeveloperIntent = this.developerTerms.some((term) =>
      question.includes(this.normalize(term)),
    );

    if (hasDeveloperIntent) {
      return "developer-assistant";
    }

    return "developer-assistant";
  }

  private normalize(text: string): string {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }
}
