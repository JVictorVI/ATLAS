# Casos de Uso e Diagramas PlantUML - ATLAS

Este arquivo contém os casos de uso e os diagramas PlantUML atualizados com base na implementação atual do ATLAS.
Os blocos podem ser copiados diretamente para o PlantText ou para uma extensão PlantUML compatível com UTF-8.

> **Nota de atualização:** a arquitetura atual do ATLAS é uma extensão do VS Code implementada em TypeScript. O ponto central de inferência é o `AtlasInferenceService`, que decide entre execução em nuvem, por meio do `CloudApiService`, e execução local, por meio do `LocalApiService` integrado ao `AtlasLocalEngineService` e ao `llama-server`. O projeto já possui gerenciamento de sessões, histórico persistido, resumo de conversas longas, descoberta de modelos `.gguf`, seleção de provedor/modelo cloud, chaves em `SecretStorage`, análise rápida via Webview e decoração no editor. RAG, ChromaDB, download automatizado de modelos e integração real com repositórios externos permanecem como evolução futura.

## 1. Diagrama de Casos de Uso

```plantuml
@startuml
left to right direction
skinparam packageStyle rectangle
skinparam shadowing false

actor "Usuário" as Usuario
actor "Provedor Cloud" as ProvedorCloud
actor "llama-server\nlocal" as LlamaServer
actor "VS Code\nSecretStorage" as SecretStorage
actor "Sistema de\nArquivos Local" as FileSystem
actor "Repositório de\nModelos (futuro)" as RepoModelos
actor "Base Vetorial\n(futuro)" as BaseVetorial

rectangle "ATLAS - Extensão VS Code" {
  usecase "Perguntar sobre\no código" as UC001
  usecase "Executar análise\nrápida" as UC002
  usecase "Solicitar análise\narquitetural" as UC003
  usecase "Ativar modo\nestudo" as UC004
  usecase "Gerenciar\nchaves de API" as UC005
  usecase "Selecionar provedor\ne modelo cloud" as UC006
  usecase "Alternar modo\nlocal / nuvem" as UC007
  usecase "Configurar parâmetros\ne segurança" as UC008
  usecase "Alterar comportamento\ndo modelo" as UC009
  usecase "Gerenciar biblioteca\nde modelos locais" as UC010
  usecase "Abrir painéis\nda extensão" as UC011
  usecase "Gerenciar sessões\ne histórico" as UC012
  usecase "Resumir conversas\nlongas" as UC013
  usecase "Executar inferência\nlocal" as UC014
  usecase "Descobrir modelos\nGGUF locais" as UC015

  usecase "Indexar projeto\ncom RAG" as UC016
  usecase "Pesquisar modelos\nde IA" as UC017
  usecase "Baixar modelo\nlocal" as UC018
  usecase "Adicionar documentos\nao RAG" as UC019

  usecase "Coletar contexto\ndo editor" as INC_Contexto
  usecase "Montar prompt" as INC_Prompt
  usecase "Resolver modo\nde resposta" as INC_Modo
  usecase "Consultar inferência" as INC_Inferencia
  usecase "Persistir configuração" as INC_Config
  usecase "Persistir histórico" as INC_Historico
  usecase "Aplicar decorações\nno editor" as INC_Decoracoes
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
Usuario --> UC014
Usuario --> UC015
Usuario --> UC016
Usuario --> UC017
Usuario --> UC018
Usuario --> UC019

UC001 ..> INC_Contexto : <<include>>
UC001 ..> INC_Prompt : <<include>>
UC001 ..> INC_Inferencia : <<include>>
UC001 ..> INC_Historico : <<include>>
UC002 ..> INC_Contexto : <<include>>
UC002 ..> INC_Prompt : <<include>>
UC002 ..> INC_Inferencia : <<include>>
UC002 ..> INC_Decoracoes : <<include>>
UC003 ..> UC001 : <<extend>>
UC004 ..> INC_Config : <<include>>
UC005 ..> INC_Config : <<include>>
UC006 ..> INC_Config : <<include>>
UC007 ..> INC_Config : <<include>>
UC008 ..> INC_Config : <<include>>
UC009 ..> INC_Prompt : <<include>>
UC010 ..> INC_Config : <<include>>
UC012 ..> INC_Historico : <<include>>
UC013 ..> INC_Historico : <<include>>
UC014 ..> INC_Inferencia : <<include>>
UC015 ..> UC010 : <<include>>
INC_Prompt ..> INC_Modo : <<include>>

ProvedorCloud --> INC_Inferencia
LlamaServer --> UC014
SecretStorage --> UC005
FileSystem --> UC015
FileSystem --> UC014

UC016 ..> BaseVetorial : <<future>>
UC017 ..> RepoModelos : <<future>>
UC018 ..> RepoModelos : <<future>>
UC018 ..> FileSystem : <<future>>
UC019 ..> BaseVetorial : <<future>>
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
}

package "Aplicação" {
  class ChatMessageRouter {
    +handle(data, webview)
    -handleSendQuestion(data, webview)
    -handleCancelGeneration(webview)
    -handleSelectMode(data, webview)
    -handleSelectModel(data, webview)
  }

  class ChatResponseController {
    +handleSendQuestion(data, webview)
    +cancel()
  }

  class ChatSessionController {
    +createSession(webview)
    +switchSession(data, webview)
    +renameSession(data, webview)
    +deleteSession(data, webview)
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
    +execute(webview)
    +clearDecorations(editor)
    +dispose()
  }

  class AtlasQuickAnalysisService {
    +analyzeCode(code, languageId, fileName)
    -parseIssues(raw)
    -extractJsonArray(raw)
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
    +isAbortError(error)
  }

  class AtlasLocalEngineService {
    +ensureRunning(selection)
    +start(selection)
    +stop()
    +getHealth()
  }
}

package "Prompts e Sessões" {
  class AtlasPromptAssemblyService {
    +buildMessages(input)
  }

  class AtlasPromptModeResolver {
    +resolve(input)
  }

  class AtlasSystemPromptPolicyService {
    +buildBaseSystemMessage(mode)
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
ChatViewProvider *-- ChatSessionController
ChatViewProvider *-- ChatModelWebviewService

ChatPanelManager --> WebviewChat : renderiza
ChatPanelManager --> WebviewAtlas : renderiza
ChatPanelManager --> WebviewApiKeys : renderiza
ChatPanelManager --> WebviewLibrary : renderiza
WebviewChat --> ChatMessageRouter : postMessage

ChatMessageRouter --> ChatResponseController
ChatMessageRouter --> ChatSessionController
ChatMessageRouter --> ChatModelWebviewService
ChatMessageRouter --> AtlasQuickAnalysisController
ChatMessageRouter --> ApiKeyManager
ChatMessageRouter --> AtlasConfigManager

ChatResponseController --> AtlasEditorContextService
ChatResponseController --> AtlasPromptAssemblyService
ChatResponseController --> AtlasInferenceService
ChatResponseController --> AtlasSessionService

AtlasQuickAnalysisController --> AtlasEditorContextService
AtlasQuickAnalysisController --> AtlasQuickAnalysisService
AtlasQuickAnalysisService --> AtlasPromptAssemblyService
AtlasQuickAnalysisService --> AtlasInferenceService

AtlasInferenceService --> CloudApiService : modo cloud
AtlasInferenceService --> LocalApiService : modo local
LocalApiService --> AtlasLocalEngineService

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
  }

  class AtlasSettingsService {
    +updateSecuritySettings(settings)
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
    +createSession(webview)
    +switchSession(data, webview)
    +renameSession(data, webview)
    +deleteSession(data, webview)
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
  }

  class AtlasSystemPromptPolicyService {
    +buildBaseSystemMessage(mode)
  }

  class AtlasPromptCustomizationService {
    +getBehaviorConfig()
    +saveBehaviorConfig(input)
    +buildCustomizationBlock()
  }

  class AtlasSessionService {
    +getWindowedHistory(sessionId)
    +getSummary(sessionId)
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
    -buildLocalEndpoint()
    -streamLocalResponse(...)
  }

  class AtlasLocalEngineService {
    +ensureRunning(selection)
    +start(selection)
    +stop()
    +waitUntilReady()
  }
}

package "Configuração" {
  class AtlasConfigManager
  class ApiKeyManager
  class AtlasLocalModelDiscoveryService
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
LocalApiService --> AtlasLocalModelDiscoveryService

CloudApiService ..> AtlasCloudChatResponse
CloudApiService ..> AtlasModelSummary
LocalApiService ..> AtlasLocalEngineHealth
@enduml
```

## 5. Diagrama de Implantação - Visão Atual

```plantuml
@startuml
skinparam shadowing false
skinparam componentStyle rectangle
title ATLAS - Visão de Implantação Atual

node "Máquina do Desenvolvedor\n(Windows + VS Code)" as DevMachine {
  node "Visual Studio Code" as VSCode {
    component "ATLAS Extension\n(TypeScript)" as Extension
    component "Webviews\nchat / atlas / library / api-keys" as Webviews
    component "Serviços da Extensão\nChatResponseController\nAtlasInferenceService\nAtlasSessionService" as ExtensionServices
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
    artifact "llama.cpp\nCPU / CUDA / Vulkan" as LlamaBins
  }

  node "Processo Local" as LocalProcess {
    component "llama-server\n127.0.0.1:8080" as LlamaServer
  }

  database "Base Vetorial Local\n(futuro)" as VectorDb
}

cloud "Provedores de IA em Nuvem\nOpenAI-compatible / Claude / Gemini / xAI" as CloudProviders
cloud "Repositório de Modelos\nHugging Face (futuro)" as ModelRepository

Webviews --> Extension : postMessage
Extension --> ExtensionServices : delega ações
ExtensionServices --> SecretStorage : consulta chaves
ExtensionServices --> ConfigJson : lê/grava configurações
ExtensionServices --> HistoryJson : lê/grava sessões e resumos
ExtensionServices --> GgufModels : descobre modelos locais
ExtensionServices --> LlamaBins : seleciona engine
ExtensionServices --> LlamaServer : inicia/para e envia requisições
LlamaServer --> GgufModels : carrega modelo
ExtensionServices --> CloudProviders : inferência cloud
ExtensionServices ..> ModelRepository : busca/download planejado
ExtensionServices ..> VectorDb : RAG planejado
@enduml
```

## 6. Modelo Conceitual do Banco Vetorial (RAG)

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0
skinparam packageStyle rectangle
title ATLAS - Modelo Conceitual do Banco Vetorial (RAG)

class ProjetoIndexado <<conceitual>> {
  +project_id
  +nome_projeto
  +caminho_raiz
  +data_indexacao
  +linguagem_principal
  +hash_indexacao
}

class FonteIndexada <<conceitual>> {
  +source_id
  +project_id
  +tipo_fonte
  +caminho
  +nome_arquivo
  +linguagem
  +hash_conteudo
}

class ChunkRAG <<conceitual>> {
  +chunk_id
  +conteudo_texto
  +tipo_chunk
  +linha_inicio
  +linha_fim
  +chunk_index
}

class Embedding <<conceitual>> {
  +embedding_id
  +vetor_embedding
  +modelo_embedding_utilizado
  +dimensoes
  +data_geracao
}

class MetadadosIndexacao <<conceitual>> {
  +metadata_id
  +file_path
  +language
  +start_line
  +end_line
  +symbol_name
  +artifact_type
}

class ColecaoVetorial <<conceitual>> {
  +collection_id
  +nome_colecao
  +engine_vetorial
  +metrica_similaridade
  +data_criacao
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
  *project_id : UUID
  --
  nome_projeto : VARCHAR
  caminho_raiz : VARCHAR
  linguagem_principal : VARCHAR
  data_indexacao : DATETIME
  hash_indexacao : VARCHAR
  status_indexacao : VARCHAR
}

entity "FonteIndexada" as Fonte {
  *source_id : UUID
  --
  project_id : UUID <<FK>>
  tipo_fonte : VARCHAR
  file_path : VARCHAR
  nome_arquivo : VARCHAR
  linguagem : VARCHAR
  hash_conteudo : VARCHAR
  tamanho_bytes : INT
  data_modificacao : DATETIME
}

entity "ColecaoVetorial" as Colecao {
  *collection_id : UUID
  --
  nome_colecao : VARCHAR
  engine_vetorial : VARCHAR
  modelo_embedding_padrao : VARCHAR
  dimensoes : INT
  metrica_similaridade : VARCHAR
  data_criacao : DATETIME
}

entity "ColecaoVetorialChunk" as Chunk {
  *chunk_id : UUID
  --
  collection_id : UUID <<FK>>
  project_id : UUID <<FK>>
  source_id : UUID <<FK>>
  conteudo_texto : TEXT
  vetor_embedding : VECTOR
  modelo_embedding_utilizado : VARCHAR
  dimensoes : INT
  metadata_json : JSON
  tipo_chunk : VARCHAR
  linguagem : VARCHAR
  file_path : VARCHAR
  linha_inicio : INT
  linha_fim : INT
  chunk_index : INT
  hash_chunk : VARCHAR
  data_geracao : DATETIME
}

Projeto ||--o{ Fonte : possui
Fonte ||--o{ Chunk : origina
Projeto ||--o{ Chunk : agrupa
Colecao ||--o{ Chunk : armazena
@enduml
```
