# Processos de Contexto, Janela Local e RAG

Atualizado em 1 de julho de 2026.

Este documento descreve três fluxos operacionais do ATLAS:

- ajuste automático da janela de contexto local e dos tokens gerados;
- indexação de arquivos e projetos no RAG;
- funcionamento dos embeddings locais usados na indexação e na busca.

## 1. Conceitos

### Contexto enviado

O contexto enviado ao modelo é o conteúdo montado antes da inferência. Ele pode incluir:

- prompt de sistema e política de resposta;
- mensagem atual do usuário;
- histórico recente e resumo arquitetural da sessão;
- contexto do editor aberto;
- contexto estrutural do VS Code, quando habilitado;
- trechos recuperados pelo RAG.

Esse contexto é controlado pelos perfis de contexto, pelas telas de RAG e pelas regras de montagem do prompt.

### Janela de contexto local

A janela de contexto local é a capacidade usada pelo `llama-server`, enviada como `--ctx-size`. No ATLAS ela vem de:

```text
model.parameters.contextWindow
```

Ela define quantos tokens a engine local consegue acomodar entre entrada e saída.

### Tokens gerados

O limite de tokens gerados é enviado para a API local como:

```json
{
  "max_tokens": model.parameters.maxTokens
}
```

Esse valor reserva espaço para a resposta. Se o contexto enviado for grande e `max_tokens` também for grande, a soma pode exceder a janela disponível.

## 2. Ajuste automático da janela e dos tokens

### Onde é configurado

Na tela **Configurações Gerais**, a seção **Contexto e tokens gerados** controla:

```text
custom.localEngine.dynamicContextWindow
```

Quando o modo está como **Automático**, o ATLAS pode ajustar e salvar os parâmetros do modelo local. Quando está como **Fixo**, o ATLAS apenas informa o erro e orienta o usuário a aumentar o contexto na Biblioteca ou ativar o ajuste automático.

### Fluxo normal

1. `ChatResponseController` monta as mensagens da pergunta.
2. `AtlasInferenceService` escolhe o modo local.
3. `LocalApiService.sendChat` obtém o modelo local ativo pelo `AtlasConfigManager`.
4. `AtlasLocalEngineService.ensureEngine` inicia ou reutiliza o `llama-server`.
5. `LocalApiService` envia `POST /v1/chat/completions` com `messages`, `temperature`, `top_p`, `max_tokens` e `stream`.

### Detecção de overflow

Se a engine local responde com erro, `LocalApiService.getContextOverflow` tenta reconhecer estouro de contexto em mensagens contendo termos como:

```text
exceeds the available context size
context size
context window
context length
```

Também são extraídos, quando disponíveis:

- tokens solicitados;
- tamanho de contexto disponível;
- tokens das mensagens;
- tokens da conclusão.

O ATLAS não faz uma pré-tokenização própria perfeita antes da chamada. O ajuste automático reage à resposta de overflow da engine, porque a tokenização efetiva depende do modelo e do backend local.

### Cálculo do novo orçamento

O ajuste é feito em `LocalApiService.adjustDynamicTokenBudget`.

Constantes atuais:

```text
LOCAL_CONTEXT_GROWTH_CAP = 32768
LOCAL_CONTEXT_GROWTH_PADDING = 512
```

Valores de entrada:

```text
currentContext = model.parameters.contextWindow ou contexto reportado pela engine
currentMaxTokens = model.parameters.maxTokens ou llms.defaults.maxTokens
promptTokens = tokens das mensagens, quando reportado
```

Quando a engine não informa `promptTokens`, o ATLAS tenta inferir:

```text
promptTokens = requestedTokens - currentMaxTokens
```

O contexto mínimo necessário considera três coisas:

```text
requestedTokens + padding
promptTokens + currentMaxTokens + padding
currentContext + 1
```

O próximo contexto é a próxima potência de 2, limitado pelo teto local:

```text
nextContext = min(32768, nextPowerOfTwo(minimumContext))
```

Quando há estimativa de `promptTokens`, o novo limite de geração é o espaço restante dentro da nova janela:

```text
nextMaxTokens = nextContext - promptTokens - 512
```

Se não houver estimativa confiável de `promptTokens`, o ATLAS mantém o `maxTokens` atual e ajusta apenas a janela.

### Persistência dos novos valores

Os novos parâmetros são salvos no modelo local ativo por:

```text
AtlasConfigManager.updateModel(model.id, {
  parameters: {
    contextWindow: nextContext,
    maxTokens: nextMaxTokens
  }
})
```

Ou seja, o ajuste não vale apenas para a requisição atual. Ele fica registrado na configuração do modelo e aparece depois na Biblioteca.

### Reinício da engine

Depois de salvar os parâmetros, o ATLAS precisa reiniciar a engine para aplicar o novo `--ctx-size`.

Fluxo:

1. `LocalApiService` chama `AtlasLocalEngineService.restartEngine(model, { reason: "parameter-update" })`.
2. A engine antiga é parada.
3. O `llama-server` é iniciado novamente com o novo `--ctx-size`.
4. A Webview mostra mensagens específicas de aplicação de parâmetros.
5. A requisição original é reenviada.

Mensagens exibidas no fluxo de ajuste:

```text
Reiniciando a engine local para aplicar os novos parâmetros de <modelo>.
Aplicando novos parâmetros na engine CPU/CUDA/VULKAN.
Engine local pronta: <modelo>.
```

### Logs do processo

O fluxo registra logs com estes prefixos:

```text
[ATLAS local] Contexto insuficiente (...)
[ATLAS local] Parâmetros dinâmicos salvos no modelo.
[ATLAS local] Reiniciando engine local para aplicar parâmetros dinâmicos.
[ATLAS local engine] Reinício solicitado para aplicar novos parâmetros.
[ATLAS local engine] Novos parâmetros aplicados; engine local pronta.
```

Os logs incluem modelo, contexto anterior, novo contexto, `maxTokens` anterior, novo `maxTokens`, tokens solicitados e tipo de engine.

### Limitações do ajuste automático

- O teto atual é `32768` tokens.
- O ajuste depende do erro retornado pela engine local; se a engine não retornar uma mensagem reconhecível, o ATLAS trata como erro local comum.
- O modo automático não escolhe quais trechos de contexto entram no prompt. Essa seleção é feita antes, pelos perfis de contexto, RAG, histórico e contexto do editor.
- Em modo fixo, o ATLAS não altera nem salva `contextWindow` ou `maxTokens`.

## 3. Indexação de projetos e arquivos no RAG

### Componentes envolvidos

```text
ChatMessageRouter
  -> AtlasRagService
       -> AtlasEmbeddingService
       -> AtlasEmbeddingModelDiscoveryService
       -> AtlasChromaService
       -> AtlasRagRepository
            -> ChromaDB local
            -> index-manifest.json
```

### Identidade de projeto

Um projeto RAG é definido por uma pasta raiz. O identificador é derivado do caminho absoluto:

```text
projectId = sha256(rootPath normalizado).slice(0, 24)
collectionName = atlas_<projectId>
```

No Windows, o caminho é normalizado para minúsculas antes do hash.

O manifesto fica em:

```text
context.globalStorageUri/rag/index-manifest.json
```

Os dados vetoriais ficam em:

```text
context.globalStorageUri/rag/chroma/
```

### Formas de indexar

O ATLAS tem três entradas principais:

- `indexCurrentWorkspace`: indexa a pasta do arquivo ativo ou a primeira pasta do workspace.
- `indexSelectedFolder`: indexa uma pasta escolhida pelo usuário.
- `indexProject`: reindexa um projeto já registrado pelo `projectId`.

Também existe `registerSelectedFolder`, que registra uma pasta como projeto `not-indexed` sem necessariamente construir o índice naquele momento.

### Inicialização do runtime vetorial

Antes de indexar, `AtlasRagService.indexFolder` chama `initialize`.

O runtime:

1. normaliza índices interrompidos;
2. inicia o ChromaDB local pelo `AtlasChromaService`;
3. escolhe uma porta local;
4. prepara watchers dos projetos registrados;
5. garante um `ChromaClient` pronto para leitura e escrita.

### Scanner de arquivos

O scanner usa `vscode.workspace.findFiles` com padrão:

```text
**/*
```

São aplicadas exclusões de:

- `rag.ignoredPaths`;
- `.git`, `.svn`, `.hg`;
- `node_modules`, `dist`, `build`, `out`, `coverage`;
- `.next`, `.nuxt`, `vendor`, `bin`, `obj`;
- entradas do `.gitignore`, se `rag.respectGitIgnore` estiver ativo.

Entradas negadas no `.gitignore`, começando com `!`, são ignoradas pelo parser atual.

### Arquivos elegíveis

Um arquivo só entra na indexação se:

- não estiver nos caminhos ignorados;
- tiver extensão permitida;
- não for arquivo gerado/dependência conhecido;
- não estiver vazio;
- não exceder `rag.maxFileSizeBytes`;
- não parecer binário, usando presença de byte zero como sinal;
- possuir conteúdo textual após `trim`.

Extensões de código vêm de:

```text
rag.allowedExtensions
```

Markdown depende de:

```text
rag.includeMarkdownFiles
```

Arquivos de configuração/texto dependem de:

```text
rag.includeConfigFiles
```

Arquivos sempre ignorados como dependência gerada:

```text
package-lock.json
npm-shrinkwrap.json
yarn.lock
pnpm-lock.yaml
composer.lock
poetry.lock
cargo.lock
```

### Preparação de cada fonte

Para cada arquivo elegível, `prepareSource` gera:

- `sourceId`: hash de `projectId + relativePath`;
- `contentHash`: hash do conteúdo;
- linguagem detectada pela extensão;
- tipo `code` ou `document`;
- chunks com conteúdo, linhas inicial/final e metadados.

O conteúdo indexado em cada chunk recebe cabeçalho textual:

```text
Arquivo: <relativePath>
Linguagem: <language>
Linhas: <start>-<end>

<conteúdo do chunk>
```

Esse cabeçalho também participa do embedding, para dar contexto semântico ao trecho.

### Chunking

O chunking é textual e orientado a linhas.

Configurações:

```text
rag.chunkSize
rag.chunkOverlap
```

Regras:

- `chunkSize` mínimo efetivo: `300` caracteres;
- `chunkOverlap` é limitado entre `0` e metade do `chunkSize`;
- o algoritmo acumula linhas até atingir o tamanho configurado;
- o overlap volta linhas anteriores até atingir o orçamento de sobreposição;
- cada chunk guarda `startLine` e `endLine`.

O chunking ainda não é orientado a símbolos. Essa evolução permanece pendente.

### Escrita segura com coleção temporária

Durante a indexação, o ATLAS não substitui imediatamente a coleção ativa.

Fluxo:

1. cria uma coleção temporária:

```text
atlas_<projectId>_build_<timestamp>
```

2. gera e grava todos os chunks nessa coleção temporária;
3. ao final, chama `replaceCollection(staging, target)`;
4. apaga a coleção ativa antiga;
5. renomeia a temporária para:

```text
atlas_<projectId>
```

Isso evita deixar um índice pronto parcialmente substituído se a indexação falhar no meio.

### Progresso e estados

O progresso reporta fases:

```text
scanning
chunking
embedding
saving
completed
```

Estados do projeto:

```text
not-indexed
indexing
ready
outdated
error
```

Se a indexação é cancelada, o projeto volta ao estado anterior, quando existia. Se falha e havia índice pronto anterior, o status vira `outdated`; caso contrário, vira `error`.

### Atualização automática

Depois que um projeto é registrado, `AtlasRagService` cria um `FileSystemWatcher` para a pasta.

Quando um arquivo muda:

1. o ATLAS verifica se o arquivo é rastreável e elegível;
2. se o projeto estava pronto, marca como `outdated`;
3. se `rag.autoIndex` estiver ativo, agenda reindexação após `rag.autoIndexDebounceMs`;
4. a reindexação automática atual reconstrói o projeto completo.

Atualização incremental por arquivo ainda é uma evolução pendente.

## 4. Documentos externos no RAG

Documentos externos são fontes associadas ao workspace/projeto, mas armazenadas em coleção separada por projeto e modelo de embeddings.

Coleção:

```text
atlas_<projectId>_external_<hashDoModelo>
```

Formatos suportados:

```text
.pdf
.docx
.pptx
.xlsx
.txt
.md
.markdown
.rst
.adoc
.csv
.tsv
.json
.jsonc
.yaml
.yml
.xml
.html
.htm
.log
```

O limite de tamanho usa:

```text
rag.externalDocumentMaxFileSizeBytes
```

Processo:

1. usuário seleciona documentos na tela RAG;
2. `ChatMessageRouter` chama `AtlasRagService.addExternalDocuments`;
3. `AtlasExternalDocumentParser` extrai texto;
4. o texto é normalizado e quebrado em chunks;
5. `AtlasEmbeddingService` gera vetores;
6. `AtlasRagRepository` salva fontes no manifesto e chunks na coleção externa.

Na recuperação, documentos externos só entram se:

```text
rag.includeExternalDocuments === true
```

## 5. Funcionamento dos embeddings

### Descoberta do modelo

`AtlasEmbeddingModelDiscoveryService` procura modelos em:

```text
rag.embeddingModelsDir
```

Se essa pasta não estiver configurada, usa:

```text
context.globalStorageUri/rag/embedding-models/
```

Também verifica modelos empacotados em:

```text
resources/embeddings/
```

Um diretório é considerado modelo válido se tiver:

- `config.json`;
- `tokenizer.json` ou `tokenizer_config.json`;
- pelo menos um arquivo `.onnx` em `onnx/`.

### Modelo padrão

O modelo lógico padrão é:

```text
atlas-embedding
```

O download padrão usa:

```text
Xenova/paraphrase-multilingual-MiniLM-L12-v2
```

Metadados atuais:

```text
task: feature-extraction
dimensions: 384
quantization: int8
```

Arquivos baixados:

```text
config.json
special_tokens_map.json
tokenizer.json
tokenizer_config.json
unigram.json
onnx/model_quantized.onnx
```

### Carregamento

`AtlasEmbeddingService` usa `@huggingface/transformers` localmente:

```text
pipeline("feature-extraction", modelId, {
  local_files_only: true,
  dtype
})
```

O ATLAS desativa modelos remotos no runtime:

```text
allowRemoteModels = false
allowLocalModels = true
```

O `dtype` é escolhido pelo arquivo ONNX disponível:

- `model_quantized.onnx` -> `q8`;
- `model.onnx` -> `fp32`.

### Geração dos vetores

Para documentos e perguntas, o serviço chama o pipeline com:

```text
pooling: "mean"
normalize: true
```

Isso produz vetores normalizados. O mesmo serviço gera embeddings para:

- chunks de arquivos do projeto;
- chunks de documentos externos;
- pergunta do usuário na recuperação semântica.

Na indexação de projeto, os chunks são processados em lotes de 16.

### Persistência no ChromaDB

O ATLAS calcula os embeddings. O ChromaDB não recebe uma função automática de embedding.

Ao criar/obter coleção, o repositório usa:

```text
embeddingFunction: null
metadata:
  hnsw:space = cosine
  atlasManaged = true
```

Cada chunk salvo inclui:

- `chunkId`;
- vetor de embedding;
- documento textual;
- `projectId`;
- `sourceId`;
- caminho relativo;
- tipo `code` ou `document`;
- sinal de documento externo;
- linguagem;
- linhas inicial/final;
- índice do chunk;
- hash do conteúdo.

## 6. Recuperação semântica

Quando o chat precisa de contexto RAG:

1. `ChatResponseController` solicita `AtlasRagService.retrieveContext`.
2. O serviço verifica se o RAG está ativo e se o modo cloud tem permissão para receber contexto.
3. Resolve o projeto do arquivo ativo ou workspace atual.
4. Gera embedding da pergunta.
5. Consulta a coleção do projeto pronto e, se habilitado, coleções externas.
6. Pede mais candidatos que o `topK` final:

```text
candidateCount = max(rag.topK * 5, rag.topK)
```

7. Aplica filtros de relevância, arquivos gerados, documento externo, arquivo ativo, linguagem, diretório e limite por arquivo.
8. Aplica prioridade de fonte (`code`, `documentation` ou `balanced`).
9. Diversifica por arquivo quando `rag.diversifyFiles` está ativo.
10. Monta o contexto final respeitando `rag.maxContextCharacters`.

Se o orçamento de caracteres for atingido, a seleção para antes de adicionar o próximo chunk.

Cada fonte retornada ao chat inclui distância, relevância, tipo, caminho e linhas quando disponíveis.

## 7. Configurações principais

| Configuração | Uso |
| --- | --- |
| `custom.localEngine.dynamicContextWindow` | Permite ou bloqueia ajuste automático da janela local e tokens gerados. |
| `model.parameters.contextWindow` | Define `--ctx-size` usado pelo `llama-server`. |
| `model.parameters.maxTokens` | Define `max_tokens` enviado à geração local. |
| `rag.enabled` | Liga ou desliga recuperação RAG. |
| `rag.embeddingModel` | Modelo de embeddings ativo. |
| `rag.embeddingModelsDir` | Pasta customizada de modelos de embeddings. |
| `rag.chunkSize` | Tamanho alvo dos chunks textuais. |
| `rag.chunkOverlap` | Sobreposição textual entre chunks. |
| `rag.maxContextCharacters` | Orçamento de contexto RAG injetado no prompt. |
| `rag.topK` | Quantidade final de resultados recuperados. |
| `rag.maxChunksPerFile` | Limite de chunks por arquivo após filtros. |
| `rag.autoIndex` | Habilita reindexação automática por watcher. |
| `rag.autoIndexDebounceMs` | Atraso antes da reindexação automática. |
| `rag.allowCloudContext` | Permite enviar contexto RAG para modelos cloud. |
| `rag.offlineOnly` | Bloqueia RAG no modo cloud quando ativo. |
| `rag.includeExternalDocuments` | Inclui documentos externos na recuperação. |
