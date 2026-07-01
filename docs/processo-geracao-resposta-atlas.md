# Processo de Geração de Resposta

Atualizado em 1 de julho de 2026.

Este documento descreve o fluxo completo de uma pergunta enviada pelo chat até a resposta final exibida e persistida.

## Componentes

```text
Webview Chat
  -> ChatMessageRouter
     -> ChatResponseController
        -> AtlasEditorContextService
        -> AtlasRagService
        -> AtlasPromptAssemblyService
        -> AtlasInferenceService
           -> CloudApiService ou LocalApiService
        -> AtlasSessionService
```

## Entrada da pergunta

1. A Webview envia `enviarPergunta`.
2. `ChatMessageRouter.handle` encaminha para `ChatResponseController.handleSendQuestion`.
3. Qualquer geração anterior é abortada por `activeResponseController?.abort()`.
4. Um novo `AbortController` é criado para a geração atual.
5. O controller guarda um snapshot com:

```text
sessionId
userContent
partialContent
isStreaming
generationId
usesLocalEngine
forcedMode
```

Esse snapshot permite cancelar a geração e preservar estado parcial quando a UI troca de sessão.

## Sessão ativa

`ChatResponseController` chama:

```text
sessionService.ensureActiveSession()
```

Se não houver sessão ativa, uma nova sessão chamada `Nova Sessão` é criada. A sessão fornece:

- histórico recente;
- resumo arquitetural acumulado;
- id usado para associar mensagens e eventos da Webview.

## Coleta de contexto

O contexto efetivo vem do perfil atual:

```text
configManager.getContextProfile()
```

O fluxo considera:

- contexto do editor aberto;
- limite de caracteres do editor;
- janela de mensagens recentes;
- resumo arquitetural;
- RAG;
- contexto estrutural do VS Code, quando o modo arquitetural exige.

Quando o modo for forçado como `architectural-analysis`, o arquivo aberto é obrigatório.

## Limite do contexto do editor

Se o conteúdo do editor exceder `maxEditorContextCharacters`, o controller preserva início e fim:

```text
65% do orçamento para o início
35% para o final
marcador central de conteúdo omitido
```

Isso mantém imports/declarações iniciais e regiões finais, sem enviar o arquivo inteiro quando o perfil limita contexto.

## Montagem inicial do prompt

`AtlasPromptAssemblyService.buildMessages` recebe:

```text
userQuestion
history
analysisContext
ragContext inicial vazio
hasCodeContext
forcedMode
architecturalSummary
contextProfile
```

O resultado contém:

```text
mode
messages
```

O modo pode ser:

- `developer-assistant`;
- `architectural-analysis`;
- `quick-analysis`;
- `study-mode`.

## Recuperação RAG

O RAG só é tentado quando:

- o modo não é `quick-analysis`;
- `config.rag.enabled === true`;
- o perfil inclui RAG;
- no modo cloud, `offlineOnly` não bloqueia e `allowCloudContext` permite.

Quando há trechos recuperados:

1. `AtlasRagService.retrieveContext` retorna `context` e `sources`;
2. o prompt é remontado com `ragContext`;
3. as fontes são guardadas em metadados da resposta, se `rag.showSources` estiver ativo.

Se o RAG falhar e a geração não tiver sido abortada, o ATLAS continua sem contexto RAG e registra warning.

## Contexto estrutural arquitetural

Quando o modo resolvido é `architectural-analysis` e a análise estática está habilitada:

1. `buildDocumentStructureContext(document)` coleta estrutura do VS Code;
2. o contexto estrutural é adicionado ao `analysisContext`;
3. o prompt é remontado.

O texto instrui o modelo a usar a estrutura como evidência auxiliar e a não inventar relações.

## Desvio para análise rápida

Se o modo resolvido for `quick-analysis`:

1. a mensagem do usuário é persistida;
2. `executeQuickAnalysis` é chamado com `source="chat"`;
3. o fluxo normal de resposta textual é encerrado.

Nesse caso, não há resposta LLM comum no chat; o resultado principal é o conjunto de marcações no editor.

## Escolha local ou cloud

`AtlasInferenceService.sendChat` decide pelo modo atual:

```text
configManager.isLocalMode()
```

Em modo local:

- remove diretivas globais de customização do usuário;
- chama `LocalApiService`.

Em modo cloud:

- mantém as mensagens completas;
- chama `CloudApiService`.

## Streaming

O streaming é decidido antes da chamada:

- local: `custom.localEngine.stream !== false`;
- cloud: `cloudConfigs.stream`.

Quando há streaming:

1. cada chunk recebido atualiza `partialContent`;
2. a Webview recebe `respostaParcial`;
3. ao fim, a Webview recebe `fimResposta`.

Quando não há streaming:

1. a resposta completa é recebida;
2. a Webview recebe `novaResposta`.

## Persistência da conversa

Após receber resposta:

1. `sessionService.appendMessage` salva a mensagem do usuário;
2. `appendMessage` salva a resposta do assistente;
3. metadados da resposta incluem modo, provedor, modelo, usage, finishReason e fontes RAG;
4. `summarizeIfNeeded` é disparado em background.

A Webview recebe `sessoesAtualizadas` com a lista de sessões.

## Cancelamento

O cancelamento usa o mesmo `AbortController` da geração:

```text
cancelarGeracao -> handleCancelGeneration -> abort()
```

Em caso de abort:

- a Webview recebe `geracaoCancelada`;
- a geração não persiste resposta parcial como mensagem final;
- quick analysis também respeita o sinal quando chamada pelo chat.

## Erros

Erros comuns:

- arquivo obrigatório ausente para análise arquitetural;
- seleção de modelo incompleta;
- engine local indisponível;
- provider cloud sem chave;
- timeout ou erro HTTP;
- resposta vazia.

O controller diferencia abort de erro real usando:

```text
AtlasInferenceService.isAbortError(error)
```

Erros reais são enviados à Webview como `erro` e também exibidos via `vscode.window.showErrorMessage`.

## Eventos principais da Webview

| Evento | Quando ocorre |
| --- | --- |
| `respostaParcial` | Chunk de streaming recebido. |
| `fimResposta` | Streaming finalizado. |
| `novaResposta` | Resposta completa sem streaming. |
| `geracaoCancelada` | Abort solicitado ou propagado. |
| `erro` | Falha real na geração. |
| `sessoesAtualizadas` | Sessão recebeu mensagem ou mudou estado. |

## Relações com outros processos

- Modos e prompt: [Processo de prompts e modos](processo-prompts-modos-atlas.md).
- Engine local: [Processo da engine local](processo-engine-local-atlas.md).
- Cloud: [Processo de integração cloud](processo-integracao-cloud-atlas.md).
- Sessões: [Processo de sessões, histórico e resumo](processo-sessoes-historico-resumo-atlas.md).
- RAG e contexto: [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).
