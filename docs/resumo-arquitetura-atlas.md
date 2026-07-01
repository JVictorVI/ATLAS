# Resumo de Status Arquitetural

Atualizado em 1 de julho de 2026 com base na implementação presente no repositório.

Para o fluxo detalhado de ajuste automático da janela local, indexação RAG e funcionamento dos embeddings, consulte [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).

## Documentação de processos

- [Fluxo completo de geração de resposta](processo-geracao-resposta-atlas.md)
- [Montagem de prompt e resolução de modo](processo-prompts-modos-atlas.md)
- [Sistema de configuração](processo-configuracao-atlas.md)
- [Análise rápida](processo-analise-rapida-atlas.md)
- [Execução local e lifecycle da engine](processo-engine-local-atlas.md)
- [Integração cloud](processo-integracao-cloud-atlas.md)
- [Sessões, histórico e resumo](processo-sessoes-historico-resumo-atlas.md)
- [Build, empacotamento e distribuição](processo-build-empacotamento-distribuicao-atlas.md)
- [Contexto, janela local, RAG e embeddings](processos-contexto-rag-atlas.md)

| Componente | Status atual |
| --- | --- |
| Extensão VS Code | Implementada |
| Webview de chat | Implementada, incluindo input com autosize e botão de modo estudante com estado visual ativo |
| Painel de provedores em nuvem | Implementado |
| Painel de configurações gerais | Implementado, incluindo perfis de contexto, execução local, análise estática e ajuste automático de contexto |
| Biblioteca local de modelos | Implementada para descoberta, seleção, parâmetros, comportamento, metadados, exclusão e controles de engine; busca/download de modelos de chat seguem planejados |
| Repositório visual de modelos | Implementado com dados estáticos |
| Integração cloud | Implementada |
| Provedores customizados | Implementados |
| Secret Storage | Implementado |
| `AtlasInferenceService` | Implementado |
| `CloudApiService` | Implementado |
| `LocalApiService` | Implementado com chamadas locais OpenAI-compatible, streaming, timeout, tratamento de overflow de contexto e ajuste dinâmico de `contextWindow` |
| `AtlasLocalEngineService` | Implementado com seleção de engine CPU/CUDA/Vulkan, `llama-server`, reinício para aplicar novos parâmetros, status na Webview e logs operacionais |
| `AtlasLocalModelDiscoveryService` | Implementado |
| Execução local `llama.cpp` | Implementada |
| CPU/CUDA/Vulkan | Implementado conforme binários disponíveis |
| Sessões de chat | Implementadas |
| Histórico persistido | Implementado |
| Resumo arquitetural | Implementado |
| Streaming | Implementado para OpenAI-compatible e local; fallback em Claude/Gemini |
| Cancelamento de geração | Implementado |
| `ChatResponseController` | Implementado com snapshot da geração ativa, cancelamento, RAG e delegação para análise rápida |
| `AtlasPromptModeResolver` | Implementado com heurística pontuada para os modos desenvolvedor, arquitetural e análise rápida |
| `AtlasSystemPromptPolicyService` | Implementado com prompts especializados, análise arquitetural em oito tópicos e política JSON para análise rápida |
| `AtlasQuickAnalysisService` | Implementado com numeração de linhas, contexto estrutural opcional, extração de JSON e normalização dos achados |
| `AtlasQuickAnalysisController` | Implementado com origem da execução, `sessionId`, sanitização de linhas, decorações por severidade e estado por documento |
| Análise rápida com marcações | Implementada via botão e intenção textual no chat |
| `AtlasDocumentStructureService` | Implementado com símbolos, diagnósticos e referências fornecidos pelo VS Code |
| Análise estática estrutural | Implementada como contexto auxiliar configurável para análises rápida e arquitetural |
| Persistência visual das marcações | Implementada por documento durante a sessão |
| Modo estudo | Implementado com prompt especializado, estado persistido, botão dedicado e tooltip explicativo |
| RAG local | Implementado para projetos e workspaces |
| `AtlasRagService` | Implementado: scanner, chunking, indexação, watchers, recuperação, filtros e orçamento de contexto |
| ChromaDB | Implementado com binding nativo empacotado e processo local gerenciado pela extensão |
| `AtlasChromaService` | Implementado com porta dinâmica, heartbeat, persistência e encerramento do processo auxiliar |
| Embeddings locais | Implementados com Transformers.js, pasta configurável, seletor, download do modelo padrão e vetores normalizados |
| `AtlasEmbeddingModelDiscoveryService` | Implementado para descobrir modelos empacotados, modelos em pasta escolhida pelo usuário e baixar o modelo padrão |
| `AtlasRagRepository` | Implementado com coleções Chroma e manifesto JSON persistente |
| Indexação do workspace atual | Implementada |
| Indexação de pasta escolhida | Implementada |
| Progresso da indexação | Implementado por etapa, arquivos e chunks, com cancelamento |
| Tela RAG | Implementada com status da base vetorial no topo, projetos indexados em destaque, documentos externos funcionais e loading inicial não bloqueante |
| Atualização automática | Implementada por watcher e debounce; atualmente reindexa o projeto completo |
| Recuperação semântica no chat | Implementada com fontes, relevância, filtros e limite de contexto |
| Configurações de indexação | Implementadas, incluindo Markdown e JSON/configuração como opções independentes |
| Configurações de recuperação | Implementadas: distância/relevância, diversidade, limite por arquivo, linguagem, diretório e prioridade |
| Documentos externos no RAG | Implementados com ingestão, listagem, exclusão e recuperação semântica em coleção externa por workspace e modelo de embeddings |
| Hugging Face API para busca de modelos | Planejada |
| Download automatizado de modelos de chat | Planejado |
| Backend Python | Não corresponde à implementação atual |

## Mapa de defasagens corrigidas em 1 de julho de 2026

| Área documentada | Situação anterior na documentação | Estado atual mapeado |
| --- | --- | --- |
| Contexto local automático | A documentação descrevia apenas aumento do tamanho de contexto quando a engine rejeitava a requisição. | A opção automática em Configurações Gerais ajusta e salva apenas o `contextWindow` do modelo local para comportar o contexto enviado. |
| Reinício da engine local | O fluxo de reinício era tratado como inicialização genérica. | Quando o contexto dinâmico é salvo, a engine é reiniciada com motivo explícito de atualização de parâmetros, mensagens próprias na UI e logs com modelo, engine e contexto. |
| Diagramas de inferência local | `LocalApiService` aparecia com responsabilidades antigas e sem o retry por overflow. | Os diagramas passam a representar detecção de overflow, persistência do novo `contextWindow` e reinício do `llama-server` antes do reenvio da requisição. |
| Documentos externos no RAG | Parte dos diagramas ainda marcava ingestão de documentos externos como futuro. | Documentos externos estão implementados via `AtlasExternalDocumentParser`, `AtlasRagService` e `AtlasRagRepository`, com suporte a PDF, Office moderno e formatos textuais. |
| Biblioteca local | O resumo usava "parcial" sem delimitar o que faltava. | A biblioteca local está descrita como funcional para modelos GGUF locais; o que permanece planejado é busca real em Hugging Face e download automatizado de modelos de chat. |

## Execução local e ajuste dinâmico

- A execução local usa `AtlasLocalEngineService` para iniciar o `llama-server` com `--ctx-size` derivado de `model.parameters.contextWindow`.
- Em modo automático, quando o backend retorna overflow de contexto, `LocalApiService` calcula a janela necessária, limita o crescimento ao teto local e salva o novo `contextWindow` no modelo.
- Após salvar contexto dinâmico, a engine local é reiniciada com o motivo `parameter-update`; as mensagens exibidas deixam claro que o reinício está aplicando o novo contexto.
- Os logs registram o cálculo, a persistência, o início do reinício e a engine pronta com os novos valores.

## Persistência do RAG

- Base ChromaDB: `context.globalStorageUri/rag/chroma/`.
- Manifesto dos projetos e fontes: `context.globalStorageUri/rag/index-manifest.json`.
- Modelo ativo e pasta de embeddings: `rag.embeddingModel` e `rag.embeddingModelsDir` na configuração do ATLAS.
- Quando nenhuma pasta é escolhida, downloads de embeddings usam `context.globalStorageUri/rag/embedding-models/`.
- Uma coleção é mantida por projeto, com nome derivado de um `projectId` estável.
- A reconstrução utiliza uma coleção temporária e só substitui a coleção ativa após concluir a indexação.
- A tela RAG solicita o estado inicial ao backend, mas erro ou timeout nessa consulta remove o loading e mantém as configurações acessíveis.

## Limitações atuais

- Alterações em arquivos são detectadas, mas a atualização automática ainda reconstrói todo o índice do projeto.
- Formatos legados binarios do Office (`.doc`, `.xls`, `.ppt`) ainda nao possuem extrator dedicado; use `.docx`, `.xlsx` e `.pptx`.
- O empacotamento validado atualmente tem como alvo `win32-x64`.
- O chunking é textual por caracteres e linhas; chunking orientado a símbolos permanece como evolução.
