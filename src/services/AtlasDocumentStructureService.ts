import * as path from "path";
import * as vscode from "vscode";
import {
  AtlasCodeSymbol,
  AtlasDocumentStructure,
} from "../interfaces/AtlasCodeStructureTypes";

const RELEVANT_SYMBOL_KINDS = new Set<vscode.SymbolKind>([
  vscode.SymbolKind.File,
  vscode.SymbolKind.Module,
  vscode.SymbolKind.Namespace,
  vscode.SymbolKind.Package,
  vscode.SymbolKind.Class,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Property,
  vscode.SymbolKind.Field,
  vscode.SymbolKind.Constructor,
  vscode.SymbolKind.Enum,
  vscode.SymbolKind.Interface,
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Variable,
  vscode.SymbolKind.Constant,
  vscode.SymbolKind.EnumMember,
  vscode.SymbolKind.Struct,
  vscode.SymbolKind.Event,
  vscode.SymbolKind.Operator,
  vscode.SymbolKind.TypeParameter,
]);

const RELATION_SYMBOL_KINDS = new Set<vscode.SymbolKind>([
  vscode.SymbolKind.Class,
  vscode.SymbolKind.Interface,
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Struct,
  vscode.SymbolKind.Enum,
]);

const MAX_RELATION_SYMBOLS = 30;

type AtlasRelationCandidate = {
  name: string;
  kind: vscode.SymbolKind;
  position: vscode.Position;
  definitionRange: vscode.Range;
};

export class AtlasDocumentStructureService {
  public async collect(
    document: vscode.TextDocument,
  ): Promise<AtlasDocumentStructure> {
    const baseStructure = {
      languageId: document.languageId,
      fileName: path.basename(document.fileName),
      lineCount: document.lineCount,
    };

    try {
      const providedSymbols = await vscode.commands.executeCommand<
        vscode.DocumentSymbol[] | vscode.SymbolInformation[] | undefined
      >("vscode.executeDocumentSymbolProvider", document.uri);

      if (!providedSymbols?.length) {
        return {
          ...baseStructure,
          extractionLevel: "text",
          symbols: [],
          totalSymbols: 0,
          limitations: [
            "O provedor da linguagem não disponibilizou símbolos estruturais para este arquivo.",
          ],
        };
      }

      const symbols = providedSymbols
        .map((symbol) => this.normalizeSymbol(symbol))
        .filter((symbol): symbol is AtlasCodeSymbol => symbol !== null);

      return {
        ...baseStructure,
        extractionLevel: "symbols",
        symbols,
        totalSymbols: this.countSymbols(symbols),
        limitations: [],
      };
    } catch (error) {
      console.warn("[ATLAS] Não foi possível coletar símbolos do documento:", error);

      return {
        ...baseStructure,
        extractionLevel: "text",
        symbols: [],
        totalSymbols: 0,
        limitations: [
          "A coleta estrutural não estava disponível; a análise utilizará o conteúdo textual do arquivo.",
        ],
      };
    }
  }

  public buildSummary(structure: AtlasDocumentStructure): string {
    const lines = [
      `Arquivo: ${structure.fileName}`,
      `Linguagem identificada pelo VS Code: ${structure.languageId}`,
      `Total de linhas: ${structure.lineCount}`,
      `Nível da coleta estrutural: ${structure.extractionLevel}`,
    ];

    if (structure.symbols.length) {
      lines.push(
        `Total de símbolos identificados: ${structure.totalSymbols}`,
        "",
        "Símbolos estruturais identificados:",
      );

      for (const symbol of structure.symbols) {
        this.appendSymbolSummary(lines, symbol, 0);
      }
    } else {
      lines.push(
        "",
        "Nenhum símbolo estrutural foi fornecido pela extensão da linguagem.",
      );
    }

    if (structure.limitations.length) {
      lines.push(
        "",
        "Limitações da coleta:",
        ...structure.limitations.map((limitation) => `- ${limitation}`),
      );
    }

    return lines.join("\n");
  }

  public buildDiagnosticsSummary(document: vscode.TextDocument): string {
    const diagnostics = vscode.languages.getDiagnostics(document.uri);

    if (!diagnostics.length) {
      return [
        "Diagnósticos existentes no VS Code:",
        "- Nenhum diagnóstico foi publicado para este arquivo.",
      ].join("\n");
    }

    const counts = diagnostics.reduce(
      (total, diagnostic) => {
        total[this.getDiagnosticSeverityKey(diagnostic.severity)] += 1;
        return total;
      },
      { errors: 0, warnings: 0, information: 0, hints: 0 },
    );

    const lines = [
      "Diagnósticos existentes no VS Code:",
      `- Total: ${diagnostics.length}`,
      `- Erros: ${counts.errors}`,
      `- Avisos: ${counts.warnings}`,
      `- Informações: ${counts.information}`,
      `- Sugestões: ${counts.hints}`,
      "",
      "Detalhes dos diagnósticos:",
    ];

    for (const diagnostic of diagnostics) {
      const startLine = diagnostic.range.start.line + 1;
      const endLine = diagnostic.range.end.line + 1;
      const lineRange =
        startLine === endLine
          ? `linha ${startLine}`
          : `linhas ${startLine}-${endLine}`;
      const source = diagnostic.source ? `; origem: ${diagnostic.source}` : "";
      const code = this.getDiagnosticCode(diagnostic);
      const codeLabel = code ? `; código: ${code}` : "";
      const message = diagnostic.message.replace(/\s+/g, " ").trim();

      lines.push(
        `- ${this.getDiagnosticSeverityLabel(diagnostic.severity)} em ${lineRange}${source}${codeLabel}: ${message}`,
      );
    }

    return lines.join("\n");
  }

  public async buildSymbolRelationsSummary(
    document: vscode.TextDocument,
  ): Promise<string> {
    try {
      const providedSymbols = await vscode.commands.executeCommand<
        vscode.DocumentSymbol[] | vscode.SymbolInformation[] | undefined
      >("vscode.executeDocumentSymbolProvider", document.uri);

      const candidates = this.collectRelationCandidates(
        providedSymbols ?? [],
        document.uri,
      ).slice(0, MAX_RELATION_SYMBOLS);

      if (!candidates.length) {
        return [
          "Relações entre arquivos e símbolos:",
          "- Nenhuma classe, interface, função, struct ou enum foi disponibilizada para consulta.",
        ].join("\n");
      }

      const relationBlocks: string[] = [];

      for (const candidate of candidates) {
        const references = await vscode.commands.executeCommand<
          vscode.Location[] | undefined
        >(
          "vscode.executeReferenceProvider",
          document.uri,
          candidate.position,
        );
        const uniqueReferences = this.uniqueLocations(references ?? []).filter(
          (location) =>
            !(
              location.uri.toString() === document.uri.toString() &&
              location.range.intersection(candidate.definitionRange) !==
                undefined
            ),
        );
        const externalReferences = uniqueReferences.filter(
          (location) => location.uri.toString() !== document.uri.toString(),
        );
        const files = Array.from(
          new Set(
            externalReferences.map((location) =>
              vscode.workspace.asRelativePath(location.uri, false),
            ),
          ),
        ).sort((left, right) => left.localeCompare(right));

        if (!files.length) {
          continue;
        }

        relationBlocks.push(
          [
            `- ${this.getSymbolKindLabel(candidate.kind)}: ${candidate.name}`,
            `  - definido em: ${vscode.workspace.asRelativePath(document.uri, false)}`,
            `  - referências externas: ${externalReferences.length}`,
            "  - utilizado por:",
            ...files.map((file) => `    - ${file}`),
          ].join("\n"),
        );
      }

      const limitation =
        candidates.length === MAX_RELATION_SYMBOLS
          ? `\n- A consulta foi limitada aos primeiros ${MAX_RELATION_SYMBOLS} símbolos relevantes para preservar o desempenho.`
          : "";

      if (!relationBlocks.length) {
        return [
          "Relações entre arquivos e símbolos:",
          "- Nenhuma referência externa foi encontrada para os símbolos principais deste arquivo.",
          limitation,
        ]
          .filter(Boolean)
          .join("\n");
      }

      return [
        "Relações entre arquivos e símbolos:",
        "As relações abaixo representam referências externas informadas pelas extensões de linguagem do VS Code.",
        "",
        ...relationBlocks,
        limitation,
      ]
        .filter(Boolean)
        .join("\n");
    } catch (error) {
      console.warn(
        "[ATLAS] Não foi possível coletar relações entre símbolos:",
        error,
      );

      return [
        "Relações entre arquivos e símbolos:",
        "- O provedor da linguagem não disponibilizou referências para este arquivo.",
      ].join("\n");
    }
  }

  private normalizeSymbol(
    symbol: vscode.DocumentSymbol | vscode.SymbolInformation,
  ): AtlasCodeSymbol | null {
    if (!RELEVANT_SYMBOL_KINDS.has(symbol.kind)) {
      return null;
    }

    if (this.isDocumentSymbol(symbol)) {
      return {
        name: symbol.name,
        kind: this.getSymbolKindLabel(symbol.kind),
        detail: symbol.detail?.trim() || undefined,
        startLine: symbol.range.start.line + 1,
        endLine: symbol.range.end.line + 1,
        children: symbol.children
          .map((child) => this.normalizeSymbol(child))
          .filter((child): child is AtlasCodeSymbol => child !== null),
      };
    }

    return {
      name: symbol.name,
      kind: this.getSymbolKindLabel(symbol.kind),
      containerName: symbol.containerName?.trim() || undefined,
      startLine: symbol.location.range.start.line + 1,
      endLine: symbol.location.range.end.line + 1,
      children: [],
    };
  }

  private collectRelationCandidates(
    symbols: Array<vscode.DocumentSymbol | vscode.SymbolInformation>,
    documentUri: vscode.Uri,
  ): AtlasRelationCandidate[] {
    const candidates: AtlasRelationCandidate[] = [];

    for (const symbol of symbols) {
      if (this.isDocumentSymbol(symbol)) {
        if (RELATION_SYMBOL_KINDS.has(symbol.kind)) {
          candidates.push({
            name: symbol.name,
            kind: symbol.kind,
            position: symbol.selectionRange.start,
            definitionRange: symbol.selectionRange,
          });
        }

        candidates.push(
          ...this.collectRelationCandidates(symbol.children, documentUri),
        );
        continue;
      }

      if (
        symbol.location.uri.toString() === documentUri.toString() &&
        RELATION_SYMBOL_KINDS.has(symbol.kind)
      ) {
        candidates.push({
          name: symbol.name,
          kind: symbol.kind,
          position: symbol.location.range.start,
          definitionRange: symbol.location.range,
        });
      }
    }

    return candidates;
  }

  private uniqueLocations(locations: vscode.Location[]): vscode.Location[] {
    const seen = new Set<string>();

    return locations.filter((location) => {
      const key = [
        location.uri.toString(),
        location.range.start.line,
        location.range.start.character,
        location.range.end.line,
        location.range.end.character,
      ].join(":");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private isDocumentSymbol(
    symbol: vscode.DocumentSymbol | vscode.SymbolInformation,
  ): symbol is vscode.DocumentSymbol {
    return "children" in symbol && "range" in symbol;
  }

  private countSymbols(symbols: AtlasCodeSymbol[]): number {
    return symbols.reduce(
      (total, symbol) => total + 1 + this.countSymbols(symbol.children),
      0,
    );
  }

  private appendSymbolSummary(
    lines: string[],
    symbol: AtlasCodeSymbol,
    depth: number,
  ): void {
    const indentation = "  ".repeat(depth);
    const lineRange =
      symbol.startLine === symbol.endLine
        ? `linha ${symbol.startLine}`
        : `linhas ${symbol.startLine}-${symbol.endLine}`;
    const details = [
      symbol.detail,
      symbol.containerName ? `contido em ${symbol.containerName}` : undefined,
    ].filter(Boolean);
    const suffix = details.length ? ` — ${details.join("; ")}` : "";

    lines.push(
      `${indentation}- ${symbol.kind}: ${symbol.name} (${lineRange})${suffix}`,
    );

    for (const child of symbol.children) {
      this.appendSymbolSummary(lines, child, depth + 1);
    }
  }

  private getDiagnosticSeverityKey(
    severity: vscode.DiagnosticSeverity,
  ): "errors" | "warnings" | "information" | "hints" {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return "errors";
      case vscode.DiagnosticSeverity.Warning:
        return "warnings";
      case vscode.DiagnosticSeverity.Information:
        return "information";
      case vscode.DiagnosticSeverity.Hint:
      default:
        return "hints";
    }
  }

  private getDiagnosticSeverityLabel(
    severity: vscode.DiagnosticSeverity,
  ): string {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return "Erro";
      case vscode.DiagnosticSeverity.Warning:
        return "Aviso";
      case vscode.DiagnosticSeverity.Information:
        return "Informação";
      case vscode.DiagnosticSeverity.Hint:
      default:
        return "Sugestão";
    }
  }

  private getDiagnosticCode(diagnostic: vscode.Diagnostic): string {
    if (
      typeof diagnostic.code === "string" ||
      typeof diagnostic.code === "number"
    ) {
      return String(diagnostic.code);
    }

    return diagnostic.code?.value !== undefined
      ? String(diagnostic.code.value)
      : "";
  }

  private getSymbolKindLabel(kind: vscode.SymbolKind): string {
    const labels: Record<vscode.SymbolKind, string> = {
      [vscode.SymbolKind.File]: "Arquivo",
      [vscode.SymbolKind.Module]: "Módulo",
      [vscode.SymbolKind.Namespace]: "Namespace",
      [vscode.SymbolKind.Package]: "Pacote",
      [vscode.SymbolKind.Class]: "Classe",
      [vscode.SymbolKind.Method]: "Método",
      [vscode.SymbolKind.Property]: "Propriedade",
      [vscode.SymbolKind.Field]: "Campo",
      [vscode.SymbolKind.Constructor]: "Construtor",
      [vscode.SymbolKind.Enum]: "Enum",
      [vscode.SymbolKind.Interface]: "Interface",
      [vscode.SymbolKind.Function]: "Função",
      [vscode.SymbolKind.Variable]: "Variável",
      [vscode.SymbolKind.Constant]: "Constante",
      [vscode.SymbolKind.String]: "String",
      [vscode.SymbolKind.Number]: "Número",
      [vscode.SymbolKind.Boolean]: "Booleano",
      [vscode.SymbolKind.Array]: "Array",
      [vscode.SymbolKind.Object]: "Objeto",
      [vscode.SymbolKind.Key]: "Chave",
      [vscode.SymbolKind.Null]: "Nulo",
      [vscode.SymbolKind.EnumMember]: "Membro de enum",
      [vscode.SymbolKind.Struct]: "Struct",
      [vscode.SymbolKind.Event]: "Evento",
      [vscode.SymbolKind.Operator]: "Operador",
      [vscode.SymbolKind.TypeParameter]: "Parâmetro de tipo",
    };

    return labels[kind] ?? "Símbolo";
  }
}
