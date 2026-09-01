# Resumo de Status Arquitetural

Atualizado em 15 de agosto de 2026 com base na implementação presente no repositório.

Para o fluxo detalhado de ajuste automático da janela local, indexação RAG e funcionamento dos embeddings, consulte [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).

Para o fluxo de alteração do arquivo aberto, incluindo decisão de intenção, plano JSON, prévia em diff e confirmação, consulte [Processo de refatoração e edição aplicada](processo-refatoracao-edicao-aplicada-atlas.md).

## Documentação de processos

- [Fluxo completo de geração de resposta](processo-geracao-resposta-atlas.md)
- [Refatoração e edição aplicada](processo-refatoracao-edicao-aplicada-atlas.md)
- [Montagem de prompt e resolução de modo](processo-prompts-modos-atlas.md)
- [Sistema de configuração](processo-configuracao-atlas.md)
- [Análise rápida](processo-analise-rapida-atlas.md)
- [Execução local e lifecycle da engine](processo-engine-local-atlas.md)
- [Configuração automática da engine](processo-configuracao-automatica-engine-atlas.md)
- [Integração cloud](processo-integracao-cloud-atlas.md)
- [Sessões, histórico e resumo](processo-sessoes-historico-resumo-atlas.md)
- [Build, empacotamento e distribuição](processo-build-empacotamento-distribuicao-atlas.md)
- [Contexto, janela local, RAG e embeddings](processos-contexto-rag-atlas.md)
- [Repositório de modelos](processo-repositorio-modelos-atlas.md)

| Componente                               | Status atual                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extensão VS Code                         | Implementada                                                                                                                                                     |
| Webview de chat                          | Implementada, incluindo input com autosize, loading por sessão, restauração de geração em andamento e cancelamento por `generationId`                            |
| Painel de provedores em nuvem            | Implementado                                                                                                                                                     |
| Painel de configurações gerais           | Implementado, incluindo perfis de contexto, execução local, refatoração, decisão de intenção pelo modelo, análise estática, ajuste automático de contexto e restauração de padrões |
| Biblioteca local de modelos              | Implementada para descoberta, seleção, parâmetros, comportamento, metadados, exclusão e controles de engine; recebe modelos GGUF baixados pelo repositório        |
| Repositório visual de modelos            | Implementado com busca no Hugging Face, filtros LLM/embedding, detalhes, variantes, diagnóstico de hardware e download GGUF/ONNX                                |
| Integração cloud                         | Implementada com modo de compatibilidade para parâmetros obrigatórios, limite dinâmico de tokens e adaptação de parâmetros opcionais em providers OpenAI-compatible |
| Provedores customizados                  | Implementados                                                                                                                                                    |
| Secret Storage                           | Implementado                                                                                                                                                     |
| `AtlasInferenceService`                  | Implementado                                                                                                                                                     |
| `CloudApiService`                        | Implementado                                                                                                                                                     |
| `LocalApiService`                        | Implementado com chamadas locais OpenAI-compatible, streaming, timeout, tratamento de overflow de contexto e ajuste dinâmico de `contextWindow`                  |
| `AtlasLocalEngineService`                | Implementado com seleção de engine CPU/CUDA/Vulkan, `llama-server`, reinício para aplicar novos parâmetros, status na Webview e logs operacionais                |
| `AtlasEngineDownloadService`             | Implementado com detecção automática CPU/CUDA/Vulkan, download do release mais recente do `llama.cpp`, extração, validação e DLLs CUDA complementares            |
| `AtlasLocalModelDiscoveryService`        | Implementado                                                                                                                                                     |
| Execução local `llama.cpp`               | Implementada                                                                                                                                                     |
| CPU/CUDA/Vulkan                          | Implementado com seleção manual e preparação automática por hardware                                                                                              |
| Sessões de chat                          | Implementadas                                                                                                                                                    |
| Histórico persistido                     | Implementado                                                                                                                                                     |
| Resumo arquitetural                      | Implementado                                                                                                                                                     |
| Streaming                                | Implementado para OpenAI-compatible e local; fallback em Claude/Gemini                                                                                           |
| Cancelamento de geração                  | Implementado com alvo por sessão e `generationId`, cobrindo resposta textual, análise rápida e edição aplicada                                                   |
| `ChatResponseController`                 | Implementado com snapshots de gerações ativas por sessão, cancelamento direcionado, RAG e desvios para análise rápida ou edição aplicada                         |
| `AtlasCodeEditController`                | Implementado com guardas determinísticas, heurística local, classificação opcional pelo modelo, validação de hash e controle de cancelamento                    |
| `AtlasCodeEditService`                   | Implementado com plano JSON por linhas, validação de intervalos, prévia em diff, confirmação humana e aplicação via `vscode.WorkspaceEdit`                      |
| Edição aplicada pelo chat                | Implementada para o arquivo ou seleção atual, sem resposta textual redundante após a conclusão                                                                    |
| Refatoração guiada por análise           | Implementada a partir de resposta arquitetural elegível, com verificação de URI e hash SHA-256 do arquivo                                                        |
| `AtlasPromptModeResolver`                | Implementado com heurística pontuada para os modos desenvolvedor, arquitetural e análise rápida                                                                  |
| `AtlasSystemPromptPolicyService`         | Implementado com prompts especializados, análise arquitetural em oito tópicos e política JSON para análise rápida                                                |
| `AtlasQuickAnalysisService`              | Implementado com numeração de linhas, contexto estrutural opcional, extração de JSON e normalização dos achados                                                  |
| `AtlasQuickAnalysisController`           | Implementado com origem da execução, `sessionId`, sanitização de linhas, decorações por severidade e estado por documento                                        |
| Análise rápida com marcações             | Implementada via botão e intenção textual no chat                                                                                                                |
| `AtlasDocumentStructureService`          | Implementado com símbolos, diagnósticos e referências fornecidos pelo VS Code                                                                                    |
| Análise estática estrutural              | Implementada como contexto auxiliar configurável para análises rápida, arquitetural e refatoração                                                                |
| Persistência visual das marcações        | Implementada por documento durante a sessão                                                                                                                      |
| RAG local                                | Implementado para projetos e workspaces                                                                                                                          |
| `AtlasRagService`                        | Implementado: scanner, chunking, indexação, watchers, recuperação, filtros e orçamento de contexto                                                               |
| ChromaDB                                 | Implementado com binding nativo empacotado e processo local gerenciado pela extensão                                                                             |
| `AtlasChromaService`                     | Implementado com porta dinâmica, heartbeat, persistência e encerramento do processo auxiliar                                                                     |
| Embeddings locais                        | Implementados com Transformers.js, pasta configurável, seletor, download do modelo padrão e vetores normalizados                                                 |
| `AtlasEmbeddingModelDiscoveryService`    | Implementado para descobrir modelos empacotados, modelos em pasta escolhida pelo usuário e baixar o modelo padrão                                                |
| Runtime local de embeddings              | Implementado com preparação por target, instalação de opcionais, recuperação de nativos ONNX/Sharp ausentes e poda de plataformas não distribuídas                |
| `AtlasRagRepository`                     | Implementado com coleções Chroma e manifesto JSON persistente                                                                                                    |
| Indexação do workspace atual             | Implementada                                                                                                                                                     |
| Indexação de pasta escolhida             | Implementada                                                                                                                                                     |
| Progresso da indexação                   | Implementado por etapa, arquivos e chunks, com cancelamento                                                                                                      |
| Tela RAG                                 | Implementada com status da base vetorial no topo, projetos indexados em destaque, materiais complementares funcionais e loading inicial não bloqueante                |
| Atualização automática                   | Implementada por watcher e debounce; usa modo configurável completo ou incremental                                                                               |
| Recuperação semântica no chat            | Implementada com fontes, relevância, filtros e limite de contexto; pode apoiar edições quando `rag.useInCodeEditing` está habilitado                            |
| Configurações de indexação               | Implementadas, incluindo modo completo/incremental, Markdown e JSON/configuração como opções independentes                                                       |
| Configurações de recuperação             | Implementadas: distância/relevância, diversidade, limite por arquivo, linguagem, diretório e prioridade                                                          |
| Materiais complementares no RAG               | Implementados com ingestão, listagem, exclusão e recuperação semântica em coleção externa por workspace e modelo de embeddings                                   |
| Hugging Face API para busca de modelos   | Implementada para LLMs GGUF e embeddings ONNX compatíveis                                                                                                        |
| Download automatizado de modelos de chat | Implementado para variantes GGUF compatíveis, com progresso, cancelamento, descoberta local e atualização da biblioteca                                          |

## Mapa de defasagens corrigidas

| Área documentada              | Situação anterior na documentação                                                                      | Estado atual mapeado                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto local automático     | A documentação descrevia apenas aumento do tamanho de contexto quando a engine rejeitava a requisição. | A opção automática em Configurações Gerais ajusta e salva apenas o `contextWindow` do modelo local para comportar o contexto enviado.                                        |
| Reinício da engine local      | O fluxo de reinício era tratado como inicialização genérica.                                           | Quando o contexto dinâmico é salvo, a engine é reiniciada com motivo explícito de atualização de parâmetros, mensagens próprias na UI e logs com modelo, engine e contexto.  |
| Diagramas de inferência local | `LocalApiService` aparecia com responsabilidades antigas e sem o retry por overflow.                   | Os diagramas passam a representar detecção de overflow, persistência do novo `contextWindow` e reinício do `llama-server` antes do reenvio da requisição.                    |
| Materiais complementares no RAG    | Parte dos diagramas ainda marcava ingestão de materiais complementares como futuro.                         | Materiais complementares estão implementados via `AtlasExternalDocumentParser`, `AtlasRagService` e `AtlasRagRepository`, com suporte a PDF, Office moderno e formatos textuais.  |
| Biblioteca local              | O resumo usava "parcial" sem delimitar o que faltava.                                                  | A biblioteca local está descrita como funcional para modelos GGUF locais e integrada ao repositório visual de modelos.                                                     |
| Repositório de modelos        | Diagramas e status ainda marcavam busca/download Hugging Face como futuro.                              | Busca, detalhes, filtros LLM/embedding e download GGUF/ONNX estão documentados como implementados.                                                                        |
| Engine local                  | A distribuição ainda era descrita como dependente de configuração externa manual do `llama-server`.      | A engine continua fora do VSIX, mas o ATLAS baixa e valida `llama.cpp` automaticamente em runtime.                                                                         |
| RAG incremental               | Algumas notas antigas diziam que a atualização automática sempre reconstruía o índice completo.         | A indexação incremental é o default e só cai para `full` quando metadados, coleção ou configuração exigem reconstrução.                                                    |
| Refatoração e edição aplicada | A funcionalidade aparecia apenas em trechos dos documentos de geração, prompts e configuração.           | O fluxo agora possui documento próprio, entradas no README e no status arquitetural, eventos, configurações, limitações e diagramas atualizados.                             |
| Decisão de intenção           | Não havia visão consolidada das guardas, da heurística e da classificação opcional pelo modelo.          | A ordem das guardas, o fallback para heurística e os níveis de confiança aceitos estão documentados.                                                                         |
| RAG em edição                 | `rag.useInCodeEditing` estava implementado, mas ausente dos documentos de configuração e recuperação.    | A opção, o default `false` e as permissões de destino local/cloud foram adicionados aos processos relacionados.                                                               |
| Usabilidade do chat           | A documentação descrevia uma geração ativa única e cancelamento genérico.                               | Respostas, análise rápida e edição aplicada agora são serializadas como `activeGenerations` por sessão, com `generationId` para restauração visual e cancelamento direcionado. |
| Restauração de padrões        | A ação de UI não estava documentada.                                                                     | `restaurarConfiguracoesAtlas` restaura defaults gerais sem apagar provedores, chaves, modelos, índices RAG ou histórico.                                                     |
| Compatibilidade cloud         | O modo de enviar apenas parâmetros obrigatórios e os retries OpenAI-compatible estavam pouco detalhados. | `sendOnlyRequiredParameters`, `limitPayload`, `dynamicMaxTokens` e a adaptação entre `max_tokens`/`max_completion_tokens` foram documentados.                                  |
| Runtime de embeddings         | O build descrevia apenas instalação e poda do runtime.                                                   | A preparação agora documenta `--include=optional`, recuperação via `npm pack` e validação de ONNX Runtime e Sharp por target.                                                   |

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

- Formatos legados binários do Office (`.doc`, `.xls`, `.ppt`) ainda não possuem extrator dedicado; use `.docx`, `.xlsx` e `.pptx`.
- O empacotamento e a distribuição são por target: `win32-x64`, `linux-x64` e `linux-arm64` possuem VSIX separados; não há pacote universal Windows+Linux.
- O chunking é textual por caracteres e linhas; chunking orientado a símbolos permanece como evolução.
- A edição aplicada altera somente o arquivo aberto, usa intervalos de linhas inteiras e não executa automaticamente testes, build ou lint após a confirmação.
