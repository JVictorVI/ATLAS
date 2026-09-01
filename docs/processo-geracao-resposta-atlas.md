# Processo de Geração de Resposta

Atualizado em 30 de agosto de 2026.

Este documento descreve o fluxo completo de uma pergunta enviada pelo chat até a resposta final exibida e persistida.

## Componentes

```text
Webview Chat
  -> ChatMessageRouter
     -> ChatResponseController
        -> AtlasEditorContextService
        -> AtlasRagService
        -> AtlasPromptAssemblyService
        -> AtlasCodeEditController
           -> AtlasCodeEditService
        -> AtlasInferenceService
           -> CloudApiService ou LocalApiService
        -> AtlasSessionService
```

## Entrada da pergunta

1. A Webview envia `enviarPergunta`.
2. `ChatMessageRouter.handle` encaminha para `ChatResponseController.handleSendQuestion`.
3. A mensagem inclui `sessionId` e `generationId` quando veio da Webview de chat.
4. Se já houver resposta ativa para a mesma sessão, ela é abortada antes da nova execução.
5. Um novo `AbortController` é criado para a geração atual.
6. O controller guarda um snapshot em `activeResponses`, indexado por sessão, com:

```text
sessionId
userContent
partialContent
isStreaming
generationId
usesLocalEngine
forcedMode
```

Esse snapshot permite cancelar a geração correta por `sessionId` ou `generationId`, preservar estado parcial quando a UI troca de sessão e salvar uma resposta interrompida quando o usuário cancela uma geração com conteúdo parcial já recebido.

`ChatMessageRouter.serializeActiveGenerations` também combina respostas textuais, análise rápida e edição aplicada em andamento. A Webview usa essa lista para mostrar loading por sessão, renderizar resposta parcial ao voltar para uma sessão e ignorar chunks atrasados de uma geração cancelada.

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

Essa resolução usa `custom.contextProfiles.local` ou
`custom.contextProfiles.cloud`, de acordo com o modo de execução ativo.

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
- `quick-analysis`.

## Desvio para edição aplicada

O fluxo completo, incluindo guardas, classificação opcional pelo modelo, contrato JSON, prévia, confirmação e persistência, está em [Processo de refatoração e edição aplicada](processo-refatoracao-edicao-aplicada-atlas.md).

Antes da geração textual comum, `ChatResponseController` pode desviar pedidos operacionais claros para edição aplicada quando:

- não há modo forçado;
- existe contexto válido do editor;
- `custom.refactoring.enabled !== false`;
- o texto do usuário pede ação direta, como ajustar, criar, corrigir, alterar, implementar, renomear, extrair ou refatorar.

A detecção padrão aceita formas imperativas e informais em português, incluindo frases como `coloque`, `deixe`, `vamos implementar`, `comece a implementação` e `aplique as mudanças`. A normalização também tolera acentos ausentes e pequenas duplicações acidentais de letras, como `applicar` ou `colloque`.

Quando `custom.refactoring.useModelIntentDetection === true`, o `AtlasCodeEditController` chama o modelo ativo antes da resposta normal para gerar uma decisão JSON interna:

```json
{
  "shouldApplyCodeEdit": true,
  "confidence": "medium",
  "reason": "pedido retoma sugestões de alteração no código"
}
```

Se a decisão indicar edição com confiança `medium` ou `high`, o fluxo aplica a prévia/diff. Se a confiança for `low`, se a decisão for negativa ou se houver pedido explícito de não edição, a mensagem continua como resposta textual. Se a classificação por modelo falhar, o ATLAS volta para a heurística padrão.

Frases explicitamente analíticas ou de não edição mantêm a resposta no chat, por exemplo `tem como...`, `como faço...`, `quais seriam...`, `só explique...` e `sem editar...`.

Nesse caso:

1. `AtlasCodeEditController` coleta o contexto do editor;
2. `AtlasCodeEditService` solicita ao modelo um plano JSON de edições por linhas;
3. os ranges são validados contra o documento atual;
4. a prévia das mudanças é exibida em um diff do VS Code;
5. a confirmação é feita por notificação nativa do VS Code;
6. as mudanças são aplicadas via `vscode.WorkspaceEdit` somente após confirmação;
7. em edição direta do `developer-assistant`, o fluxo encerra sem gerar resposta de bot;
8. em refatoração guiada por análise arquitetural, o chat recebe a mensagem `Refatoração aplicada` com resumo, justificativa e validação sugerida.

Se a intenção for analítica, ampla ou ambígua, o fluxo permanece como resposta textual normal.

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

Em refatorações aplicadas, a estrutura estática só é enviada ao modelo quando `custom.staticAnalysis.useInRefactoring === true`.

## Ação de refatoração arquitetural

Quando a resposta final tem modo `architectural-analysis` e `custom.refactoring.enabled !== false`, o controller persiste metadados de refatoração junto da mensagem do assistente:

```text
mode=architectural-analysis
generationId
sessionId
refactorable=true
refactorContext(documentUri, fileName, languageId, contentHash)
```

A Webview usa esses metadados para renderizar o botão `Refatorar com base nesta análise`.

Quando o usuário aciona o botão:

1. `ChatMessageRouter` localiza a mensagem arquitetural no histórico pelo `generationId`;
2. o arquivo aberto é comparado ao `documentUri` e ao `contentHash` da análise;
3. se o arquivo mudou, a refatoração é bloqueada e o usuário deve refazer a análise;
4. se o RAG estiver habilitado para edições aplicadas, o contexto recuperado é incluído como apoio;
5. se o arquivo ainda corresponde, `AtlasCodeEditController` abre uma prévia/diff e solicita confirmação por notificação do VS Code;
6. após confirmação, a edição guiada pela análise anterior é aplicada.

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
cancelarGeracao(sessionId, generationId) -> handleCancelGeneration(target) -> abort()
```

Em caso de abort:

- a Webview recebe `geracaoCancelada` com `sessionId` e `generationId` quando disponíveis;
- se `custom.saveInterruptedResponses !== false`, uma resposta parcial em streaming é salva como mensagem do assistente com `metadata.interrupted = true`;
- se essa opção estiver desativada, ou se ainda não houver conteúdo parcial, nada é persistido como resposta final;
- quick analysis também respeita o sinal quando chamada pelo chat.

O default atual é:

```text
custom.saveInterruptedResponses = true
```

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
| `edicaoCodigoStatus` | Início ou fim da aplicação de uma edição. |
| `edicaoCodigoCancelada` | Prévia de edição não confirmada pelo usuário. |
| `edicaoCodigoConcluida` | Edição direta concluída sem resposta textual redundante no chat. |
| `erro` | Falha real na geração. |
| `sessoesAtualizadas` | Sessão recebeu mensagem ou mudou estado. |

## Relações com outros processos

- Modos e prompt: [Processo de prompts e modos](processo-prompts-modos-atlas.md).
- Refatoração: [Processo de refatoração e edição aplicada](processo-refatoracao-edicao-aplicada-atlas.md).
- Engine local: [Processo da engine local](processo-engine-local-atlas.md).
- Cloud: [Processo de integração cloud](processo-integracao-cloud-atlas.md).
- Sessões: [Processo de sessões, histórico e resumo](processo-sessoes-historico-resumo-atlas.md).
- RAG e contexto: [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).
