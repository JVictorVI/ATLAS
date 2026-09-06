import { stripVTControlCharacters } from "node:util";

export class AtlasRuntimeDiagnostics {
  private output = "";

  public append(chunk: unknown): void {
    const text = stripVTControlCharacters(String(chunk));
    this.output = (this.output + text).slice(-8192);
  }

  public failure(summary: string, detail = this.output): Error {
    const message = stripVTControlCharacters(detail).trim();
    const importantLines = [
      ...new Set(
        message
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(
            (line) =>
              !/^(?:at |node:internal|Node\.js v)/.test(line) &&
              /\b(?:error|fatal|panic|failed|failure|not found|cannot|unable|bad option|permission denied|out of memory|ENOENT|EACCES|EADDRINUSE|ECONNREFUSED)\b/i.test(
                line,
              ),
          ),
      ),
    ]
      .slice(-3)
      .join("\n")
      .slice(0, 1800);
    let hint = "";

    if (/GLIBC_[\d.]+[^\n]*not found/i.test(message)) {
      hint =
        " O VSIX Linux inclui um runtime próprio com GLIBC 2.39. Reinstale o pacote Linux completo; binários personalizados podem exigir um runtime mais recente.";
    } else if (/libgomp\.so[^\n]*(?:not found|cannot open)/i.test(message)) {
      hint =
        " O VSIX Linux inclui libgomp.so.1. Reinstale o pacote Linux completo para restaurar a biblioteca OpenMP.";
    } else if (
      /GLIBCXX_[\d.]+[^\n]*not found|libstdc\+\+\.so[^\n]*(?:not found|cannot open)/i.test(
        message,
      )
    ) {
      hint =
        " O VSIX Linux inclui libstdc++.so.6. Reinstale o pacote Linux completo para restaurar o runtime C++.";
    } else if (
      /lib(?:ssl|crypto)\.so\.3[^\n]*(?:not found|cannot open)/i.test(message)
    ) {
      hint =
        " O VSIX Linux inclui libssl.so.3 e libcrypto.so.3. Reinstale o pacote Linux completo para restaurar o OpenSSL 3.";
    } else if (/EACCES|Permission denied/i.test(message)) {
      hint =
        " Verifique as permissões do arquivo e da pasta de dados; o executável precisa de permissão de execução e o volume não pode estar montado com noexec.";
    }

    return new Error(
      `${summary}${importantLines ? ` Detalhes: ${importantLines}` : ""}${hint ? ` Correção:${hint}` : ""} Consulte Saída > ATLAS (comando ATLAS: Mostrar logs).`,
    );
  }
}
