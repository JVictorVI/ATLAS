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
| `ChatResponseController`          | Implementado com snapshot de geração ativa, cancelamento e delegação para análise rápida via chat |
| `AtlasPromptModeResolver`         | Implementado com heurística pontuada para modo desenvolvedor, arquitetural e análise rápida |
| `AtlasSystemPromptPolicyService`  | Implementado com prompts especializados, análise arquitetural em 8 tópicos e política JSON para análise rápida |
| `AtlasQuickAnalysisService`       | Implementado com numeração de linhas, extração de JSON e normalização de severidade/categoria |
| `AtlasQuickAnalysisController`    | Implementado com origem da execução, `sessionId`, sanitização de linhas e decorações por severidade |
| Análise rápida com marcações      | Implementada via botão e via intenção textual no chat                  |
| Modo estudo                       | Implementado                                                           |
| RAG                               | Planejado                                                              |
| ChromaDB                          | Planejado                                                              |
| Embeddings                        | Planejado                                                              |
| Indexação do projeto              | Planejada                                                              |
| Documentos externos no RAG        | Planejado                                                              |
| Hugging Face API                  | Planejada                                                              |
| Download automatizado de modelos  | Planejado                                                              |
| Backend Python                    | Não corresponde à implementação atual                                  |
