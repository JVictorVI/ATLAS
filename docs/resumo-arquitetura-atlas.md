## Resumo de Status Arquitetural

| Componente                        | Status atual                                                           |
| --------------------------------- | ---------------------------------------------------------------------- |
| Extensão VS Code                  | Implementada                                                           |
| Webview de chat                   | Implementada                                                           |
| Painel de provedores em nuvem     | Implementado                                                           |
| Painel de configurações gerais    | Implementado                                                           |
| Biblioteca local de modelos       | Implementada parcialmente                                              |
| Repositório visual de modelos     | Implementado com dados estáticos                                       |
| Integração cloud                  | Implementada                                                           |
| Provedores customizados           | Implementados                                                          |
| Secret Storage                    | Implementado                                                           |
| `AtlasInferenceService`           | Implementado                                                           |
| `CloudApiService`                 | Implementado                                                           |
| `LocalApiService`                 | Implementado                                                           |
| `AtlasLocalEngineService`         | Implementado                                                           |
| `AtlasLocalModelDiscoveryService` | Implementado                                                           |
| Execução local `llama.cpp`        | Implementada                                                           |
| CPU/CUDA/Vulkan                   | Implementado conforme binários disponíveis                             |
| Sessões de chat                   | Implementadas                                                          |
| Histórico persistido              | Implementado                                                           |
| Resumo arquitetural               | Implementado                                                           |
| Streaming                         | Implementado para OpenAI-compatible e local; fallback em Claude/Gemini |
| Cancelamento de geração           | Implementado                                                           |
| Análise rápida com marcações      | Implementada                                                           |
| Modo estudo                       | Implementado                                                           |
| RAG                               | Planejado                                                              |
| ChromaDB                          | Planejado                                                              |
| Embeddings                        | Planejado                                                              |
| Indexação do projeto              | Planejada                                                              |
| Documentos externos no RAG        | Planejado                                                              |
| Hugging Face API                  | Planejada                                                              |
| Download automatizado de modelos  | Planejado                                                              |
| Backend Python                    | Não corresponde à implementação atual                                  |
