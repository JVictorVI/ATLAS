# Processo do Repositório de Modelos

Atualizado em 25 de julho de 2026.

Este documento descreve como o ATLAS apresenta o repositório visual de modelos, consulta modelos compatíveis no Hugging Face, detalha variantes disponíveis, baixa arquivos e integra o resultado com a biblioteca local, a engine local e o RAG.

## Objetivo

O Repositório de Modelos é a entrada visual para descobrir modelos externos compatíveis com o ATLAS.

Ele cobre dois tipos de modelo:

- **LLM local**: modelo de geração em formato GGUF, executado pela engine local `llama.cpp`.
- **Embedding**: modelo ONNX usado para gerar vetores semânticos no RAG; não responde perguntas diretamente.

O repositório não é um provedor de conversa. Mesmo quando a origem é Hugging Face, a geração continua acontecendo por um modelo local baixado ou por um provedor cloud configurado separadamente.

## Componentes

```text
Webview search
  -> ChatMessageRouter
     -> HuggingFaceModelService
        -> Hugging Face API

Download GGUF
  -> HuggingFaceModelService
  -> AtlasLocalModelDiscoveryService
  -> AtlasModelRegistryService
  -> AtlasConfigRepository

Download ONNX
  -> HuggingFaceModelService
  -> AtlasEmbeddingModelDiscoveryService
  -> Configuração RAG
```

Componentes auxiliares:

```text
ChatPanelManager
ChatViewProvider
HardwareDiagnosticService
compatibility-diagnostics.js
```

## Abertura da tela

A tela do repositório é aberta pela rota:

```text
search
```

`ChatPanelManager.normalizeSelectedView` reconhece essa rota e `openSearchModelDetails` permite abrir a tela já focada em um modelo específico.

Ao carregar:

1. `script.js` verifica se existe `window.__ATLAS_INITIAL_SEARCH_MODEL_ID__`.
2. Se existir, chama `showModelDetails(modelId)`.
3. Caso contrário, inicia uma busca vazia com `searchModels("")`.
4. Em paralelo, solicita diagnóstico de hardware com `requestRepositoryHardware()`.

## Busca de modelos

O webview envia:

```text
buscarModelosHuggingFace
```

Payload principal:

```text
query
modelFilter
offset
limit
requestId
```

`requestId` evita que respostas antigas sobrescrevam uma busca mais recente. A tela também mantém timeout próprio para informar quando a consulta demora demais.

No backend, `ChatMessageRouter.handleSearchHuggingFaceModels` valida paginação, filtro e consulta, chama `searchHuggingFaceModels` e devolve:

```text
modelosHuggingFaceEncontrados
```

com:

```text
models
pagination.offset
pagination.limit
pagination.hasNextPage
```

## Filtros disponíveis

O filtro visual pode ser:

```text
all
llm
embedding
```

No backend, `HuggingFaceModelService.searchModels` traduz isso em chamadas ao Hugging Face:

- Para LLMs, usa `/api/models` com `filter=gguf` e busca textual.
- Para embeddings, consulta modelos com `pipeline_tag=feature-extraction`.
- Também consulta `pipeline_tag=sentence-similarity` quando embeddings estão incluídos.

Os resultados são deduplicados por id de repositório e ordenados por downloads.

## Critérios de compatibilidade

Um modelo de geração é considerado compatível quando:

- declara tarefa `text-generation` ou `any-to-any`;
- possui pelo menos um arquivo GGUF executável;
- o arquivo GGUF não é projetor multimodal ou arquivo auxiliar.

Um modelo de embedding é considerado compatível quando:

- declara tarefa de embedding, sentença ou possui identidade textual compatível;
- contém `config.json`;
- contém `tokenizer.json` ou `tokenizer_config.json`;
- possui `onnx/model.onnx` ou `onnx/model_quantized.onnx`.

Arquivos GGUF que não podem ser executados isoladamente pela implementação atual não aparecem entre as variantes disponíveis. O filtro exclui:

- projetores multimodais, como `mmproj` e `projector`;
- drafters MTP usados apenas para decodificação especulativa;
- adaptadores LoRA/adapter;
- partes de modelos GGUF divididos em múltiplos arquivos.

A mesma validação é repetida imediatamente antes do download. Assim, uma mensagem antiga ou manipulada do webview não consegue iniciar o download de um arquivo auxiliar incompatível.

## Detalhamento do modelo

Ao selecionar um modelo, o webview envia:

```text
detalharModeloHuggingFace
```

`HuggingFaceModelService.getModelDetails` consulta:

```text
https://huggingface.co/api/models/<repo>
```

com:

```text
blobs=true
```

O serviço monta:

- id;
- nome;
- autor;
- downloads;
- likes;
- status `gated` ou privado;
- task/pipeline;
- data de atualização;
- tags;
- descrição;
- formato `GGUF` ou `ONNX`;
- contagem de parâmetros, quando o Hugging Face retorna `safetensors.parameters`;
- lista de arquivos do repositório;
- variantes GGUF ou ONNX compatíveis.

Se a descrição da API não vier preenchida, o serviço tenta ler o `README.md` bruto do repositório. Se ainda assim não houver descrição, usa uma mensagem curta de fallback.

## Variantes e quantização

Para modelos GGUF, cada variante inclui:

```text
name
sizeBytes
size
quantization
downloadUrl
fileUrl
```

A quantização é inferida pelo nome do arquivo, buscando padrões como:

```text
Q4_K_M
Q8_0
IQ4_NL
```

Quando não encontra uma quantização reconhecível, usa:

```text
GGUF
```

Para modelos ONNX, o ATLAS aceita apenas:

```text
onnx/model.onnx
onnx/model_quantized.onnx
```

A UI mostra variantes em um seletor, exibe tamanho quando disponível e usa o arquivo selecionado como alvo do download.

## Diagnóstico de hardware

Ao abrir o repositório, a tela solicita:

```text
solicitarHardwareRepositorio
```

O backend responde com:

```text
hardwareRepositorioCarregado
```

ou:

```text
hardwareRepositorioErro
```

Esses dados alimentam o cartão de compatibilidade para LLMs GGUF. O veredito considera principalmente VRAM, com menor peso para RAM e CPU. Espaço livre em disco não participa dessa classificação; ele pertence ao fluxo prático de download, não à estimativa de execução local. O cálculo e suas limitações estão detalhados em [Processo de compatibilidade de hardware para modelos locais](processo-compatibilidade-hardware-modelos-locais-atlas.md).

Modelos ONNX de embeddings não exibem o diagnóstico de compatibilidade de geração.

## Download de LLM GGUF

Ao baixar uma variante GGUF, o webview envia:

```text
baixarModeloHuggingFace
```

`ChatViewProvider.downloadHuggingFaceModel` executa o download dentro de `vscode.window.withProgress`, com cancelamento via `AbortController`.

O fluxo chama diretamente:

```text
HuggingFaceModelService.downloadModel
```

A engine continua sendo preparada pelos fluxos próprios de engine, como abertura do ATLAS com preparo habilitado, início automático configurado ou comando explícito de download da engine.

Para GGUF, o destino é a pasta retornada por:

```text
AtlasLocalModelDiscoveryService.getModelsDir()
```

Essa pasta vem de:

```text
custom.localModels.modelsDir
```

ou, se não configurada:

```text
<extensionPath>/models
```

Após o download:

1. `AtlasLocalModelDiscoveryService.refreshLocalModels()` reescaneia os arquivos `.gguf`.
2. Cada arquivo encontrado é convertido em `AtlasModelConfig`.
3. O modelo é salvo em `llms.localModels`.
4. A lista de LLMs e a biblioteca local são atualizadas no webview.

## Registro local do modelo

O registro persistido fica em:

```text
llms.localModels
```

`AtlasModelRegistryService` oferece:

- `getAllModels`;
- `getLocalModel`;
- `getLocalModels`;
- `upsertModel`;
- `updateModel`;
- `removeModel`.

`upsertModel` preserva dados existentes e faz merge profundo dos blocos:

```text
parameters
metadata
custom
```

Esse comportamento evita perder ajustes manuais do usuário quando o mesmo arquivo é redescoberto.

## Configuração gerada para GGUF local

Para cada arquivo `.gguf`, `AtlasLocalModelDiscoveryService` gera:

```text
id = local/<nome-do-arquivo-sem-extensão>
source = local
path = <caminho absoluto do arquivo>
apiModelName = <nome-do-arquivo-sem-extensão>
enabled = true
```

Parâmetros padrão:

```text
temperature: 0.4
maxTokens: 8192
topP: 0.95
gpuLayers: 0
contextWindow: 8192
```

Metadados inferidos:

```text
source: models-folder
tags
quantization
size
installedAt
updatedAt
```

Configuração custom:

```text
baseUrl: http://127.0.0.1:8080/v1
engine: llama.cpp
```

Se não houver modelo ativo, o primeiro modelo local encontrado passa a ser selecionado automaticamente. Se o modelo ativo sumir da pasta, a seleção local é movida para o primeiro modelo disponível ou para `null`.

## Download de embeddings ONNX

Para embeddings, `HuggingFaceModelService.downloadEmbeddingModel` baixa o arquivo ONNX selecionado e arquivos auxiliares presentes no repositório, como:

```text
config.json
special_tokens_map.json
tokenizer.json
tokenizer_config.json
vocab.txt
merges.txt
sentencepiece.bpe.model
spiece.model
unigram.json
```

O destino é:

```text
AtlasEmbeddingModelDiscoveryService.getModelsDir()
```

O serviço cria também:

```text
atlas-model.json
```

com metadados básicos:

```text
name
source
revision
task
quantization
```

Depois do download, `AtlasEmbeddingModelDiscoveryService.refreshEmbeddingModels()` atualiza a lista de modelos de embedding conhecidos pelo RAG.

## Abertura no Hugging Face

O botão externo envia:

```text
abrirArquivoHuggingFace
```

O backend só aceita URLs iniciadas por:

```text
https://huggingface.co/
```

Depois abre o endereço com:

```text
vscode.env.openExternal
```

## Tratamento de erros

`HuggingFaceModelService.normalizeHuggingFaceError` transforma falhas comuns em mensagens de usuário:

| Caso                        | Mensagem geral                                      |
| --------------------------- | --------------------------------------------------- |
| Sem conexão ou erro de rede | Verificar conexão com a internet                    |
| Timeout                     | Tentar novamente em instantes                       |
| 401/403                     | Verificar chave de API ou acesso a modelos privados |
| 404                         | Modelo ou arquivo não encontrado                    |
| 429                         | Aguardar limite temporário do Hugging Face          |
| 5xx                         | Hugging Face indisponível                           |

Quando o download é cancelado, downloads parciais são removidos.

## Relação com outros processos

- A execução de LLMs baixados é descrita em [Processo da Engine Local](processo-engine-local-atlas.md).
- A compatibilidade de hardware das variantes GGUF é descrita em [Processo de compatibilidade de hardware para modelos locais](processo-compatibilidade-hardware-modelos-locais-atlas.md).
- O uso de embeddings baixados pelo RAG é descrito em [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).
- A persistência das configurações é descrita em [Processo de configuração](processo-configuracao-atlas.md).

## Limitações atuais

- A busca depende da disponibilidade e dos metadados retornados pelo Hugging Face.
- A contagem de parâmetros nem sempre está disponível.
- A descrição pode vir incompleta quando o repositório não fornece card ou README adequado.
- O download de GGUF salva apenas o arquivo selecionado, não snapshots completos do repositório.
- O download de embeddings baixa somente o ONNX selecionado e arquivos auxiliares conhecidos.
- O diagnóstico de hardware é heurístico e não substitui benchmark real.

## Arquivos relacionados

- `src/services/HuggingFaceModelService.ts`: busca, detalhe, mapeamento, filtros, URLs e download.
- `src/services/AtlasLocalModelDiscoveryService.ts`: descoberta de GGUFs locais e criação de configuração local.
- `src/services/AtlasModelRegistryService.ts`: persistência e atualização de modelos locais em `llms.localModels`.
- `src/services/AtlasEmbeddingModelDiscoveryService.ts`: descoberta e atualização de modelos ONNX de embeddings.
- `src/providers/ChatViewProvider.ts`: composição dos serviços, download com progresso e atualização das webviews.
- `src/providers/ChatMessageRouter.ts`: mensagens entre webview e backend.
- `src/providers/ChatPanelManager.ts`: abertura da rota `search` e detalhe direto por modelo.
- `src/webview/search/scripts/search-requests.js`: disparo de busca, detalhe e hardware.
- `src/webview/search/scripts/message-bus.js`: recepção das respostas do backend.
- `src/webview/search/scripts/model-utils.js`: regras de apresentação, filtros e variantes.
- `src/webview/search/scripts/render-details.js`: renderização do painel de detalhes, ações e diagnóstico.
