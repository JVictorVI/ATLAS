# Plano e Estado da Implementação do RAG no ATLAS

Atualizado em 25 de junho de 2026.

## 1. Objetivo

O RAG do ATLAS fornece recuperação semântica local para:

- indexar o workspace atual ou uma pasta escolhida pelo usuário;
- transformar arquivos elegíveis em chunks e embeddings;
- persistir vetores e metadados localmente;
- recuperar trechos relevantes para perguntas feitas no chat;
- injetar o contexto recuperado na montagem do prompt;
- controlar explicitamente o envio desse contexto para modelos cloud;
- exibir projetos, status, tamanho, progresso e ações de manutenção na tela RAG.

O fluxo principal já está implementado. As evoluções restantes concentram-se em atualização incremental por arquivo, documentos externos e melhorias de qualidade.

## 2. Estado atual

| Área | Estado |
| --- | --- |
| Runtime ChromaDB local | Implementado |
| Modelo local de embeddings | Implementado |
| Indexação do workspace atual | Implementada |
| Indexação manual de outra pasta | Implementada |
| Chunking textual e metadados de linhas | Implementados |
| Persistência por projeto | Implementada |
| Recuperação no chat | Implementada |
| Fontes utilizadas na resposta | Implementadas e persistidas na sessão |
| Tela de projetos indexados | Implementada |
| Barra de progresso e cancelamento | Implementados |
| Configurações de indexação e recuperação | Implementadas |
| Watcher e debounce | Implementados |
| Atualização incremental por arquivo | Pendente; a atualização automática atual reindexa o projeto completo |
| Documentos externos | Interface preparada; ingestão pendente |
| Chunking orientado a símbolos | Pendente |

## 3. Arquitetura implementada

```text
ChatResponseController / ChatMessageRouter
  -> AtlasRagService
       -> AtlasEmbeddingService
       -> AtlasChromaService
       -> AtlasRagRepository
            -> ChromaDB local
            -> index-manifest.json
```

### 3.1 Responsabilidades

- `AtlasRagService`: scanner, regras de exclusão, chunking, indexação, watchers, recuperação, filtros, orçamento de contexto e formatação das fontes.
- `AtlasEmbeddingService`: carrega o modelo local com Transformers.js e gera embeddings de documentos e perguntas.
- `AtlasChromaService`: inicia e encerra o processo ChromaDB, escolhe uma porta local livre, executa heartbeat e define o diretório persistente.
- `AtlasRagRepository`: gerencia coleções, chunks, consultas e exclusões no ChromaDB, além do manifesto JSON usado pela interface.
- `ChatResponseController`: solicita o contexto RAG antes de montar o prompt e associa as fontes à resposta persistida.
- `ChatMessageRouter`: trata configuração, indexação, reindexação, cancelamento, exclusão e notificações da Webview.

O desenho continua deliberadamente enxuto: scanner, chunker e pós-processamento permanecem privados ao `AtlasRagService` enquanto não houver necessidade concreta de extração.

## 4. Runtime e distribuição

O usuário não precisa instalar Python, Docker ou ChromaDB.

O pacote da extensão prepara:

- cliente TypeScript `chromadb`;
- binding nativo do ChromaDB para a plataforma;
- launcher `resources/chroma/chroma-runner.cjs`;
- Transformers.js e runtime ONNX local;
- modelo de embeddings em `resources/embeddings/atlas-embedding`;
- scripts de preparação, poda e validação.

Na ativação do RAG:

1. `AtlasChromaService` procura o binding para `process.platform` e `process.arch`;
2. reserva uma porta livre em `127.0.0.1`;
3. inicia o runner usando o Node/Electron da extensão;
4. aponta os dados para `context.globalStorageUri/rag/chroma`;
5. aguarda o heartbeat por até 30 segundos;
6. disponibiliza um `ChromaClient`;
7. encerra somente o processo criado pelo ATLAS.

O alvo de empacotamento atualmente validado é `win32-x64`.

Scripts relacionados:

```text
npm run prepare-rag-runtime
npm run prepare-embedding-model
npm run prepare-embedding-runtime
npm run test-rag-runtime
npm run test-rag-semantic
npm run vsix
```

## 5. Embeddings

O `AtlasEmbeddingService` expõe:

```ts
embedDocuments(texts: string[], signal?: AbortSignal): Promise<number[][]>;
embedQuery(text: string, signal?: AbortSignal): Promise<number[]>;
```

Características atuais:

- execução exclusivamente local;
- modelo lógico configurado como `atlas-embedding`;
- artefato baseado em `Xenova/paraphrase-multilingual-MiniLM-L12-v2`;
- inferência quantizada `q8`;
- pooling médio e normalização dos vetores;
- 384 dimensões no modelo atual;
- processamento da indexação em lotes de 16 chunks;
- nenhuma função automática de embedding do ChromaDB: o ATLAS sempre envia os vetores calculados.

Uma mudança de modelo ou de metadados incompatíveis deve marcar os índices como desatualizados e exigir reindexação.

## 6. Persistência

### 6.1 Diretórios

```text
context.globalStorageUri/
└── rag/
    ├── chroma/
    └── index-manifest.json
```

### 6.2 Coleções

- Cada projeto possui uma coleção `atlas_<projectId>`.
- O `projectId` é um hash estável do caminho raiz normalizado.
- Durante a indexação é criada uma coleção temporária `atlas_<projectId>_build_<timestamp>`.
- A coleção ativa só é substituída após a conclusão da indexação.
- Falhas ou cancelamentos removem a coleção temporária e preservam o índice anterior quando existente.

### 6.3 Manifesto

O manifesto mantém:

- projeto, caminho raiz, coleção e status;
- modelo e dimensões dos embeddings;
- quantidade de fontes e chunks;
- tamanho estimado;
- datas e mensagem de erro;
- fontes, hashes, tamanho, linguagem e IDs de chunks.

Status possíveis:

```text
not-indexed | indexing | ready | outdated | error
```

## 7. Indexação

### 7.1 Fluxo

```text
Webview RAG
  -> ChatMessageRouter
  -> AtlasRagService.indexCurrentWorkspace/indexSelectedFolder/indexProject
  -> scanner e filtros
  -> chunking
  -> AtlasEmbeddingService
  -> AtlasRagRepository
  -> coleção temporária
  -> substituição da coleção ativa
  -> manifesto e Webview
```

A interface mostra:

- análise inicial dos arquivos;
- preparação dos chunks;
- geração de embeddings;
- chunks processados e restantes;
- arquivo atual quando disponível;
- salvamento da base;
- conclusão e cancelamento.

### 7.2 Seleção de arquivos

São aplicados:

- extensões permitidas configuráveis;
- caminhos e padrões glob ignorados;
- regras do `.gitignore`, quando habilitadas;
- limite de tamanho por arquivo;
- rejeição de arquivos vazios e binários;
- exclusão de lockfiles gerados, como `package-lock.json`, `pnpm-lock.yaml` e `Cargo.lock`;
- opções independentes para Markdown e para JSON/arquivos de configuração.

Arquivos Markdown:

```text
.md, .markdown
```

JSON e configurações:

```text
.json, .jsonc, .yaml, .yml, .xml, .toml,
.ini, .cfg, .conf, .properties, .txt
```

### 7.3 Chunking

O chunking atual é textual:

1. usa `chunkSize` em caracteres;
2. mantém `chunkOverlap` entre trechos;
3. tenta preservar limites de linha;
4. registra caminho, linguagem e intervalo de linhas;
5. calcula hash do conteúdo e do chunk;
6. inclui um cabeçalho textual com arquivo, linguagem e linhas no documento armazenado.

Os valores padrão são 1.000 caracteres por chunk e sobreposição de 200 caracteres.

### 7.4 Atualização automática

O `FileSystemWatcher` observa projetos registrados. Quando um arquivo elegível é criado, alterado ou removido:

1. o índice é marcado como `outdated`;
2. o debounce agrupa alterações próximas;
3. se `autoIndex` estiver habilitado, o projeto é reindexado.

Importante: a implementação atual reconstrói o índice completo. Atualizar apenas as fontes modificadas continua no roadmap.

## 8. Recuperação

### 8.1 Fluxo

1. validar se o RAG está habilitado;
2. validar a política local/cloud;
3. resolver o projeto correspondente ao workspace ativo;
4. gerar o embedding da pergunta;
5. consultar até `topK * 5` candidatos no ChromaDB;
6. aplicar filtros e limites;
7. selecionar até `topK` resultados;
8. respeitar `maxContextCharacters`;
9. formatar contexto e fontes;
10. injetar o contexto em `AtlasPromptAssemblyService`.

### 8.2 Filtros implementados

- distância máxima ou relevância mínima;
- exclusão de lockfiles gerados;
- inclusão ou exclusão de documentos externos;
- exclusão do arquivo atualmente aberto;
- linguagens permitidas;
- diretórios ou padrões glob permitidos;
- máximo de chunks por arquivo;
- diversidade entre arquivos;
- prioridade para código, documentação ou ambos;
- limite total de caracteres.

A relevância apresentada é derivada por:

```text
relevance = clamp(1 - distance, 0, 1)
```

O padrão atual usa distância máxima `0.9`.

### 8.3 Projeto selecionado

A consulta usa somente a coleção do projeto correspondente ao workspace ativo. Projetos adicionados manualmente ficam disponíveis para gestão e indexação, mas não são misturados automaticamente em perguntas feitas em outro workspace.

### 8.4 Fontes

Quando `showSources` está habilitado, a resposta apresenta:

- caminho relativo;
- intervalo de linhas;
- linguagem;
- tipo da fonte;
- distância e relevância.

As fontes também são armazenadas nos metadados da mensagem da sessão.

## 9. Configurações

### 9.1 Principais

- habilitar RAG;
- atualização automática;
- permitir contexto RAG em modelos cloud;
- quantidade máxima de resultados (`topK`);
- limite de contexto enviado ao modelo;
- pastas e padrões ignorados.

### 9.2 Indexação

- tamanho do chunk;
- sobreposição;
- tamanho máximo por arquivo;
- extensões permitidas;
- respeitar `.gitignore`;
- indexar Markdown;
- indexar JSON e arquivos de configuração;
- indexar automaticamente ao adicionar projeto;
- debounce após alterações.

### 9.3 Recuperação

- modo e limite de relevância;
- máximo de chunks do mesmo arquivo;
- diversidade entre arquivos;
- exclusão do arquivo aberto;
- inclusão de documentos externos;
- prioridade de fontes;
- filtros por linguagem e diretório;
- exibição das fontes.

Alterações que mudam o formato do índice marcam projetos prontos como `outdated`.

## 10. Segurança e privacidade

- Índices e embeddings permanecem locais.
- O ChromaDB escuta apenas em `127.0.0.1`.
- Em modo cloud, contexto RAG só é usado com `allowCloudContext`.
- Apenas os chunks selecionados são enviados ao modelo, nunca a base completa.
- Caminhos enviados ao prompt são relativos ao projeto.
- Os logs de diagnóstico do RAG são destinados ao desenvolvimento e podem mostrar conteúdo dos chunks recuperados; não devem ser habilitados indiscriminadamente em builds de produção.
- Uma falha do RAG não deve impedir o uso do restante da extensão.

## 11. Testes existentes

- `test-rag-runtime`: inicializa o binding, valida heartbeat, persistência e operações básicas do ChromaDB.
- `test-rag-semantic`: gera embeddings locais, grava documentos e verifica se a consulta recupera o trecho esperado.
- `check-types`: valida os contratos TypeScript.
- `compile`: executa tipagem, lint e bundle.

## 12. Roadmap

### Concluído

- runtime e embeddings locais;
- coleção por projeto e manifesto;
- indexação manual e por pasta;
- recuperação integrada ao chat;
- fontes nas respostas;
- tela real de projetos;
- configurações principais, de indexação e de recuperação;
- watcher, debounce, cancelamento e progresso;
- filtros avançados e orçamento de contexto;
- exclusão de arquivos gerados que poluem a busca.

### Próximas evoluções

1. atualização incremental somente das fontes alteradas;
2. ingestão real de documentos externos, incluindo PDF;
3. chunking orientado a símbolos;
4. avaliação automatizada com `recall@k`, precisão, latência e diversidade;
5. suporte e empacotamento validados para outras plataformas;
6. redução ou proteção dos logs de conteúdo em builds de produção;
7. integração opcional do RAG com análise rápida após benchmark de latência.

## 13. Critérios de aceite pendentes

- alteração pontual não exigir reconstrução completa;
- exclusão de arquivo remover somente seus chunks;
- documento externo indexado aparecer como fonte;
- benchmarks demonstrarem recuperação relevante dentro do orçamento;
- instalação em máquina limpa funcionar sem dependências externas;
- suporte de plataforma falhar de forma clara sem derrubar o chat.
