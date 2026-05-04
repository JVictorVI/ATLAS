# Diagramas por Caso de Uso - ATLAS

Este arquivo contem diagramas de classe e de sequencia em PlantUML para cada caso de uso atualizado do ATLAS. Os blocos podem ser copiados diretamente para o PlantText.

## UC001 - Perguntar sobre o codigo pelo chat

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class ChatViewProvider
class ChatPanelManager
class ChatMessageRouter {
  +handle(data, webview)
  -handleSendQuestion(data, webview)
}
class AtlasEditorContextService {
  +getChatEditorContext()
  +buildEditorAnalysisContext(context)
}
class AtlasPromptAssemblyService {
  +buildMessages(input)
}
class AtlasPromptModeResolver
class AtlasSystemPromptPolicyService
class AtlasPromptCustomizationService
class CloudApiService {
  +sendChat(messages, onChunk, options)
}
class AtlasConfigManager
class ApiKeyManager

ChatViewProvider --> ChatPanelManager
ChatViewProvider --> ChatMessageRouter
ChatMessageRouter --> AtlasEditorContextService
ChatMessageRouter --> AtlasPromptAssemblyService
ChatMessageRouter --> CloudApiService
ChatMessageRouter --> AtlasConfigManager
AtlasPromptAssemblyService --> AtlasPromptModeResolver
AtlasPromptAssemblyService --> AtlasSystemPromptPolicyService
AtlasPromptAssemblyService --> AtlasPromptCustomizationService
CloudApiService --> AtlasConfigManager
CloudApiService --> ApiKeyManager
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "Webview Chat" as Webview
participant ChatMessageRouter as Router
participant AtlasEditorContextService as EditorContext
participant AtlasPromptAssemblyService as PromptAssembly
participant CloudApiService as CloudApi
participant "Modelo de IA" as ModeloIA

Usuario -> Webview : envia pergunta
Webview -> Router : enviarPergunta(value, forcedMode?)
Router -> EditorContext : getChatEditorContext()
EditorContext --> Router : contexto ou null
Router -> PromptAssembly : buildMessages(input)
PromptAssembly --> Router : messages + mode
Router -> CloudApi : sendChat(messages, onChunk, signal)
CloudApi -> ModeloIA : consultar modelo
ModeloIA --> CloudApi : resposta/chunks
CloudApi --> Router : resposta normalizada
Router --> Webview : respostaParcial/fimResposta/novaResposta
Webview --> Usuario : exibe resposta
@enduml
```

## UC002 - Executar analise rapida do arquivo atual

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class ChatViewProvider {
  +runQuickAnalysisFromCommand()
}
class ChatMessageRouter
class AtlasQuickAnalysisController {
  +execute(webview)
  -applyDecorations(editor, issues)
}
class AtlasEditorContextService {
  +getFullDocumentContext()
}
class AtlasQuickAnalysisService {
  +analyzeCode(code, languageId, fileName)
  -parseIssues(raw)
}
class AtlasPromptAssemblyService
class CloudApiService
class AtlasQuickIssue <<type>>

ChatViewProvider --> AtlasQuickAnalysisController
ChatMessageRouter --> AtlasQuickAnalysisController
AtlasQuickAnalysisController --> AtlasEditorContextService
AtlasQuickAnalysisController --> AtlasQuickAnalysisService
AtlasQuickAnalysisService --> AtlasPromptAssemblyService
AtlasQuickAnalysisService --> CloudApiService
AtlasQuickAnalysisService ..> AtlasQuickIssue
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "VS Code Command/Webview" as Trigger
participant ChatViewProvider as Provider
participant AtlasQuickAnalysisController as Controller
participant AtlasEditorContextService as EditorContext
participant AtlasQuickAnalysisService as QuickService
participant CloudApiService as CloudApi
participant "Modelo de IA" as ModeloIA
participant "Editor VS Code" as Editor

Usuario -> Trigger : solicita analise rapida
Trigger -> Provider : runQuickAnalysisFromCommand() / executarAnaliseRapida
Provider -> Controller : execute(webview)
Controller -> EditorContext : getFullDocumentContext()
EditorContext --> Controller : codigo + metadados
Controller -> QuickService : analyzeCode(...)
QuickService -> CloudApi : sendChat(messages)
CloudApi -> ModeloIA : analisar codigo
ModeloIA --> CloudApi : JSON de achados
CloudApi --> QuickService : resposta
QuickService --> Controller : AtlasQuickIssue[]
Controller -> Editor : setDecorations(...)
Controller --> Trigger : analiseRapidaConcluida
@enduml
```

## UC003 - Solicitar analise arquitetural formal

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class ChatMessageRouter {
  -handleSendQuestion(data, webview)
}
class AtlasEditorContextService
class AtlasPromptAssemblyService
class AtlasPromptModeResolver
class AtlasSystemPromptPolicyService {
  -buildArchitecturalAnalysisMessage()
}
class AtlasPromptCustomizationService
class CloudApiService

ChatMessageRouter --> AtlasEditorContextService
ChatMessageRouter --> AtlasPromptAssemblyService
ChatMessageRouter --> CloudApiService
AtlasPromptAssemblyService --> AtlasPromptModeResolver
AtlasPromptAssemblyService --> AtlasSystemPromptPolicyService
AtlasPromptAssemblyService --> AtlasPromptCustomizationService
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "Webview Chat" as Webview
participant ChatMessageRouter as Router
participant AtlasEditorContextService as EditorContext
participant AtlasPromptAssemblyService as PromptAssembly
participant AtlasSystemPromptPolicyService as PromptPolicy
participant CloudApiService as CloudApi
participant "Modelo de IA" as ModeloIA

Usuario -> Webview : clica "Analisar Arquitetura"
Webview -> Router : enviarPergunta(forcedMode="architectural-analysis")
Router -> EditorContext : getChatEditorContext()
EditorContext --> Router : contexto do codigo
Router -> PromptAssembly : buildMessages(input)
PromptAssembly -> PromptPolicy : buildBaseSystemMessage("architectural-analysis")
PromptPolicy --> PromptAssembly : prompt em 8 topicos
PromptAssembly --> Router : messages
Router -> CloudApi : sendChat(messages)
CloudApi -> ModeloIA : consultar modelo
ModeloIA --> CloudApi : analise arquitetural
CloudApi --> Router : resposta
Router --> Webview : novaResposta/fimResposta
@enduml
```

## UC004 - Ativar modo estudo

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class "src/webview/chat/script.js" as ChatScript <<webview>>
class ChatMessageRouter {
  -handleToggleStudyMode(data, webview)
}
class AtlasConfigManager {
  +isStudyModeEnabled()
  +setStudyModeEnabled(enabled)
}
class AtlasConfigRepository
class AtlasConfigTypes
class AtlasSystemPromptPolicyService {
  -buildStudyModeMessage()
}
class AtlasPromptAssemblyService

ChatScript --> ChatMessageRouter : alterarModoEstudo
ChatMessageRouter --> AtlasConfigManager
AtlasConfigManager --> AtlasConfigRepository
AtlasConfigManager ..> AtlasConfigTypes
AtlasPromptAssemblyService --> AtlasSystemPromptPolicyService
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "Webview Chat" as Webview
participant ChatMessageRouter as Router
participant AtlasConfigManager as ConfigManager
participant AtlasConfigRepository as Repository
database "config/atlas-config.json" as ConfigFile

Usuario -> Webview : clica botao modo estudo
Webview -> Router : alterarModoEstudo(enabled)
Router -> ConfigManager : setStudyModeEnabled(enabled)
ConfigManager -> Repository : save(config)
Repository -> ConfigFile : grava custom.studyMode.enabled
Router --> Webview : modoEstudoAtualizado(enabled)
Webview --> Usuario : atualiza botao e placeholder
@enduml
```

## UC005 - Gerenciar chaves de API

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class ChatPanelManager
class ChatMessageRouter
class ApiKeyManager {
  +handleMessage(data, webview)
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
class AtlasConfigManager
class AtlasProviderService
interface ApiCredentialView
interface ProviderConfig

ChatPanelManager --> ApiKeyManager
ChatMessageRouter --> ApiKeyManager
ApiKeyManager --> SecretStorageService
ApiKeyManager --> AtlasConfigManager
AtlasConfigManager --> AtlasProviderService
ApiKeyManager ..> ApiCredentialView
AtlasProviderService ..> ProviderConfig
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "Webview API Keys" as Webview
participant ChatMessageRouter as Router
participant ApiKeyManager as ApiKeys
participant SecretStorageService as Secrets
participant AtlasConfigManager as Config
database "VS Code SecretStorage" as VSSecrets

Usuario -> Webview : adiciona/edita/exclui chave
Webview -> Router : adicionarChave/editarChave/excluirChave
Router -> ApiKeys : handleMessage(data, webview)
ApiKeys -> Usuario : quickPick/inputBox/confirmacao
Usuario --> ApiKeys : dados da chave/provedor

alt adicionar ou editar
  ApiKeys -> Config : addProvider/updateProvider
  ApiKeys -> Secrets : store(secretKey, apiKey)
  Secrets -> VSSecrets : store
else excluir
  ApiKeys -> Secrets : delete(secretKey)
  Secrets -> VSSecrets : delete
  ApiKeys -> Config : removeProvider(provider)
end

ApiKeys --> Webview : credenciaisAtualizadas
@enduml
```

## UC006 - Selecionar provedor e modelo cloud

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class ChatMessageRouter {
  -handleLoadLlms(webview)
  -handleSelectCloudProvider(data, webview)
  -handleSelectModel(data, webview)
}
class AtlasConfigManager
class AtlasSelectionService
class AtlasProviderService
class CloudApiService {
  +getModelsForCurrentProvider()
}
class ApiKeyManager
interface AtlasModelSummary
interface ProviderConfig

ChatMessageRouter --> AtlasConfigManager
ChatMessageRouter --> CloudApiService
AtlasConfigManager --> AtlasSelectionService
AtlasConfigManager --> AtlasProviderService
CloudApiService --> AtlasConfigManager
CloudApiService --> ApiKeyManager
CloudApiService ..> AtlasModelSummary
AtlasProviderService ..> ProviderConfig
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "Webview Chat" as Webview
participant ChatMessageRouter as Router
participant AtlasConfigManager as Config
participant CloudApiService as CloudApi
participant ApiKeyManager as ApiKeys
participant "Provedor Cloud" as Cloud

Usuario -> Webview : abre seletor de modelo
Webview -> Router : carregarLLMs
Router -> Config : getAllProviders(), getLocalModels()
Router --> Webview : informarLLMsCarregados
Usuario -> Webview : seleciona provedor
Webview -> Router : selecionarProviderCloud(providerId)
Router -> Config : setSelectedCloudProvider(providerId)
Router -> CloudApi : getModelsForCurrentProvider()
CloudApi -> ApiKeys : getRawKey(providerId)
CloudApi -> Cloud : GET /models
Cloud --> CloudApi : lista de modelos
CloudApi --> Router : AtlasModelSummary[]
Router --> Webview : modelosCloudCarregados
Usuario -> Webview : seleciona modelo
Webview -> Router : selecionarModelo(mode="cloud", modelId)
Router -> Config : setActiveCloudModel(modelId)
Router --> Webview : modeloSelecionado
@enduml
```

## UC007 - Alternar modo local ou nuvem

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class ChatMessageRouter {
  -handleSelectMode(data, webview)
}
class AtlasConfigManager {
  +setMode(mode)
  +getCurrentMode()
}
class AtlasSelectionService {
  +setMode(mode)
  +isCloudMode()
  +isLocalMode()
}
class AtlasConfigRepository
interface AtlasLlmSelection

ChatMessageRouter --> AtlasConfigManager
AtlasConfigManager --> AtlasSelectionService
AtlasSelectionService --> AtlasConfigRepository
AtlasSelectionService ..> AtlasLlmSelection
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "Webview Chat" as Webview
participant ChatMessageRouter as Router
participant AtlasConfigManager as Config
participant AtlasSelectionService as Selection
participant AtlasConfigRepository as Repository

Usuario -> Webview : seleciona local ou cloud
Webview -> Router : selecionarModo(mode)
Router -> Config : setMode(mode)
Config -> Selection : setMode(mode)
Selection -> Repository : save(config)
Router --> Webview : modoSelecionado(mode)
@enduml
```

## UC008 - Configurar parametros de execucao e seguranca

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class ChatMessageRouter {
  -handleLoadSecuritySettings(webview)
  -handleSaveSecuritySettings(data, webview)
}
class AtlasConfigManager
class AtlasSettingsService {
  +updateSecuritySettings(settings)
  +updateLlmDefaults(defaults)
}
class AtlasConfigRepository
class AtlasConfigDefaults
interface AtlasSecuritySettings
interface AtlasLlmDefaults

ChatMessageRouter --> AtlasConfigManager
AtlasConfigManager --> AtlasSettingsService
AtlasSettingsService --> AtlasConfigRepository
AtlasConfigRepository --> AtlasConfigDefaults
AtlasSettingsService ..> AtlasSecuritySettings
AtlasSettingsService ..> AtlasLlmDefaults
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "Webview Config" as Webview
participant ChatMessageRouter as Router
participant AtlasConfigManager as Config
participant AtlasSettingsService as Settings
participant AtlasConfigRepository as Repository

Usuario -> Webview : altera parametros
Webview -> Router : salvarConfiguracoesSeguranca(payload)
Router -> Config : updateSecuritySettings(...)
Config -> Settings : updateSecuritySettings(...)
Settings -> Repository : save(config)
Router -> Config : updateLlmDefaults(...)
Config -> Settings : updateLlmDefaults(...)
Settings -> Repository : save(config)
Router --> Webview : configuracoesSegurancaSalvas
@enduml
```

## UC009 - Alterar comportamento do modelo

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class ChatMessageRouter {
  -handleLoadModelBehavior(webview)
  -handleSaveModelBehavior(data, webview)
}
class AtlasPromptCustomizationService {
  +getBehaviorConfig()
  +saveBehaviorConfig(input)
  +buildCustomizationBlock()
}
class AtlasConfigRepository
class AtlasPromptAssemblyService
interface AtlasUserBehaviorConfig

ChatMessageRouter --> AtlasPromptCustomizationService
AtlasPromptCustomizationService --> AtlasConfigRepository
AtlasPromptAssemblyService --> AtlasPromptCustomizationService
AtlasPromptCustomizationService ..> AtlasUserBehaviorConfig
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "Webview Config" as Webview
participant ChatMessageRouter as Router
participant AtlasPromptCustomizationService as Custom
participant AtlasConfigRepository as Repository

Usuario -> Webview : edita comportamento
Webview -> Router : salvarComportamentoModelo(payload)
Router -> Custom : saveBehaviorConfig(payload)
Custom -> Repository : load()
Custom -> Repository : save(config)
Custom --> Router : comportamento salvo
Router --> Webview : comportamentoModeloSalvo
@enduml
```

## UC010 - Gerenciar biblioteca/registro de modelos locais

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class ChatPanelManager
class ChatViewProvider {
  -_sendModelsToWebview(webview)
}
class ChatMessageRouter
class AtlasConfigManager {
  +getAllModels()
  +getLocalModels()
  +upsertModel(model)
  +removeModel(modelId)
}
class AtlasModelRegistryService
interface AtlasModelConfig

ChatPanelManager --> ChatMessageRouter
ChatMessageRouter --> ChatViewProvider : requestModels callback
ChatViewProvider --> AtlasConfigManager
AtlasConfigManager --> AtlasModelRegistryService
AtlasModelRegistryService ..> AtlasModelConfig
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "Webview Library" as Library
participant ChatMessageRouter as Router
participant ChatViewProvider as Provider
participant AtlasConfigManager as Config
participant AtlasModelRegistryService as Registry

Usuario -> Library : abre biblioteca
Library -> Router : requestModels
Router -> Provider : sendModelsToWebview(webview)
Provider -> Config : getAllModels()
Config -> Registry : getAllModels()
Registry --> Config : modelos locais registrados
Config --> Provider : modelos
Provider --> Library : updateModelsList(models)
@enduml
```

## UC011 - Abrir paineis da extensao

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class ChatViewProvider
class ChatPanelManager {
  +openPanel(selectedView)
  +normalizeSelectedView(selectedView)
  +getPanelGroup(selectedView)
  +getHtmlForWebview(webview, selectedView)
}
class ChatMessageRouter
class "src/webview/chat" as ChatWebview
class "src/webview/api-keys" as ApiKeysWebview
class "src/webview/library" as LibraryWebview

ChatViewProvider --> ChatPanelManager
ChatMessageRouter --> ChatPanelManager : openPanel callback
ChatPanelManager --> ChatWebview
ChatPanelManager --> ApiKeysWebview
ChatPanelManager --> LibraryWebview
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "Webview Chat" as Webview
participant ChatMessageRouter as Router
participant ChatPanelManager as PanelManager
participant "VS Code WebviewPanel" as Panel

Usuario -> Webview : solicita painel
Webview -> Router : abrirPainelConfig(selectedView)
Router -> PanelManager : openPanel(selectedView)
PanelManager -> PanelManager : normalizeSelectedView()
PanelManager -> Panel : createWebviewPanel/reveal
PanelManager -> PanelManager : getHtmlForWebview()
PanelManager --> Panel : html
Panel --> Usuario : painel aberto
@enduml
```

## UC012 - Indexar projeto com RAG (futuro)

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class RagConfigurationUI <<future>>
class ProjectIndexer <<future>> {
  +indexProject(workspace)
}
class EmbeddingGenerator <<future>> {
  +generateEmbeddings(chunks)
}
class VectorDatabaseManager <<future>> {
  +saveVectors(vectors)
  +deleteCollection(projectId)
}
class ContextRetriever <<future>>
class AtlasConfigManager
class AtlasConfigRepository
database ChromaDB <<future>>

RagConfigurationUI --> ProjectIndexer
ProjectIndexer --> EmbeddingGenerator
ProjectIndexer --> VectorDatabaseManager
ProjectIndexer --> AtlasConfigManager
AtlasConfigManager --> AtlasConfigRepository
VectorDatabaseManager --> ChromaDB
ContextRetriever --> VectorDatabaseManager
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "RAG Configuration UI\n(futuro)" as UI
participant "ProjectIndexer\n(futuro)" as Indexer
participant "EmbeddingGenerator\n(futuro)" as Embeddings
participant "VectorDatabaseManager\n(futuro)" as VectorDb
database "ChromaDB\n(futuro)" as Chroma

Usuario -> UI : solicita indexacao do projeto
UI -> Indexer : indexProject(workspace)
Indexer -> Indexer : ler arquivos e gerar chunks
Indexer -> Embeddings : generateEmbeddings(chunks)
Embeddings --> Indexer : vetores
Indexer -> VectorDb : saveVectors(vectors)
VectorDb -> Chroma : persistir embeddings
VectorDb --> Indexer : indexacao concluida
Indexer --> UI : status/tamanho da base
UI --> Usuario : exibe resultado
@enduml
```

## UC013 - Pesquisar modelos de IA (futuro)

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class ModelSearchUI <<future>>
class HuggingFaceModelSearchService <<future>> {
  +searchModels(query, filters)
}
class ModelCompatibilityService <<future>> {
  +enrichWithCompatibility(models)
}
class AtlasConfigManager
interface ModelSearchResult <<future>>
actor "Repositorio de Modelos\n(API)" as RepoAPI

ModelSearchUI --> HuggingFaceModelSearchService
HuggingFaceModelSearchService --> ModelCompatibilityService
HuggingFaceModelSearchService --> RepoAPI
HuggingFaceModelSearchService ..> ModelSearchResult
ModelCompatibilityService --> AtlasConfigManager
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "ModelSearchUI\n(futuro)" as UI
participant "HuggingFaceModelSearchService\n(futuro)" as Search
participant "ModelCompatibilityService\n(futuro)" as Compatibility
participant "Repositorio de Modelos\n(API)" as RepoAPI

Usuario -> UI : pesquisa modelo
UI -> Search : searchModels(query, filters)
Search -> RepoAPI : consultar repositorio
RepoAPI --> Search : resultados
Search -> Compatibility : enrichWithCompatibility(results)
Compatibility --> Search : resultados avaliados
Search --> UI : ModelSearchResult[]
UI --> Usuario : exibe modelos
@enduml
```

## UC014 - Baixar modelo local (futuro)

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class ModelDownloadUI <<future>>
class ModelDownloadService <<future>> {
  +downloadModel(modelId, variant)
}
class LocalModelStorageService <<future>> {
  +saveModelFile(file)
}
class AtlasConfigManager
class AtlasModelRegistryService
class LocalModelRuntime <<future>>
actor "Repositorio de Modelos\n(API)" as RepoAPI
database "Diretorio local de modelos\n(futuro)" as ModelDir

ModelDownloadUI --> ModelDownloadService
ModelDownloadService --> RepoAPI
ModelDownloadService --> LocalModelStorageService
LocalModelStorageService --> ModelDir
ModelDownloadService --> AtlasConfigManager
AtlasConfigManager --> AtlasModelRegistryService
LocalModelRuntime --> ModelDir
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "ModelDownloadUI\n(futuro)" as UI
participant "ModelDownloadService\n(futuro)" as Download
participant "Repositorio de Modelos\n(API)" as RepoAPI
participant "LocalModelStorageService\n(futuro)" as Storage
participant AtlasConfigManager as Config
participant AtlasModelRegistryService as Registry
database "Diretorio local\n(futuro)" as ModelDir

Usuario -> UI : seleciona modelo para baixar
UI -> Download : downloadModel(modelId, variant)
Download -> RepoAPI : requisita artefato
RepoAPI --> Download : arquivo/chunks
Download -> Storage : saveModelFile(file)
Storage -> ModelDir : grava modelo
Storage --> Download : path local
Download -> Config : upsertModel(modelConfig)
Config -> Registry : upsertModel(modelConfig)
Registry --> Config : modelo registrado
Download --> UI : modeloBaixado
UI --> Usuario : modelo disponivel
@enduml
```

## UC015 - Adicionar documentos externos ao RAG (futuro)

### Diagrama de Classes

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0

class RagDocumentsUI <<future>>
class ExternalDocumentIngestionService <<future>> {
  +addDocument(file)
}
class DocumentParser <<future>> {
  +parse(file)
}
class EmbeddingGenerator <<future>>
class VectorDatabaseManager <<future>>
database ChromaDB <<future>>

RagDocumentsUI --> ExternalDocumentIngestionService
ExternalDocumentIngestionService --> DocumentParser
ExternalDocumentIngestionService --> EmbeddingGenerator
ExternalDocumentIngestionService --> VectorDatabaseManager
VectorDatabaseManager --> ChromaDB
@enduml
```

### Diagrama de Sequencia

```plantuml
@startuml
skinparam shadowing false
actor Usuario
participant "RagDocumentsUI\n(futuro)" as UI
participant "ExternalDocumentIngestionService\n(futuro)" as Ingestion
participant "DocumentParser\n(futuro)" as Parser
participant "EmbeddingGenerator\n(futuro)" as Embeddings
participant "VectorDatabaseManager\n(futuro)" as VectorDb
database "ChromaDB\n(futuro)" as Chroma

Usuario -> UI : adiciona documento externo
UI -> Ingestion : addDocument(file)
Ingestion -> Parser : parse(file)
Parser --> Ingestion : texto/chunks
Ingestion -> Embeddings : generateEmbeddings(chunks)
Embeddings --> Ingestion : vetores
Ingestion -> VectorDb : saveVectors(vectors)
VectorDb -> Chroma : persistir vetores
VectorDb --> Ingestion : concluido
Ingestion --> UI : documento indexado
UI --> Usuario : confirma inclusao
@enduml
```

