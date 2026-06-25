# Resumo de Status Arquitetural

Atualizado em 25 de junho de 2026 com base na implementação presente no repositório.

| Componente | Status atual |
| --- | --- |
| Extensão VS Code | Implementada |
| Webview de chat | Implementada |
| Painel de provedores em nuvem | Implementado |
| Painel de configurações gerais | Implementado |
| Biblioteca local de modelos | Implementada parcialmente |
| Repositório visual de modelos | Implementado com dados estáticos |
| Integração cloud | Implementada |
| Provedores customizados | Implementados |
| Secret Storage | Implementado |
| `AtlasInferenceService` | Implementado |
| `CloudApiService` | Implementado |
| `LocalApiService` | Implementado |
| `AtlasLocalEngineService` | Implementado |
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
| Modo estudo | Implementado |
| RAG local | Implementado para projetos e workspaces |
| `AtlasRagService` | Implementado: scanner, chunking, indexação, watchers, recuperação, filtros e orçamento de contexto |
| ChromaDB | Implementado com binding nativo empacotado e processo local gerenciado pela extensão |
| `AtlasChromaService` | Implementado com porta dinâmica, heartbeat, persistência e encerramento do processo auxiliar |
| Embeddings locais | Implementados com Transformers.js, modelo local quantizado e vetores normalizados de 384 dimensões |
| `AtlasRagRepository` | Implementado com coleções Chroma e manifesto JSON persistente |
| Indexação do workspace atual | Implementada |
| Indexação de pasta escolhida | Implementada |
| Progresso da indexação | Implementado por etapa, arquivos e chunks, com cancelamento |
| Atualização automática | Implementada por watcher e debounce; atualmente reindexa o projeto completo |
| Recuperação semântica no chat | Implementada com fontes, relevância, filtros e limite de contexto |
| Configurações de indexação | Implementadas, incluindo Markdown e JSON/configuração como opções independentes |
| Configurações de recuperação | Implementadas: distância/relevância, diversidade, limite por arquivo, linguagem, diretório e prioridade |
| Documentos externos no RAG | Interface e filtro preparados; ingestão de arquivos externos ainda não implementada |
| Hugging Face API para busca de modelos | Planejada |
| Download automatizado de modelos de chat | Planejado |
| Backend Python | Não corresponde à implementação atual |

## Persistência do RAG

- Base ChromaDB: `context.globalStorageUri/rag/chroma/`.
- Manifesto dos projetos e fontes: `context.globalStorageUri/rag/index-manifest.json`.
- Uma coleção é mantida por projeto, com nome derivado de um `projectId` estável.
- A reconstrução utiliza uma coleção temporária e só substitui a coleção ativa após concluir a indexação.

## Limitações atuais

- Alterações em arquivos são detectadas, mas a atualização automática ainda reconstrói todo o índice do projeto.
- A ingestão real de PDFs e outros documentos externos ainda não está disponível.
- O empacotamento validado atualmente tem como alvo `win32-x64`.
- O chunking é textual por caracteres e linhas; chunking orientado a símbolos permanece como evolução.
