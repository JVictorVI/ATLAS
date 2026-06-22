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
| `AtlasQuickAnalysisService`       | Implementado com numeração de linhas, contexto estrutural opcional, extração de JSON e normalização dos achados |
| `AtlasQuickAnalysisController`    | Implementado com origem da execução, `sessionId`, sanitização de linhas, decorações por severidade e estado por documento |
| Análise rápida com marcações      | Implementada via botão e via intenção textual no chat                  |
| `AtlasDocumentStructureService`   | Implementado com coleta de símbolos, diagnósticos e referências fornecidos pelo VS Code |
| Análise estática estrutural       | Implementada como contexto auxiliar configurável para análise rápida e arquitetural |
| Fallback da análise estrutural    | Implementado; mantém a análise textual quando o provedor da linguagem não fornece símbolos |
| Relações entre símbolos           | Implementadas opcionalmente, com consulta limitada aos primeiros 30 símbolos relevantes |
| Persistência visual das marcações | Implementada por documento durante a sessão; restaura ao alternar editores e invalida ao editar o arquivo |
| Limpeza de marcações              | Implementada por ação dedicada na Webview de chat                      |
| Feedback detalhado dos achados    | Implementado no hover com observação, impacto e sugestão de melhoria   |
| Modo estudo                       | Implementado                                                           |
| RAG                               | Planejado                                                              |
| ChromaDB                          | Planejado                                                              |
| Embeddings                        | Planejado                                                              |
| Indexação do projeto              | Planejada                                                              |
| Documentos externos no RAG        | Planejado                                                              |
| Hugging Face API                  | Planejada                                                              |
| Download automatizado de modelos  | Planejado                                                              |
| Backend Python                    | Não corresponde à implementação atual                                  |
