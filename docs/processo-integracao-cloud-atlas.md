# Processo de Integração Cloud

Atualizado em 24 de julho de 2026.

Este documento descreve como o ATLAS usa provedores cloud, chaves de API, listagem de modelos, streaming, timeouts e normalização de respostas.

## Componentes

```text
AtlasInferenceService
  -> CloudApiService
     -> AtlasConfigManager
     -> ApiKeyManager
        -> SecretStorageService
```

## Seleção cloud

Para uma chamada cloud ser válida:

```text
llms.selection.mode = "cloud"
llms.selection.cloud.providerId != null
llms.selection.cloud.activeModelId != null
```

`AtlasSelectionService.getResolvedCloudSelection` valida e retorna:

```text
provider
modelId
```

## Providers

Configuração:

```text
providers[]
```

Campos:

```text
id
label
baseUrl
apiKeyPlaceholder
kind
```

`kind` pode ser:

```text
openai-compatible
claude
gemini
```

Se `kind` estiver ausente, `CloudApiService` infere pelo id:

- id contendo `claude` ou `anthropic` -> Claude;
- id contendo `gemini` ou `google` -> Gemini;
- caso contrário -> OpenAI-compatible.

Providers padrão atuais:

```text
OpenAI
OpenRouter
Groq
Claude
Gemini
xAI
HuggingFace
```

`HuggingFace` fica disponível para token de repositório de modelos, mas `ChatMessageRouter` impede usá-lo como provedor de conversa.

## Chaves de API

As chaves ficam no Secret Storage do VS Code, não no arquivo de configuração.

Chave:

```text
atlas.apiKey.<provider>
```

Metadados:

```text
atlas.apiKeyMetadata.<provider>
```

`ApiKeyManager` permite:

- adicionar chave;
- listar chaves mascaradas;
- editar provider/baseUrl/chave;
- excluir provider e chave.

Ao excluir uma chave, o provider também é removido da configuração.

## Envio da mensagem

`CloudApiService.sendChat`:

1. valida se o modo atual é cloud;
2. resolve provider e modelId;
3. busca chave no Secret Storage;
4. resolve `maxTokens`;
5. seleciona a implementação pelo tipo de provider.

## Defaults usados

Vêm de:

```text
cloudConfigs
```

Campos:

```text
temperature
maxTokens
topP
stream
```

`limitPayload` controla o envio do limite de saída configurado em `maxTokens`.
Quando está desativado, o ATLAS deixa de enviar esse limite para provedores que
o aceitam como parâmetro opcional. Claude é a exceção: a API exige
`max_tokens`, portanto o ATLAS mantém um valor válido para a chamada.

`sendOnlyRequiredParameters` é o modo de compatibilidade. Quando está ativo,
o ATLAS não envia temperatura, top-p, limite opcional de tokens nem streaming;
mantém apenas os campos obrigatórios de cada API e entrega a resposta em bloco
quando necessário.

Default efetivo de timeout quando ausente:

```text
30 segundos
```

## Max tokens dinâmico

Se:

```text
cloudConfigs.dynamicMaxTokens === true
```

o ATLAS tenta listar modelos do provider e encontrar o modelo selecionado.

Se o modelo retornar limite de saída:

- OpenAI-compatible: `max_completion_tokens`;
- Gemini: `outputTokenLimit`;
- Claude: atualmente usa fallback ou dados disponíveis da listagem.

O valor é cacheado por:

```text
provider.id::modelId
```

Se a consulta falhar ou não houver limite, usa `cloudConfigs.maxTokens`.

## OpenAI-compatible

Endpoint:

```text
<baseUrl>/chat/completions
```

Headers:

```text
Authorization: Bearer <apiKey>
Content-Type: application/json
```

Payload:

```json
{
  "model": "<modelId>",
  "messages": [],
  "temperature": 0.4,
  "max_tokens": 8192,
  "top_p": 0.95,
  "stream": true
}
```

Streaming usa SSE:

- lê linhas `data:`;
- ignora fragmentos incompletos;
- encerra em `[DONE]`;
- acumula conteúdo total;
- chama `onChunk` para cada delta.

Sem streaming, normaliza `choices[0].message.content`.

## Claude

Endpoint:

```text
<baseUrl>/messages
```

Headers:

```text
x-api-key: <apiKey>
anthropic-version: 2023-06-01
Content-Type: application/json
```

Transformação:

- mensagens `system` são juntadas em `system`;
- mensagens não-system viram `messages`;
- usa `max_tokens` e `temperature`.

Claude atualmente não tem streaming real no fluxo: se `onChunk` existir, o ATLAS envia a resposta normalizada inteira como fallback.

## Gemini

Endpoint:

```text
<baseUrl>/models/<modelId>:generateContent?key=<apiKey>
```

Transformação:

- mensagens `system` viram `systemInstruction`;
- `assistant` vira papel `model`;
- demais mensagens viram `user`;
- conteúdo vai em `parts: [{ text }]`;
- usa `generationConfig.temperature`, `topP` e `maxOutputTokens`.

Gemini também usa fallback não-streaming: quando `onChunk` existe, envia o conteúdo completo como chunk único.

## Listagem de modelos

`getModelsForCurrentProvider`:

1. resolve provider selecionado;
2. busca chave;
3. chama listagem específica.

### OpenAI-compatible

Endpoint:

```text
<baseUrl>/models
```

Retorna `data[]` e mapeia:

```text
id
label
context_window
max_completion_tokens
```

### Claude

Endpoint paginado:

```text
<baseUrl>/models?limit=100&after_id=<id>
```

Se não houver modelos, usa fallback com modelos Claude conhecidos.

### Gemini

Endpoint paginado:

```text
<baseUrl>/models?key=<apiKey>&pageSize=100&pageToken=<token>
```

Filtra modelos que suportam:

```text
generateContent
```

Se não houver modelos generativos, usa fallback Gemini.

## Tratamento de erro

`handleApiError` diferencia:

| HTTP | Mensagem |
| --- | --- |
| 401/403 | Falha de autenticação. |
| 429 | Limite de requisições excedido. |
| >= 500 | Indisponibilidade no provedor. |
| outros | Falha na requisição. |

Timeout ou abort interno geram mensagem de timeout. Abort do usuário preserva nome `AbortError`.

## Normalização da resposta

Todas as integrações retornam `AtlasCloudChatResponse`:

```text
providerId
providerLabel
providerKind
modelId
content
finishReason
usage
createdAt
raw
```

OpenAI-compatible preenche usage quando o provider retorna:

```text
prompt_tokens
completion_tokens
total_tokens
```

## RAG no modo cloud

Antes da chamada cloud, `ChatResponseController` só injeta RAG se:

```text
rag.offlineOnly === false
rag.allowCloudContext === true
contextProfile.includeRagContext === true
```

Caso contrário, o contexto RAG é bloqueado para evitar envio de código local a provedores externos.

## Relações com outros processos

- Geração: [Processo de geração de resposta](processo-geracao-resposta-atlas.md).
- Configuração: [Processo de configuração](processo-configuracao-atlas.md).
- RAG/contexto: [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).
