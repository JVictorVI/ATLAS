# Casos de Uso e Diagramas PlantUML - ATLAS

Atualizado em 15 de agosto de 2026.

Este arquivo contém os casos de uso e os diagramas PlantUML atualizados com base na implementação atual do ATLAS.
Os blocos podem ser copiados diretamente para o PlantText ou para uma extensão PlantUML compatível com UTF-8.

> **Nota de atualização:** a arquitetura atual do ATLAS é uma extensão do VS Code implementada em TypeScript. O ponto central de inferência é o `AtlasInferenceService`, que decide entre execução em nuvem e execução local. O projeto possui sessões, histórico, resumo de conversas, modelos `.gguf`, análise rápida, contexto estrutural do VS Code, edição aplicada com prévia e confirmação, refatoração guiada por análise, RAG local, materiais complementares no RAG, busca real no Hugging Face, download de modelos GGUF/ONNX e preparação automática da engine `llama.cpp`. Em execução local, o ajuste automático de contexto recalcula e salva apenas a janela de contexto quando a requisição não cabe na configuração atual.

## Pontos atualizados na versão 1.7

- `AtlasCodeEditController` representa guardas determinísticas, heurística local, classificação opcional de intenção pelo modelo e validação do arquivo analisado por URI e hash.
- `AtlasCodeEditService` representa o plano JSON por linhas, a prévia via `vscode.diff`, a confirmação humana e a aplicação com `vscode.WorkspaceEdit`.
- O UC020 cobre tanto a edição direta pedida no chat quanto a refatoração guiada por uma análise arquitetural.
- A configuração passa a incluir `custom.refactoring`, `custom.staticAnalysis.useInRefactoring` e `rag.useInCodeEditing`.

## Pontos atualizados na versão 1.6

- A seção de Configurações Gerais passou a tratar **Contexto local**, refletindo que o modo automático ajusta `contextWindow`.
- `LocalApiService` detecta overflow de contexto da engine local, calcula a janela necessária para entrada mais saída, persiste o novo `contextWindow` no modelo e reenvia a requisição após reiniciar a engine.
- `AtlasLocalEngineService` diferencia primeira inicialização de reinício para aplicar parâmetros, com mensagens específicas na Webview e logs estruturados do processo.
- Materiais complementares no RAG deixam de ser evolução nos diagramas: a ingestão, listagem, exclusão e recuperação semântica estão implementadas.
- O mapa arquitetural removeu responsabilidades obsoletas de `LocalApiService`, como `isAbortError` público e dependência direta da descoberta de modelos.
- Busca no Hugging Face, detalhes de modelos, filtros LLM/embedding e download GGUF/ONNX passam a aparecer como fluxos implementados.
- `AtlasEngineDownloadService` representa a escolha automática CPU/CUDA/Vulkan e o download do release atual do `llama.cpp`.

## Pontos atualizados na versão 1.5

- RAG local integrado ao fluxo de resposta do chat, com fontes persistidas nas mensagens.
- ChromaDB iniciado automaticamente em porta local dinâmica e persistido no `globalStorageUri`.
- Indexação do workspace atual ou de pasta selecionada, com coleção independente por projeto.
- Barra de progresso por arquivos e chunks, cancelamento, reindexação e exclusão da base.
- Configurações de indexação e recuperação, incluindo controles separados para Markdown e JSON/configurações.
- Watcher e debounce implementados; a atualização automática usa o modo configurado e o default atual é incremental.
- Recuperação com distância/relevância, diversidade, filtros por linguagem/diretório, prioridade de fonte e orçamento de contexto.
- Tela RAG com status da base vetorial no topo, projetos indexados em destaque, materiais complementares funcionais e carregamento inicial não bloqueante.
- Seleção de modelos de embeddings por pasta configurável, com atualização ao abrir o seletor e download do modelo padrão quando necessário.

## Pontos atualizados na versão 1.4

- `AtlasDocumentStructureService` coleta símbolos hierárquicos e intervalos de linha pelo comando `vscode.executeDocumentSymbolProvider`, resume diagnósticos publicados no editor e pode consultar referências externas com `vscode.executeReferenceProvider`.
- A coleta estrutural possui fallback explícito para o conteúdo textual quando a extensão da linguagem não oferece símbolos ou quando ocorre falha na consulta.
- A tela **Configurações Gerais** permite ativar globalmente a análise estática e escolher seu uso na Análise Rápida e na Análise Arquitetural, além da inclusão opcional de diagnósticos e relações entre símbolos.
- `ChatResponseController` recompõe o prompt arquitetural com o contexto estrutural quando o modo resolvido é `architectural-analysis` e a opção correspondente está habilitada.
- `AtlasQuickAnalysisService` usa a estrutura como evidência auxiliar, solicita cobertura completa do arquivo e normaliza também os campos `impact` e `suggestion`.
- `AtlasQuickAnalysisController` mantém achados por documento, restaura as decorações ao alternar editores, invalida marcações quando o texto muda e oferece limpeza manual pela Webview.
- O hover das marcações passou a separar observação, impacto e sugestão, deixando explícito que a recomendação deve ser validada no contexto do projeto.

## Pontos consolidados da versão 1.3

- `AtlasPromptModeResolver` passou a decidir entre `developer-assistant`, `architectural-analysis` e `quick-analysis` por uma heurística pontuada, combinando frases explícitas, sinais arquiteturais fortes, termos contextuais, intenção de análise e termos de desenvolvimento.
- `AtlasSystemPromptPolicyService` agora define um prompt arquitetural obrigatório em 8 tópicos Markdown, um prompt de análise rápida com taxonomia de categorias/severidades e regras rígidas para saída JSON, além de orientações para não transformar respostas comuns em análise formal.
- `ChatMessageRouter` serializa `activeGenerations` combinando resposta textual, análise rápida e edição aplicada por sessão; a Webview usa `generationId` para restaurar loading parcial e ignorar eventos atrasados de gerações canceladas.
- `AtlasQuickAnalysisService` numera o arquivo antes de enviar ao modelo, força o modo `quick-analysis`, extrai arrays JSON mesmo quando há texto extra e normaliza aliases de severidade e categoria.
- `AtlasQuickAnalysisController` aceita origem da execução (`button` ou `chat`), propaga `sessionId` para a Webview, sanitiza intervalos de linha, limpa decorações quando não há achados e aplica cores/hover por severidade.

## 1. Diagrama de Casos de Uso

```plantuml
@startuml
left to right direction
skinparam packageStyle rectangle
skinparam shadowing false

actor "Usuário" as Usuario
actor "Provedor Cloud" as ProvedorCloud
actor "llama-server local" as LlamaServer
actor "VS Code SecretStorage" as SecretStorage
actor "Provedores de Linguagem do VS Code" as LanguageProviders
actor "Sistema de Arquivos Local" as FileSystem
actor "Hugging Face Model Hub" as RepoModelos
actor "ChromaDB local" as BaseVetorial

rectangle "ATLAS - Extensão VS Code" {
  usecase "Perguntar sobre o código" as UC001
  usecase "Executar análise rápida" as UC002
  usecase "Solicitar análise arquitetural" as UC003
  usecase "Ativar modo estudo" as UC004
  usecase "Gerenciar chaves de API" as UC005
  usecase "Selecionar provedor e modelo cloud" as UC006
  usecase "Alternar execução local ou cloud" as UC007
  usecase "Configurar execução, contexto e segurança" as UC008
  usecase "Personalizar comportamento" as UC009
  usecase "Gerenciar biblioteca local" as UC010
  usecase "Navegar pelos painéis" as UC011
  usecase "Gerenciar sessões" as UC012
  usecase "Executar inferência local" as UC013
  usecase "Descobrir modelos GGUF" as UC014
  usecase "Indexar projeto com RAG" as UC015
  usecase "Pesquisar modelos no Hugging Face" as UC016
  usecase "Baixar modelo GGUF ou ONNX" as UC017
  usecase "Gerenciar materiais complementares" as UC018
  usecase "Configurar análise estrutural" as UC019
  usecase "Aplicar edição direta" as UC020

  usecase "Coletar contexto do editor" as INC_Contexto
  usecase "Montar prompt" as INC_Prompt
  usecase "Resolver modo de resposta" as INC_Modo
  usecase "Consultar inferência" as INC_Inferencia
  usecase "Persistir configuração" as INC_Config
  usecase "Persistir histórico" as INC_Historico
  usecase "Aplicar decorações no editor" as INC_Decoracoes
  usecase "Coletar símbolos, diagnósticos e referências" as INC_Estrutura
}

Usuario --> UC001
Usuario --> UC002
Usuario --> UC003
Usuario --> UC004
Usuario --> UC005
Usuario --> UC006
Usuario --> UC007
Usuario --> UC008
Usuario --> UC009
Usuario --> UC010
Usuario --> UC011
Usuario --> UC012
Usuario --> UC013
Usuario --> UC014
Usuario --> UC015
Usuario --> UC016
Usuario --> UC017
Usuario --> UC018
Usuario --> UC019
Usuario --> UC020

UC001 ..> INC_Contexto : <<include>>
UC001 ..> INC_Prompt : <<include>>
UC001 ..> INC_Inferencia : <<include>>
UC001 ..> INC_Historico : <<include>>
UC002 ..> INC_Contexto : <<include>>
UC002 ..> INC_Prompt : <<include>>
UC002 ..> INC_Inferencia : <<include>>
UC002 ..> INC_Decoracoes : <<include>>
UC002 ..> INC_Estrutura : <<include>>
UC003 ..> UC001 : <<extend>>
UC003 ..> INC_Estrutura : <<include>>
UC020 ..> UC001 : <<extend>>
UC020 ..> UC003 : <<extend>>
UC020 ..> INC_Contexto : <<include>>
UC020 ..> INC_Inferencia : <<include>>
UC020 ..> INC_Historico : <<include>>
UC020 ..> INC_Estrutura : <<include>> opcional
UC004 ..> INC_Config : <<include>>
UC005 ..> INC_Config : <<include>>
UC006 ..> INC_Config : <<include>>
UC007 ..> INC_Config : <<include>>
UC008 ..> INC_Config : <<include>>
UC019 ..> INC_Config : <<include>>
UC019 ..> INC_Estrutura : <<configure>>
UC009 ..> INC_Prompt : <<include>>
UC010 ..> INC_Config : <<include>>
UC012 ..> INC_Historico : <<include>>
UC013 ..> INC_Inferencia : <<include>>
UC014 ..> UC010 : <<include>>
INC_Prompt ..> INC_Modo : <<include>>

ProvedorCloud --> INC_Inferencia
LlamaServer --> UC013
SecretStorage --> UC005
LanguageProviders --> INC_Estrutura
FileSystem --> UC014
FileSystem --> UC013
FileSystem --> UC020

UC015 --> BaseVetorial
UC016 ..> RepoModelos : <<include>>
UC017 ..> RepoModelos : <<include>>
UC017 ..> FileSystem : <<include>>
UC018 ..> BaseVetorial : <<include>>
@enduml
```

## 2. Diagrama de Classes - Visão Geral da Extensão

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0
skinparam packageStyle rectangle

package "Entrada VS Code" {
  class "extension.ts" as ExtensionEntry <<entrypoint>>
  class ChatViewProvider {
    +resolveWebviewView(webviewView)
    +dispose()
  }
}

package "Interface / Webview" {
  class ChatPanelManager {
    +setInitialHtml(webview, selectedView)
    +openPanel(selectedView)
    +getHtmlForWebview(webview, selectedView)
  }

  class "src/webview/chat" as WebviewChat <<webview>>
  class "src/webview/atlas" as WebviewAtlas <<webview>>
  class "src/webview/api-keys" as WebviewApiKeys <<webview>>
  class "src/webview/library" as WebviewLibrary <<webview>>
  class "src/webview/rag" as WebviewRag <<webview>>
  class "src/webview/search" as WebviewSearch <<webview>>
}

package "Aplicação" {
  class ChatMessageRouter {
    +handle(data, webview)
    -handleSendQuestion(data, webview)
    -handleCancelGeneration(webview, target)
    -handleSelectMode(data, webview)
    -handleSelectModel(data, webview)
    -handleRestoreAtlasSettings(webview)
    -handleSearchHuggingFaceModels(data, webview)
    -handleDownloadHuggingFaceModel(data, webview)
    -handleDownloadConfiguredEngineRequest(webview)
    -handleArchitectureGuidedRefactor(data, webview)
  }

  class ChatResponseController {
    +handleSendQuestion(data, webview)
    +handleCancelGeneration(webview, target)
    +serializeActiveGenerations()
    -handleQuickAnalysisFromChat(sessionId, userContent, webview)
    -handleDirectCodeEdit(session, userContent, webview, signal)
    -notifyResponseCompletedIfAway(session)
  }

  class AtlasCodeEditController {
    +shouldApplyDirectEditRequest(userRequest, options)
    +executeDirectEdit(webview, options)
    +executeArchitectureGuidedEdit(webview, options)
    +cancelActiveEdit()
    +buildRefactorMetadata(editorContext)
    -assertDocumentStillMatches(editorContext, metadata)
    -classifyEditIntentWithModel(userRequest, options)
  }

  class AtlasCodeEditService {
    +applyEdit(request)
    +formatResultMessage(result)
    -parsePlan(raw)
    -validatePlan(plan, document)
    -previewAndConfirm(document, plan, signal)
    -applyLineEdits(document, edits)
  }

  class ChatSessionController {
    +handleCreateSession(data, webview)
    +handleSwitchSession(data, webview)
    +handleRenameSession(data, webview)
    +handleDeleteSession(data, webview)
    +handleListSessions(webview)
  }

  class ChatModelWebviewService {
    +sendModelsToWebview(webview)
    +sendLocalEngineHealth(webview)
  }
}

package "Contexto e Análise" {
  class AtlasEditorContextService {
    +getFullDocumentContext()
    +getChatEditorContext()
    +buildEditorAnalysisContext(context)
  }

  class AtlasQuickAnalysisController {
    +execute(webview, options)
    +clearDecorations(editor)
    +hasActiveDecorations()
    +clearActiveDecorations()
    +dispose()
    -restoreDecorations(editor)
    -sanitizeIssues(issues, lineCount)
    -applyDecorations(editor, issues)
    -buildHoverMessage(issue)
  }

  class AtlasQuickAnalysisService {
    +analyzeCode(document, code, languageId, fileName)
    -buildQuickAnalysisPrompt(code, structureSummary, languageId, fileName)
    -addLineNumbers(code)
    -parseIssues(raw)
    -normalizeSeverity(value)
    -normalizeCategory(value)
    -extractJsonArray(raw)
  }

  class AtlasDocumentStructureService {
    +collect(document)
    +buildSummary(structure)
    +buildDiagnosticsSummary(document)
    +buildSymbolRelationsSummary(document)
  }
}

package "Inferência" {
  class AtlasInferenceService {
    +sendChat(messages, onChunk, options)
    +isAbortError(error)
  }

  class CloudApiService {
    +sendChat(messages, onChunk, options)
    +getModelsForCurrentProvider()
  }

  class LocalApiService {
    +sendChat(messages, onChunk, options)
    -adjustDynamicContextWindow(model, overflow)
    -getContextOverflow(data)
  }

  class AtlasLocalEngineService {
    +ensureEngine(model, options)
    +stopEngine()
    +restartEngine(model, options)
    +isRunning()
    +getEnginesDir()
  }

  class AtlasEngineDownloadService {
    +ensureEngineDownloaded(onStatus)
    +ensureConfiguredEngineDownloaded(onStatus)
    +downloadEngine(engineType, onStatus)
    +isEngineDownloaded(engineType)
  }
}

package "Repositório de Modelos" {
  class HuggingFaceModelService {
    +searchModels(query, modelFilter, offset, limit)
    +getModelDetails(modelId)
    +downloadModel(model, fileName, onProgress, signal)
  }

  class HardwareDiagnosticService {
    +getHardwareInfo()
    +clearCache()
  }
}

package "RAG Local" {
  class AtlasRagService {
    +indexCurrentWorkspace(onProgress, signal)
    +indexSelectedFolder(folderUri, onProgress, signal)
    +indexProject(projectId, onProgress, signal)
    +retrieveContext(query, signal)
    +deleteProjectIndex(projectId)
  }

  class AtlasEmbeddingService {
    +embedDocuments(texts, signal)
    +embedQuery(text, signal)
  }

  class AtlasEmbeddingModelDiscoveryService {
    +refreshEmbeddingModels()
    +getModelsDir()
    +resolveActiveModel()
    +downloadDefaultEmbeddingModel()
  }

  class AtlasChromaService {
    +ensureReady()
    +getStatus()
    +stop()
  }

  class AtlasRagRepository {
    +listProjects()
    +upsertChunks(collection, chunks)
    +search(collection, embedding, topK)
    +deleteProject(projectId)
  }

  database "ChromaDB local" as ChromaDb
  artifact "index-manifest.json" as RagManifest
}

package "Prompts e Sessões" {
  class AtlasPromptAssemblyService {
    +buildMessages(input)
  }

  class AtlasPromptModeResolver {
    +resolve(input)
    -scoreTerms(question, terms, weight)
    -hasAnyTerm(question, terms)
    -normalize(text)
  }

  class AtlasSystemPromptPolicyService {
    +buildBaseSystemMessage(mode)
    -buildArchitecturalAnalysisMessage()
    -buildQuickAnalysisMessage()
    -buildStudyModeMessage()
    -buildDeveloperAssistantMessage()
  }

  class AtlasPromptCustomizationService {
    +getBehaviorConfig()
    +saveBehaviorConfig(input)
    +buildCustomizationBlock()
  }

  class AtlasSessionService {
    +createSession()
    +appendMessage(sessionId, message)
    +summarizeIfNeeded(sessionId)
  }
}

package "Configuração / Persistência" {
  class AtlasConfigManager
  class AtlasConfigRepository
  class AtlasHistoryRepository
  class ApiKeyManager
  class SecretStorageService
  class AtlasLocalModelDiscoveryService
  class AtlasModelRegistryService
}

ExtensionEntry --> ChatViewProvider : registra view
ChatViewProvider *-- ChatPanelManager
ChatViewProvider *-- ChatMessageRouter
ChatViewProvider *-- ChatResponseController
ChatViewProvider *-- AtlasCodeEditController
ChatViewProvider *-- AtlasCodeEditService
ChatViewProvider *-- ChatSessionController
ChatViewProvider *-- ChatModelWebviewService

ChatPanelManager --> WebviewChat : renderiza
ChatPanelManager --> WebviewAtlas : renderiza
ChatPanelManager --> WebviewApiKeys : renderiza
ChatPanelManager --> WebviewLibrary : renderiza
ChatPanelManager --> WebviewRag : renderiza
ChatPanelManager --> WebviewSearch : renderiza
WebviewChat --> ChatMessageRouter : postMessage
WebviewRag --> ChatMessageRouter : postMessage
WebviewSearch --> ChatMessageRouter : postMessage

ChatMessageRouter --> ChatResponseController
ChatMessageRouter --> ChatSessionController
ChatMessageRouter --> ChatModelWebviewService
ChatMessageRouter --> AtlasQuickAnalysisController
ChatMessageRouter --> AtlasCodeEditController : refatoração arquitetural
ChatMessageRouter --> ApiKeyManager
ChatMessageRouter --> AtlasConfigManager
ChatMessageRouter --> AtlasRagService : indexação e gestão
ChatMessageRouter --> HuggingFaceModelService : busca e download
ChatMessageRouter --> AtlasEngineDownloadService : baixar engine selecionada
ChatMessageRouter --> HardwareDiagnosticService : diagnóstico

ChatResponseController --> AtlasEditorContextService
ChatResponseController --> AtlasDocumentStructureService : análise arquitetural
ChatResponseController --> AtlasRagService : recuperar contexto
ChatResponseController --> AtlasPromptAssemblyService
ChatResponseController --> AtlasInferenceService
ChatResponseController --> AtlasSessionService
ChatResponseController --> AtlasQuickAnalysisController : modo quick-analysis
ChatResponseController --> AtlasCodeEditController : edição direta

AtlasCodeEditController --> AtlasEditorContextService
AtlasCodeEditController --> AtlasDocumentStructureService : refatoração
AtlasCodeEditController --> AtlasCodeEditService
AtlasCodeEditController --> AtlasConfigManager
AtlasCodeEditController --> AtlasInferenceService : classificar intenção
AtlasCodeEditService --> AtlasInferenceService : gerar plano JSON

AtlasQuickAnalysisController --> AtlasEditorContextService
AtlasQuickAnalysisController --> AtlasQuickAnalysisService
AtlasQuickAnalysisService --> AtlasPromptAssemblyService
AtlasQuickAnalysisService --> AtlasInferenceService
AtlasQuickAnalysisService --> AtlasDocumentStructureService

AtlasInferenceService --> CloudApiService : modo cloud
AtlasInferenceService --> LocalApiService : modo local
LocalApiService --> AtlasLocalEngineService
AtlasEngineDownloadService --> HardwareDiagnosticService

AtlasRagService --> AtlasEmbeddingService
AtlasEmbeddingService --> AtlasEmbeddingModelDiscoveryService
AtlasRagService --> AtlasChromaService
AtlasRagService --> AtlasRagRepository
AtlasRagRepository --> AtlasChromaService
AtlasRagRepository --> ChromaDb
AtlasRagRepository --> RagManifest

AtlasPromptAssemblyService --> AtlasPromptModeResolver
AtlasPromptAssemblyService --> AtlasSystemPromptPolicyService
AtlasPromptAssemblyService --> AtlasPromptCustomizationService
AtlasPromptAssemblyService --> AtlasSessionService

AtlasSessionService --> AtlasHistoryRepository
AtlasConfigManager --> AtlasConfigRepository
AtlasConfigManager --> AtlasModelRegistryService
AtlasLocalModelDiscoveryService --> AtlasModelRegistryService
ApiKeyManager --> SecretStorageService
@enduml
```

## 3. Diagrama de Classes - Configuração, Seleção e Persistência

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0
skinparam packageStyle rectangle

package "Gerência de Configuração" {
  class AtlasConfigManager {
    +getConfig()
    +saveConfig(config)
    +resetConfig()
    +setMode(mode)
    +setActiveLocalModel(modelId)
    +setSelectedCloudProvider(providerId)
    +setActiveCloudModel(modelId)
    +getAllProviders()
    +getLocalModels()
    +isStudyModeEnabled()
    +setStudyModeEnabled(enabled)
    +isRefactoringEnabled()
    +useModelIntentDetectionForCodeEditing()
    +getStaticAnalysisConfig()
    +isStaticAnalysisEnabledFor(mode)
  }

  class AtlasSettingsService {
    +updateCloudConfigs(settings)
    +updateRagSettings(settings)
    +updateLlmDefaults(defaults)
    +updateCustomRoot(customData)
  }

  class AtlasSelectionService {
    +getCurrentMode()
    +isCloudMode()
    +isLocalMode()
    +getResolvedSelectionForCurrentMode()
  }

  class AtlasProviderService {
    +getAllProviders()
    +getSelectedProvider()
    +addProvider(provider)
    +updateProvider(providerId, partialData)
    +removeProvider(providerId)
  }

  class AtlasModelRegistryService {
    +getAllModels()
    +getLocalModels()
    +upsertModel(model)
    +removeModel(modelId)
  }

  interface AtlasStaticAnalysisConfig {
    enabled
    useInQuickAnalysis
    useInArchitecturalAnalysis
    useInRefactoring
    includeDiagnostics
    includeSymbolRelations
  }

  interface AtlasRefactoringConfig {
    enabled
    useModelIntentDetection
  }

  interface AtlasRagSettings {
    enabled
    allowLocalContext
    allowCloudContext
    offlineOnly
    useInCodeEditing
  }
}

package "Persistência" {
  class AtlasConfigRepository {
    +load()
    +save(config)
    +reset()
  }

  class AtlasHistoryRepository {
    +load()
    +save(history)
  }

  class AtlasConfigDefaults {
    +createDefaultConfig()
    +mergeWithDefaults(partial)
  }

  database "config/atlas-config.json" as ConfigFile
  database "config/atlas-history.json" as HistoryFile
}

package "Sessões" {
  class AtlasSessionService {
    +createSession()
    +listSessions()
    +switchSession(sessionId)
    +appendMessage(sessionId, message)
    +summarizeIfNeeded(sessionId)
  }

  class ChatSessionController {
    +handleCreateSession(data, webview)
    +handleSwitchSession(data, webview)
    +handleRenameSession(data, webview)
    +handleDeleteSession(data, webview)
    +handleListSessions(webview)
  }
}

package "Segredos" {
  class ApiKeyManager {
    +addKey(webview)
    +editKey(provider, webview)
    +deleteKey(provider, webview)
    +listCredentials()
    +getRawKey(provider)
  }

  class SecretStorageService {
    +store(key, value)
    +get(key)
    +delete(key)
  }

  database "VS Code SecretStorage" as VSSecrets
}

AtlasConfigManager *-- AtlasSettingsService
AtlasConfigManager *-- AtlasSelectionService
AtlasConfigManager *-- AtlasProviderService
AtlasConfigManager *-- AtlasModelRegistryService
AtlasConfigManager --> AtlasConfigRepository
AtlasConfigManager ..> AtlasStaticAnalysisConfig
AtlasConfigManager ..> AtlasRefactoringConfig
AtlasConfigManager ..> AtlasRagSettings
AtlasConfigRepository --> AtlasConfigDefaults
AtlasConfigRepository --> ConfigFile : lê/grava

ChatSessionController --> AtlasSessionService
AtlasSessionService --> AtlasHistoryRepository
AtlasHistoryRepository --> HistoryFile : lê/grava

ApiKeyManager --> SecretStorageService
ApiKeyManager --> AtlasConfigManager
SecretStorageService --> VSSecrets : lê/grava
@enduml
```

## 4. Diagrama de Classes - Prompt e Integração com IA

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0
skinparam packageStyle rectangle

package "Prompt Layer" {
  class AtlasPromptAssemblyService {
    +buildMessages(input)
  }

  class AtlasPromptModeResolver {
    +resolve(input)
    -scoreTerms(question, terms, weight)
    -hasAnyTerm(question, terms)
    -normalize(text)
  }

  class AtlasSystemPromptPolicyService {
    +buildBaseSystemMessage(mode)
    -buildArchitecturalAnalysisMessage()
    -buildQuickAnalysisMessage()
    -buildStudyModeMessage()
    -buildDeveloperAssistantMessage()
  }

  class AtlasPromptCustomizationService {
    +getBehaviorConfig()
    +saveBehaviorConfig(input)
    +buildCustomizationBlock()
  }

  class AtlasSessionService {
    +getWindowMessages(session)
    +getMessagesToSummarize(session)
    +summarizeIfNeeded(sessionId)
  }
}

package "Inferência" {
  class AtlasInferenceService {
    +sendChat(messages, onChunk, options)
    +isAbortError(error)
  }

  class CloudApiService {
    +sendChat(messages, onChunk, options)
    +getModelsForCurrentProvider()
    -sendOpenAiCompatibleChat(...)
    -sendClaudeChat(...)
    -sendGeminiChat(...)
  }

  class LocalApiService {
    +sendChat(messages, onChunk, options)
    -sendLocalRequest(...)
    -adjustDynamicContextWindow(...)
    -readStreamingResponse(...)
    -getContextOverflow(...)
  }

  class AtlasLocalEngineService {
    +ensureEngine(model, options)
    +stopEngine()
    +restartEngine(model, options)
    +isRunning()
    -waitUntilReady()
  }
}

package "Configuração" {
  class AtlasConfigManager
  class ApiKeyManager
  class AtlasLocalModelDiscoveryService
}

package "Contexto Estrutural" {
  class AtlasDocumentStructureService {
    +collect(document)
    +buildSummary(structure)
    +buildDiagnosticsSummary(document)
    +buildSymbolRelationsSummary(document)
  }

  interface AtlasDocumentStructure
  interface AtlasCodeSymbol
}

package "Edição Aplicada" {
  class AtlasCodeEditController {
    +shouldApplyDirectEditRequest(userRequest, options)
    +executeDirectEdit(webview, options)
    +executeArchitectureGuidedEdit(webview, options)
  }

  class AtlasCodeEditService {
    +applyEdit(request)
    -buildEditMessages(request)
    -validatePlan(plan, document)
    -previewAndConfirm(document, plan, signal)
  }
}

package "Tipos" {
  enum AtlasPromptMode {
    developer-assistant
    architectural-analysis
    quick-analysis
    study-mode
  }

  interface ChatMessage
  interface AtlasCloudChatResponse
  interface AtlasLocalEngineHealth
  interface AtlasModelSummary
  interface AtlasCodeEditPlan
  interface AtlasCodeEditResult
}

AtlasPromptAssemblyService --> AtlasPromptModeResolver
AtlasPromptAssemblyService --> AtlasSystemPromptPolicyService
AtlasPromptAssemblyService --> AtlasPromptCustomizationService
AtlasPromptAssemblyService --> AtlasSessionService
AtlasPromptAssemblyService ..> ChatMessage
AtlasPromptAssemblyService ..> AtlasPromptMode

AtlasInferenceService --> AtlasConfigManager
AtlasInferenceService --> CloudApiService : cloud
AtlasInferenceService --> LocalApiService : local
CloudApiService --> AtlasConfigManager
CloudApiService --> ApiKeyManager
LocalApiService --> AtlasConfigManager
LocalApiService --> AtlasLocalEngineService
AtlasDocumentStructureService ..> AtlasDocumentStructure
AtlasDocumentStructureService ..> AtlasCodeSymbol

AtlasCodeEditController --> AtlasCodeEditService
AtlasCodeEditController --> AtlasInferenceService : classificar intenção
AtlasCodeEditController --> AtlasDocumentStructureService : contexto opcional
AtlasCodeEditController --> AtlasConfigManager
AtlasCodeEditService --> AtlasInferenceService : gerar plano
AtlasCodeEditService ..> AtlasCodeEditPlan
AtlasCodeEditService ..> AtlasCodeEditResult

CloudApiService ..> AtlasCloudChatResponse
CloudApiService ..> AtlasModelSummary
@enduml
```

## 5. Diagrama de Implantação - Visão Atual

```plantuml
@startuml
skinparam shadowing false
skinparam componentStyle rectangle
title ATLAS - Visão de Implantação Atual

node "Máquina do Desenvolvedor (Windows + VS Code)" as DevMachine {
  node "Visual Studio Code" as VSCode {
    component "ATLAS Extension (TypeScript)" as Extension
    component "Webviews chat / atlas / library / api-keys / rag" as Webviews
    component "Serviços da Extensão: ChatResponseController, AtlasCodeEditController, AtlasCodeEditService, AtlasInferenceService, AtlasSessionService, AtlasDocumentStructureService, AtlasRagService" as ExtensionServices
    database "VS Code SecretStorage" as SecretStorage
  }

  folder "Configuração Local" as LocalConfig {
    artifact "config/atlas-config.json" as ConfigJson
    artifact "config/atlas-history.json" as HistoryJson
  }

  folder "Modelos Locais" as LocalModels {
    artifact "Arquivos .gguf" as GgufModels
  }

  folder "Engines Locais" as LocalEngines {
    artifact "llama.cpp CPU / CUDA / Vulkan" as LlamaBins
  }

  node "Processo Local" as LocalProcess {
    component "llama-server 127.0.0.1:8080" as LlamaServer
  }

  folder "Runtime RAG Empacotado" as RagRuntime {
    artifact "chromadb-binding.node" as ChromaBinding
    artifact "Modelo atlas-embedding opcional no pacote" as BundledEmbedding
  }

  folder "Pasta configurável de embeddings" as EmbeddingFolder {
    artifact "Modelos Transformers.js / ONNX" as EmbeddingModels
  }

  folder "VS Code globalStorageUri/rag/embedding-models" as UserEmbeddingFolder {
    artifact "Modelo padrão baixado" as DownloadedEmbeddingModel
  }

  node "Processo ChromaDB Local" as ChromaProcess {
    component "chroma-runner.cjs 127.0.0.1:porta dinâmica" as ChromaRunner
  }

  folder "VS Code globalStorageUri/rag" as RagStorage {
    database "chroma/" as VectorDb
    artifact "index-manifest.json" as RagManifest
  }
}

cloud "Provedores de IA em Nuvem OpenAI-compatible / Claude / Gemini / xAI" as CloudProviders
cloud "Repositório de Modelos Hugging Face" as ModelRepository
cloud "GitHub Releases ggml-org/llama.cpp" as LlamaReleases

Webviews --> Extension : postMessage
Extension --> ExtensionServices : delega ações
ExtensionServices --> SecretStorage : consulta chaves
ExtensionServices --> ConfigJson : lê/grava configurações
ExtensionServices --> HistoryJson : lê/grava sessões e resumos
ExtensionServices --> GgufModels : descobre modelos locais
ExtensionServices --> VSCode : consulta símbolos, diagnósticos e referências
ExtensionServices --> LlamaBins : seleciona engine
ExtensionServices --> LlamaReleases : baixa engine recomendada/configurada
ExtensionServices --> LlamaServer : inicia/para e envia requisições
LlamaServer --> GgufModels : carrega modelo
ExtensionServices --> CloudProviders : inferência cloud
ExtensionServices --> ModelRepository : busca detalhes e baixa GGUF/ONNX
ExtensionServices --> GgufModels : grava modelos GGUF baixados
ExtensionServices --> EmbeddingModels : grava embeddings ONNX baixados
ExtensionServices --> BundledEmbedding : descobre modelo empacotado
ExtensionServices --> EmbeddingModels : descobre modelo selecionado
ExtensionServices --> DownloadedEmbeddingModel : baixa modelo padrão
ExtensionServices --> ChromaRunner : inicia/para e consulta
ChromaRunner --> ChromaBinding : carrega binding nativo
ChromaRunner --> VectorDb : persiste coleções
ExtensionServices --> RagManifest : lê/grava projetos e fontes
@enduml
```

## 6. Modelo Conceitual do Banco Vetorial (RAG)

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0
skinparam packageStyle rectangle
title ATLAS - Modelo Conceitual do Banco Vetorial (RAG)

class ProjetoIndexado <<implementado>> {
  +project_id
  +nome_projeto
  +caminho_raiz
  +collection_name
  +status
  +embedding_model
  +embedding_dimensions
  +source_count
  +chunk_count
}

class FonteIndexada <<implementado>> {
  +source_id
  +project_id
  +tipo_fonte
  +relative_path
  +linguagem
  +hash_conteudo
  +chunk_ids
}

class ChunkRAG <<implementado>> {
  +chunk_id
  +conteudo_texto
  +source_type
  +external_document
  +linha_inicio
  +linha_fim
  +chunk_index
  +hash_chunk
}

class Embedding <<implementado>> {
  +vetor_embedding
  +modelo_embedding_utilizado
  +dimensoes
}

class MetadadosIndexacao <<implementado>> {
  +relative_path
  +language
  +start_line
  +end_line
  +symbol_name
  +artifact_type
}

class ColecaoVetorial <<implementado>> {
  +nome_colecao
  +engine = ChromaDB
  +project_id
}

ProjetoIndexado "1" -- "1..*" FonteIndexada : possui
FonteIndexada "1" -- "1..*" ChunkRAG : é dividida em
ChunkRAG "1" -- "1" Embedding : gera
ChunkRAG "1" -- "1" MetadadosIndexacao : possui
ColecaoVetorial "1" -- "0..*" ChunkRAG : armazena
@enduml
```

## 7. Modelo Lógico do Banco Vetorial (RAG)

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0
skinparam packageStyle rectangle
title ATLAS - Modelo Lógico do Banco Vetorial (RAG)

entity "ProjetoIndexado" as Projeto {
  *project_id : VARCHAR(24)
  --
  nome_projeto : VARCHAR
  caminho_raiz : VARCHAR
  collection_name : VARCHAR
  status_indexacao : VARCHAR
  embedding_model : VARCHAR
  embedding_dimensions : INT
  source_count : INT
  chunk_count : INT
  size_bytes : BIGINT
  created_at : DATETIME
  updated_at : DATETIME
}

entity "FonteIndexada" as Fonte {
  *source_id : VARCHAR(32)
  --
  project_id : VARCHAR(24) <<FK>>
  tipo_fonte : VARCHAR
  relative_path : VARCHAR
  linguagem : VARCHAR
  hash_conteudo : VARCHAR
  tamanho_bytes : BIGINT
  data_modificacao : DATETIME
  chunk_ids : JSON
}

entity "ColecaoVetorial" as Colecao {
  *nome_colecao : VARCHAR
  --
  project_id : VARCHAR(24)
  engine_vetorial : VARCHAR = "ChromaDB"
  modelo_embedding_padrao : VARCHAR
  dimensoes : INT
}

entity "ColecaoVetorialChunk" as Chunk {
  *chunk_id : VARCHAR(40)
  --
  collection_name : VARCHAR <<FK>>
  project_id : VARCHAR(24) <<FK>>
  source_id : VARCHAR(32) <<FK>>
  conteudo_texto : TEXT
  vetor_embedding : VECTOR
  metadata_json : JSON
  source_type : VARCHAR
  external_document : BOOLEAN
  linguagem : VARCHAR
  relative_path : VARCHAR
  linha_inicio : INT
  linha_fim : INT
  chunk_index : INT
  hash_chunk : VARCHAR
}

Projeto ||--o{ Fonte : possui
Fonte ||--o{ Chunk : origina
Projeto ||--o{ Chunk : agrupa
Colecao ||--o{ Chunk : armazena
@enduml
```
