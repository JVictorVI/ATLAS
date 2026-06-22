export type AtlasStructureExtractionLevel = "symbols" | "text";

export type AtlasCodeSymbol = {
  name: string;
  kind: string;
  detail?: string;
  containerName?: string;
  startLine: number;
  endLine: number;
  children: AtlasCodeSymbol[];
};

export type AtlasDocumentStructure = {
  languageId: string;
  fileName: string;
  lineCount: number;
  extractionLevel: AtlasStructureExtractionLevel;
  symbols: AtlasCodeSymbol[];
  totalSymbols: number;
  limitations: string[];
};
