import * as path from "path";
import * as vscode from "vscode";
import JSZip = require("jszip");

const pdfParse = require("pdf-parse/lib/pdf-parse") as typeof import("pdf-parse");

export interface AtlasParsedExternalDocument {
  displayName: string;
  fileType: string;
  language: string;
  content: string;
}

export class AtlasExternalDocumentParser {
  private static readonly textExtensions = new Set([
    ".txt",
    ".md",
    ".markdown",
    ".rst",
    ".adoc",
    ".csv",
    ".tsv",
    ".json",
    ".jsonc",
    ".yaml",
    ".yml",
    ".xml",
    ".html",
    ".htm",
    ".log",
  ]);

  private static readonly officeExtensions = new Set([
    ".docx",
    ".pptx",
    ".xlsx",
  ]);

  public static readonly supportedExtensions = new Set([
    ".pdf",
    ...AtlasExternalDocumentParser.officeExtensions,
    ...AtlasExternalDocumentParser.textExtensions,
  ]);

  public static getSupportedExtensions(): string[] {
    return Array.from(AtlasExternalDocumentParser.supportedExtensions).sort();
  }

  public canParse(uri: vscode.Uri): boolean {
    return AtlasExternalDocumentParser.supportedExtensions.has(
      path.extname(uri.fsPath).toLowerCase(),
    );
  }

  public async parse(
    uri: vscode.Uri,
    bytes: Uint8Array,
  ): Promise<AtlasParsedExternalDocument> {
    const extension = path.extname(uri.fsPath).toLowerCase();
    const displayName = path.basename(uri.fsPath);
    const buffer = Buffer.from(bytes);
    let content = "";

    if (extension === ".pdf") {
      content = await this.extractPdfText(buffer);
    } else if (extension === ".docx") {
      content = await this.extractDocxText(buffer);
    } else if (extension === ".pptx") {
      content = await this.extractPptxText(buffer);
    } else if (extension === ".xlsx") {
      content = await this.extractXlsxText(buffer);
    } else if (AtlasExternalDocumentParser.textExtensions.has(extension)) {
      content = this.extractPlainText(buffer, extension);
    } else {
      throw new Error(`Tipo de arquivo nao suportado: ${extension || "sem extensao"}.`);
    }

    const normalized = this.normalizeContent(content);

    if (!normalized) {
      throw new Error("Nenhum texto extraivel foi encontrado no arquivo.");
    }

    return {
      displayName,
      fileType: this.getFileType(extension),
      language: this.getLanguage(extension),
      content: normalized,
    };
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    const parsed = await pdfParse(buffer);
    return parsed.text ?? "";
  }

  private async extractDocxText(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.keys(zip.files)
      .filter((entry) =>
        /^word\/(document|footnotes|endnotes|comments|header\d+|footer\d+)\.xml$/i.test(
          entry,
        ),
      )
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const parts: string[] = [];

    for (const entry of entries) {
      const file = zip.file(entry);

      if (!file) {
        continue;
      }

      const xml = await file.async("string");
      const text = this.extractWordText(xml);

      if (text) {
        parts.push(text);
      }
    }

    return parts.join("\n\n");
  }

  private async extractPptxText(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const slides = Object.keys(zip.files)
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const parts: string[] = [];

    for (let index = 0; index < slides.length; index += 1) {
      const file = zip.file(slides[index]);

      if (!file) {
        continue;
      }

      const xml = await file.async("string");
      const text = this.extractXmlTextNodes(xml).join("\n").trim();

      if (text) {
        parts.push(`Slide ${index + 1}\n${text}`);
      }
    }

    return parts.join("\n\n");
  }

  private async extractXlsxText(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const sharedStrings = await this.extractSharedStrings(zip);
    const sheets = Object.keys(zip.files)
      .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const parts: string[] = [];

    for (let index = 0; index < sheets.length; index += 1) {
      const file = zip.file(sheets[index]);

      if (!file) {
        continue;
      }

      const xml = await file.async("string");
      const text = this.extractSheetText(xml, sharedStrings);

      if (text) {
        parts.push(`Planilha ${index + 1}\n${text}`);
      }
    }

    return parts.join("\n\n");
  }

  private extractPlainText(buffer: Buffer, extension: string): string {
    const raw = this.decodeBuffer(buffer);

    if (extension === ".html" || extension === ".htm") {
      return this.extractHtmlText(raw);
    }

    if (extension === ".json") {
      try {
        return JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        return raw;
      }
    }

    return raw;
  }

  private extractWordText(xml: string): string {
    return xml
      .split(/<\/w:p>/gi)
      .map((paragraph) => this.extractXmlTextNodes(paragraph).join("").trim())
      .filter(Boolean)
      .join("\n");
  }

  private async extractSharedStrings(zip: JSZip): Promise<string[]> {
    const file = zip.file("xl/sharedStrings.xml");

    if (!file) {
      return [];
    }

    const xml = await file.async("string");

    return Array.from(xml.matchAll(/<si\b[\s\S]*?<\/si>/gi)).map((match) =>
      this.extractXmlTextNodes(match[0]).join(""),
    );
  }

  private extractSheetText(xml: string, sharedStrings: string[]): string {
    const rows = Array.from(xml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/gi));

    return rows
      .map((rowMatch) => {
        const cells = Array.from(
          rowMatch[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi),
        )
          .map((cellMatch) =>
            this.extractCellValue(cellMatch[1], cellMatch[2], sharedStrings),
          )
          .filter(Boolean);

        return cells.join("\t").trim();
      })
      .filter(Boolean)
      .join("\n");
  }

  private extractCellValue(
    attributes: string,
    body: string,
    sharedStrings: string[],
  ): string {
    const type = this.getXmlAttribute(attributes, "t");

    if (type === "s") {
      const index = Number.parseInt(this.extractXmlNodeValue(body, "v"), 10);
      return Number.isInteger(index) ? sharedStrings[index] ?? "" : "";
    }

    if (type === "inlineStr") {
      return this.extractXmlTextNodes(body).join("");
    }

    return this.extractXmlNodeValue(body, "v");
  }

  private extractXmlTextNodes(xml: string): string[] {
    return Array.from(
      xml.matchAll(/<(?:[\w-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?t>/gi),
    ).map((match) => this.decodeXmlEntities(match[1]));
  }

  private extractXmlNodeValue(xml: string, localName: string): string {
    const escapedName = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(
      `<(?:[\\w-]+:)?${escapedName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${escapedName}>`,
      "i",
    ).exec(xml);

    return match ? this.decodeXmlEntities(match[1]).trim() : "";
  }

  private extractHtmlText(raw: string): string {
    return this.decodeXmlEntities(
      raw
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    );
  }

  private getXmlAttribute(attributes: string, name: string): string {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`${escapedName}="([^"]*)"`, "i").exec(attributes);
    return match ? this.decodeXmlEntities(match[1]) : "";
  }

  private decodeBuffer(buffer: Buffer): string {
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.subarray(2).toString("utf16le");
    }

    if (this.looksLikeUtf16Le(buffer)) {
      return buffer.toString("utf16le");
    }

    return buffer.toString("utf8").replace(/^\uFEFF/, "");
  }

  private looksLikeUtf16Le(buffer: Buffer): boolean {
    if (buffer.length < 12) {
      return false;
    }

    let zeroCount = 0;
    const inspected = Math.min(buffer.length, 200);

    for (let index = 1; index < inspected; index += 2) {
      if (buffer[index] === 0) {
        zeroCount += 1;
      }
    }

    return zeroCount / Math.floor(inspected / 2) > 0.6;
  }

  private decodeXmlEntities(value: string): string {
    return value
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&#(\d+);/g, (_, code: string) =>
        String.fromCodePoint(Number.parseInt(code, 10)),
      )
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
        String.fromCodePoint(Number.parseInt(code, 16)),
      );
  }

  private normalizeContent(content: string): string {
    return content
      .replace(/\u0000/g, "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private getFileType(extension: string): string {
    const labels: Record<string, string> = {
      ".pdf": "PDF",
      ".docx": "DOCX",
      ".pptx": "PPTX",
      ".xlsx": "XLSX",
      ".md": "Markdown",
      ".markdown": "Markdown",
      ".csv": "CSV",
      ".tsv": "TSV",
      ".json": "JSON",
      ".jsonc": "JSONC",
      ".yaml": "YAML",
      ".yml": "YAML",
      ".html": "HTML",
      ".htm": "HTML",
      ".xml": "XML",
      ".txt": "Texto",
      ".rst": "reStructuredText",
      ".adoc": "AsciiDoc",
      ".log": "Log",
    };

    return labels[extension] ?? extension.replace(/^\./, "").toUpperCase();
  }

  private getLanguage(extension: string): string {
    const languages: Record<string, string> = {
      ".pdf": "pdf",
      ".docx": "docx",
      ".pptx": "pptx",
      ".xlsx": "xlsx",
      ".md": "markdown",
      ".markdown": "markdown",
      ".csv": "csv",
      ".tsv": "tsv",
      ".json": "json",
      ".jsonc": "jsonc",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".html": "html",
      ".htm": "html",
      ".xml": "xml",
      ".txt": "text",
      ".rst": "rst",
      ".adoc": "asciidoc",
      ".log": "log",
    };

    return languages[extension] ?? "document";
  }
}
