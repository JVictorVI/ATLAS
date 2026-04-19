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
  private readonly architecturalTerms = [
    // ação / intenção
    "analise",
    "analisar",
    "análise",
    "avaliar",
    "avaliação",
    "avaliacao",
    "critique",
    "criticar",
    "review",
    "revisão",
    "revisao",
    "inspecione",
    "inspecionar",

    // arquitetura geral
    "arquitetura",
    "arquitetural",
    "design",
    "decisão de design",
    "decisao de design",
    "decisão arquitetural",
    "decisao arquitetural",
    "estrutura",
    "estruturação",
    "estruturacao",
    "organização do sistema",
    "organizacao do sistema",

    // qualidade estrutural
    "acoplamento",
    "alto acoplamento",
    "baixo acoplamento",
    "coesão",
    "cohesao",
    "alta coesão",
    "baixa coesão",
    "responsabilidade",
    "responsabilidades",
    "separação de responsabilidades",
    "separacao de responsabilidades",
    "single responsibility",
    "srp",

    // princípios
    "solid",
    "ocp",
    "dip",
    "lsp",
    "isp",
    "princípios de design",
    "principios de design",
    "boas práticas",
    "boas praticas",

    // trade-offs / impacto
    "trade-off",
    "tradeoff",
    "trade offs",
    "tradeoffs",
    "impacto",
    "impacto arquitetural",
    "impacto estrutural",
    "custo de mudança",
    "custo de mudanca",
    "custo de manutenção",
    "custo de manutencao",
    "complexidade acidental",

    // evolução / risco
    "risco",
    "riscos",
    "risco arquitetural",
    "evolução",
    "evolucao",
    "escala",
    "escalabilidade",
    "crescimento do sistema",
    "sustentável",
    "sustentavel",
    "sustentabilidade",
    "manutenibilidade",
    "manutenção",
    "manutencao",

    // modularização
    "modularização",
    "modularizacao",
    "modular",
    "desacoplamento",
    "desacoplar",
    "camadas",
    "layer",
    "layers",
    "arquitetura em camadas",
    "arquitetura hexagonal",
    "clean architecture",

    // padrões
    "padrões de projeto",
    "padroes de projeto",
    "design patterns",
    "strategy",
    "factory",
    "observer",
    "adapter",
    "decorator",

    // refatoração
    "refatoração",
    "refatoracao",
    "refatorar",
    "reestruturar",
    "melhorar design",
    "melhorar arquitetura",

    // contexto típico de análise
    "essa classe",
    "esse código",
    "esse codigo",
    "esse trecho",
    "esse serviço",
    "esse servico",
    "essa implementação",
    "essa implementacao",
    "essa abordagem",
    "essa solução",
    "essa solucao",

    // perguntas clássicas arquiteturais
    "isso escala",
    "isso sustenta",
    "isso é sustentável",
    "isso é sustentavel",
    "isso é bom design",
    "isso é bom design?",
    "isso faz sentido",
    "isso está correto arquiteturalmente",
  ];
  private readonly developerTerms = [
    // linguagens
    "typescript",
    "javascript",
    "python",
    "java",
    "c#",
    "csharp",
    "go",
    "golang",
    "ruby",
    "php",
    "kotlin",

    // conceitos básicos
    "variável",
    "variavel",
    "função",
    "funcao",
    "classe",
    "objeto",
    "array",
    "lista",
    "map",
    "set",

    // async / runtime
    "async",
    "await",
    "promise",
    "callback",
    "thread",
    "event loop",

    // erro / debug
    "erro",
    "bug",
    "exception",
    "stacktrace",
    "debug",
    "debugar",
    "por que não funciona",
    "por que nao funciona",

    // teste
    "teste",
    "testes",
    "unit test",
    "teste unitário",
    "teste unitario",
    "mock",
    "stub",
    "spy",

    // backend
    "api",
    "rest",
    "graphql",
    "endpoint",
    "request",
    "response",
    "http",
    "server",
    "middleware",

    // frontend
    "frontend",
    "react",
    "angular",
    "vue",
    "component",
    "hook",
    "state",
    "props",

    // banco
    "sql",
    "query",
    "join",
    "select",
    "insert",
    "update",
    "delete",
    "mongodb",
    "postgres",
    "mysql",

    // infra
    "docker",
    "container",
    "kubernetes",
    "deploy",
    "pipeline",
    "ci",
    "cd",

    // dados
    "json",
    "xml",
    "csv",

    // padrões (uso prático, não análise)
    "design pattern",
    "pattern",
    "factory",
    "observer",
    "strategy",

    // arquitetura leve (não análise profunda)
    "controller",
    "service",
    "repository",
    "dto",
    "entity",
    "model",

    // utilidades
    "regex",
    "debounce",
    "throttle",
    "parse",
    "serialize",

    // ambiente
    "node",
    "npm",
    "yarn",
    "vscode",
    "terminal",
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
}
