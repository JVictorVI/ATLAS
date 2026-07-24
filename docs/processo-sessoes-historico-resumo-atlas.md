# Processo de Sessões, Histórico e Resumo Arquitetural

Atualizado em 24 de julho de 2026.

Este documento descreve como o ATLAS cria sessões, persiste histórico, usa janela recente e gera resumo arquitetural para conversas longas.

## Componentes

```text
ChatMessageRouter
  -> ChatSessionController
  -> ChatResponseController
     -> AtlasSessionService
        -> AtlasHistoryRepository
        -> AtlasInferenceService
```

## Arquivo de histórico

O histórico é salvo em:

```text
config/atlas-history.json
```

Formato de alto nível:

```text
version
updatedAt
sessions[]
```

Se o arquivo não existir ou estiver inválido, `AtlasHistoryRepository` recria um store vazio.

## Sessão

Uma sessão contém:

```text
id
title
architecturalSummary
messages
lastSummarizedIndex
createdAt
updatedAt
```

O id é um UUID.

## Ciclo de vida

### Criar

`AtlasSessionService.createSession(title)`:

1. cria UUID;
2. define título ou `Nova Sessão`;
3. inicializa `architecturalSummary` vazio;
4. salva no repositório;
5. torna a sessão ativa.

### Trocar

`switchSession(sessionId)`:

- valida se a sessão existe;
- atualiza `activeSessionId`.

### Excluir

`deleteSession(sessionId)`:

- remove do arquivo;
- se era a ativa, limpa `activeSessionId`.

Quando a exclusão vem da Webview, `ChatSessionController` seleciona automaticamente a primeira sessão restante, se existir, e envia `activeSession` atualizado para a interface.

### Renomear

`renameSession(sessionId, newTitle)`:

- preserva título antigo se o novo vier vazio;
- atualiza `updatedAt`.

## Sessão ativa

`ensureActiveSession`:

- retorna a ativa quando existe;
- cria `Nova Sessão` se não houver ativa;
- cria nova se o id ativo aponta para sessão ausente.

Esse método é usado no início da geração de resposta.

## Persistência de mensagens

`appendMessage(sessionId, message)`:

1. carrega sessão;
2. adiciona mensagem ao array;
3. se o título for `Nova Sessão` e a mensagem for do usuário, gera título automático;
4. atualiza `updatedAt`;
5. salva no repositório.

Mensagens seguem o contrato `ChatMessage`:

```text
role
content
metadata?
```

Respostas do assistente podem carregar metadados como fontes RAG. Respostas interrompidas salvas pelo cancelamento de streaming carregam:

```text
metadata.interrupted = true
```

## Título automático

Na primeira mensagem do usuário:

1. remove blocos de código fenced;
2. normaliza espaços;
3. corta em 42 caracteres;
4. capitaliza a primeira letra.

Se não sobrar texto, mantém `Nova Sessão`.

## Janela recente

`getWindowMessages(session, windowSize)`:

- remove mensagens `system`;
- retorna as últimas `windowSize` mensagens.

O tamanho vem do perfil de contexto:

```text
contextProfile.historyWindowSize
```

Default interno do serviço, quando não informado:

```text
10
```

## Resumo arquitetural

Após uma resposta normal, `ChatResponseController` dispara em background:

```text
sessionService.summarizeIfNeeded(session.id, contextProfile.historyWindowSize)
```

Falhas de resumo são logadas e não quebram a resposta ao usuário.

## Quais mensagens são resumidas

`getMessagesToSummarize`:

1. remove mensagens `system`;
2. calcula o cutoff:

```text
archiveCutoff = max(0, nonSystem.length - windowSize)
```

3. compara com `lastSummarizedIndex`;
4. retorna apenas mensagens ainda não resumidas e fora da janela recente.

Assim, a janela recente continua indo integralmente ao modelo, enquanto mensagens antigas entram pelo resumo.

## Prompt de sumarização

O sistema instrui o modelo a resumir:

- decisões de design;
- trade-offs;
- problemas arquiteturais;
- padrões e princípios;
- conclusões técnicas.

Regras:

- português do Brasil;
- texto corrido;
- sem marcações especiais;
- máximo de 400 palavras;
- suficientemente detalhado para servir como contexto futuro.

Se já houver resumo anterior, ele é enviado junto:

```text
Resumo anterior:
...

Novas mensagens para incluir no resumo:
...
```

## Atualização do resumo

Após a resposta do modelo:

```text
session.architecturalSummary = response.content.trim()
session.lastSummarizedIndex = archiveCutoff
session.updatedAt = now
```

Depois salva a sessão.

## Uso do resumo no prompt

`AtlasPromptAssemblyService` injeta o resumo quando:

- `contextProfile.includeArchitecturalMemory === true`;
- existe `architecturalSummary`;
- o modo não é `quick-analysis`.

O bloco entra como mensagem system:

```text
Memória de longo prazo desta sessão...
```

O prompt orienta o modelo a usar a memória para coerência arquitetural, mas priorizar mensagens recentes.

## Listagem de sessões

`listSessions` retorna resumos:

```text
id
title
createdAt
updatedAt
messageCount
hasArchitecturalSummary
```

`messageCount` ignora mensagens `system`.

## Geração ativa e troca de sessão

`ChatResponseController.serializeActiveGeneration` retorna:

```text
sessionId
userContent
partialContent
isStreaming
generationId
forcedMode
```

Isso permite que `ChatSessionController` preserve contexto visual quando há geração em andamento e o usuário navega entre sessões.

## Notificação ao finalizar fora da sessão

Se a resposta termina e o usuário não está visualizando a sessão correspondente:

1. VS Code mostra `ATLAS: resposta concluída em "<titulo>"`;
2. ação `Abrir chat` foca a Webview.

## Limitações atuais

- Histórico e configuração ficam em `config/` dentro da extensão em desenvolvimento.
- O resumo depende do modelo ativo no momento da sumarização.
- Falha de sumarização não bloqueia o usuário e apenas mantém o resumo anterior.
- O resumo substitui o texto anterior por uma versão consolidada, não guarda versões.

## Relações com outros processos

- Geração: [Processo de geração de resposta](processo-geracao-resposta-atlas.md).
- Prompts: [Processo de prompts e modos](processo-prompts-modos-atlas.md).
- Configuração: [Processo de configuração](processo-configuracao-atlas.md).
