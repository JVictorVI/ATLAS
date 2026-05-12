import * as path from "path";
import * as vscode from "vscode";
import { AtlasEditorContext } from "../interfaces/AtlasEditorTypes";

export class AtlasEditorContextService {
  public getFullDocumentContext(): AtlasEditorContext | null {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      return null;
    }

    const document = editor.document;
    const code = document.getText();

    if (!code.trim()) {
      return null;
    }

    return {
      document,
      code,
      fileName: path.basename(document.fileName),
      languageId: document.languageId,
      lineCount: document.lineCount,
      source: "document",
    };
  }

  public getChatEditorContext(): AtlasEditorContext | null {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      return null;
    }

    const document = editor.document;
    const selection = editor.selection;
    const selectedText = selection.isEmpty ? "" : document.getText(selection);
    const hasSelection = selectedText.trim().length > 0;

    if (hasSelection) {
      return {
        document,
        code: selectedText.trim(),
        fileName: path.basename(document.fileName),
        languageId: document.languageId,
        lineCount: document.lineCount,
        source: "selection",
        selection: {
          startLine: selection.start.line + 1,
          endLine: selection.end.line + 1,
        },
      };
    }

    const fullCode = document.getText();

    if (!fullCode.trim()) {
      return null;
    }

    return {
      document,
      code: fullCode,
      fileName: path.basename(document.fileName),
      languageId: document.languageId,
      lineCount: document.lineCount,
      source: "document",
    };
  }

  public buildEditorAnalysisContext(editorContext: AtlasEditorContext): string {
    if (editorContext.source === "selection" && editorContext.selection) {
      return [
        `Arquivo aberto no editor: ${editorContext.fileName}`,
        `Linguagem: ${editorContext.languageId}`,
        `Contexto principal: trecho selecionado`,
        `Linhas selecionadas: ${editorContext.selection.startLine} até ${editorContext.selection.endLine}`,
        "",
        "Trate este conteúdo como um trecho isolado para análise técnica focal, sem assumir visão completa do sistema.",
        "Considere prioritariamente o trecho selecionado abaixo como base da resposta:",
        "```",
        editorContext.code,
        "```",
      ].join("\n");
    }

    return [
      `Arquivo aberto no editor: ${editorContext.fileName}`,
      `Linguagem: ${editorContext.languageId}`,
      `Contexto principal: arquivo completo`,
      `Total de linhas: ${editorContext.lineCount}`,
      "",
      "Considere o código abaixo como base principal da análise:",
      "```",
      editorContext.code,
      "```",
    ].join("\n");
  }
}
