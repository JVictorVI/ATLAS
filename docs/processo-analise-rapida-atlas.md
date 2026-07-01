# Processo de Análise Rápida

Atualizado em 1 de julho de 2026.

Este documento descreve como o ATLAS executa a análise rápida do arquivo atual e aplica marcações no editor.

## Componentes

```text
ChatMessageRouter
  -> AtlasQuickAnalysisController
     -> AtlasEditorContextService
     -> AtlasQuickAnalysisService
        -> AtlasDocumentStructureService
        -> AtlasPromptAssemblyService
        -> AtlasInferenceService
```

## Formas de disparo

A análise rápida pode ser disparada por:

- botão da interface;
- intenção textual no chat;
- modo forçado `quick-analysis`.

Quando vem do chat, `ChatResponseController` detecta o modo `quick-analysis`, persiste a mensagem do usuário e delega para `executeQuickAnalysis`.

## Pré-condições

`AtlasQuickAnalysisController.execute` exige:

- documento textual válido aberto;
- editor ativo correspondente ao documento;
- contexto completo do documento disponível.

Se não houver arquivo válido, a Webview recebe `erro` e o VS Code mostra warning.

## Controle de execução

O controller mantém:

```text
activeController
activeAnalysis
issuesByDocument
```

Se a execução veio por botão, um novo `AbortController` é criado e a análise anterior é abortada. Se veio do chat, o sinal de cancelamento da geração é reutilizado.

Durante a execução, a Webview recebe:

```text
analiseRapidaStatus loading=true
analiseRapidaStatus loading=false
```

## Coleta de código

O controller chama:

```text
editorContextService.getFullDocumentContext()
```

Esse fluxo usa o arquivo completo, não apenas o trecho limitado pelo perfil de contexto.

## Estrutura estática opcional

`AtlasQuickAnalysisService.buildOptionalStructureSummary` consulta:

```text
configManager.isStaticAnalysisEnabledFor("quick-analysis")
```

Se desativada, a análise recebe a mensagem de que a coleta estática está desligada.

Se ativada:

1. `AtlasDocumentStructureService.collect(document)` coleta símbolos;
2. `buildSummary` gera resumo de estrutura;
3. se configurado, inclui diagnósticos;
4. se configurado, inclui relações entre símbolos.

O resumo é logado com prefixo:

```text
[ATLAS] Análise estática gerada (análise rápida)
```

## Prompt da análise rápida

O serviço força o modo:

```text
forcedMode: "quick-analysis"
```

O código é numerado antes de ir para o modelo:

```text
<linha> | <conteúdo>
```

O prompt pede:

- varredura completa do arquivo;
- cobertura de início, meio e fim;
- avaliação de classes pequenas quando representarem fronteiras;
- uso dos números prefixados para `startLine` e `endLine`;
- resposta exclusivamente em JSON válido.

## Formato esperado

O modelo deve retornar array JSON:

```json
[
  {
    "startLine": 12,
    "endLine": 28,
    "severity": "medium",
    "category": "responsibility",
    "message": "...",
    "impact": "...",
    "suggestion": "..."
  }
]
```

## Categorias

Categorias aceitas:

```text
coupling
cohesion
responsibility
abstraction
dependency
layering
solid
grasp
maintainability
```

O parser aceita aliases em português e inglês, por exemplo:

- `acoplamento` -> `coupling`;
- `responsabilidade` -> `responsibility`;
- `dependencia` -> `dependency`;
- `manutencao` -> `maintainability`.

## Severidade

Severidades aceitas:

```text
low
medium
high
```

Aliases aceitos:

- baixo/azul/info -> `low`;
- médio/amarelo/warning -> `medium`;
- alto/vermelho/error/critical -> `high`.

## Parsing da resposta

`parseIssues`:

1. tenta localizar um array JSON mesmo se houver texto antes/depois;
2. faz `JSON.parse`;
3. normaliza severidade e categoria;
4. aceita aliases para `impact` e `suggestion`;
5. descarta itens inválidos.

Erros de parsing viram erro de análise rápida.

## Sanitização

Depois do parser, o controller chama `sanitizeIssues`:

- limita `startLine` entre 1 e o total de linhas;
- garante `endLine >= startLine`;
- limita `endLine` ao total de linhas;
- trim em `message`, `impact` e `suggestion`;
- remove achados sem mensagem.

## Decorações no editor

As decorações são separadas por severidade:

| Severidade | Cor |
| --- | --- |
| `low` | Azul |
| `medium` | Amarelo |
| `high` | Vermelho |

Cada decoração cobre o range de linhas do achado.

## Hover

O hover mostra:

- severidade;
- categoria;
- linha ou intervalo;
- o que foi observado;
- por que isso é um problema;
- como melhorar;
- nota de validação humana.

## Persistência visual

As marcações são mantidas em memória por documento:

```text
issuesByDocument[document.uri]
```

Quando o editor ativo muda, `restoreDecorations` reaplica marcações do documento.

Quando o documento muda, as marcações daquele documento são removidas para evitar linhas desatualizadas.

Quando o documento fecha, as marcações são removidas da memória.

## Resultado na Webview

Se não houver achados:

```text
analiseRapidaConcluida total=0 issues=[]
```

Se houver achados:

```text
analiseRapidaConcluida total=<n> issues=<lista>
```

O VS Code também exibe uma notificação com o total de problemas destacados.

## Cancelamento

Se a geração ou análise for abortada:

```text
geracaoCancelada
```

Nenhuma marcação nova é aplicada.

## Relações com outros processos

- Prompt e modo: [Processo de prompts e modos](processo-prompts-modos-atlas.md).
- Geração: [Processo de geração de resposta](processo-geracao-resposta-atlas.md).
- Configuração: [Processo de configuração](processo-configuracao-atlas.md).
