# Casos de Uso e Diagramas PlantUML - ATLAS

Este arquivo contem os casos de uso atualizados com base na arquitetura atual do ATLAS e o codigo PlantUML correspondente para gerar os diagramas no PlantText.

## 1. Casos de Uso Atualizados

### UC001 - Perguntar sobre o codigo pelo chat

**Ator principal:** Desenvolvedor.

**Objetivo:** Enviar uma pergunta ao ATLAS pelo chat, usando opcionalmente o arquivo aberto ou trecho selecionado como contexto.

**Componentes principais:**

- `ChatViewProvider`
- `ChatPanelManager`
- `ChatMessageRouter`
- `AtlasEditorContextService`
- `AtlasPromptAssemblyService`
- `AtlasPromptModeResolver`
- `AtlasSystemPromptPolicyService`
- `AtlasPromptCustomizationService`
- `CloudApiService`

### UC002 - Executar analise rapida do arquivo atual

**Ator principal:** Desenvolvedor.

**Objetivo:** Analisar o arquivo aberto e destacar trechos com possiveis problemas arquiteturais no editor.

**Componentes principais:**

- `ChatViewProvider`
- `ChatMessageRouter`
- `AtlasQuickAnalysisController`
- `AtlasEditorContextService`
- `AtlasQuickAnalysisService`
- `AtlasPromptAssemblyService`
- `CloudApiService`

### UC003 - Solicitar analise arquitetural formal

**Ator principal:** Desenvolvedor.

**Objetivo:** Solicitar uma avaliacao arquitetural mais completa do codigo aberto, com resposta estruturada em topicos.

**Componentes principais:**

- `ChatMessageRouter`
- `AtlasEditorContextService`
- `AtlasPromptAssemblyService`
- `AtlasPromptModeResolver`
- `AtlasSystemPromptPolicyService`
- `CloudApiService`

### UC004 - Ativar modo estudo

**Ator principal:** Desenvolvedor ou estudante.

**Objetivo:** Alternar o ATLAS para um modo didatico, no qual as respostas priorizam explicacao progressiva, exemplos e apoio ao aprendizado.

**Componentes principais:**

- `src/webview/chat/script.js`
- `ChatMessageRouter`
- `AtlasConfigManager`
- `AtlasSystemPromptPolicyService`
- `AtlasPromptAssemblyService`
- `AtlasPromptTypes`
- `AtlasConfigTypes`

### UC005 - Gerenciar chaves de API

**Ator principal:** Desenvolvedor.

**Objetivo:** Cadastrar, listar, editar e excluir chaves de API para provedores cloud.

**Componentes principais:**

- `ChatPanelManager`
- `ChatMessageRouter`
- `ApiKeyManager`
- `SecretStorageService`
- `AtlasConfigManager`
- `AtlasProviderService`

### UC006 - Selecionar provedor e modelo cloud

**Ator principal:** Desenvolvedor.

**Objetivo:** Escolher o provedor cloud e o modelo usado nas interacoes com o ATLAS.

**Componentes principais:**

- `ChatMessageRouter`
- `AtlasConfigManager`
- `AtlasSelectionService`
- `AtlasProviderService`
- `CloudApiService`

### UC007 - Alternar modo local ou nuvem

**Ator principal:** Desenvolvedor.

**Objetivo:** Alterar o modo de execucao configurado entre `local` e `cloud`.

**Componentes principais:**

- `ChatMessageRouter`
- `AtlasConfigManager`
- `AtlasSelectionService`
- `AtlasModelRegistryService`
- `AtlasProviderService`

**Observacao:** a selecao de modo local ja existe na configuracao. A inferencia local ainda depende da implementacao futura do runtime local.

### UC008 - Configurar parametros de execucao e seguranca

**Ator principal:** Desenvolvedor.

**Objetivo:** Definir parametros como temperatura, top_p, max_tokens, streaming, timeout e configuracoes de seguranca.

**Componentes principais:**

- `ChatMessageRouter`
- `AtlasConfigManager`
- `AtlasSettingsService`
- `AtlasConfigRepository`
- `AtlasConfigDefaults`

### UC009 - Alterar comportamento do modelo

**Ator principal:** Desenvolvedor.

**Objetivo:** Configurar diretivas complementares de comportamento para o ATLAS.

**Componentes principais:**

- `ChatMessageRouter`
- `AtlasPromptCustomizationService`
- `AtlasConfigRepository`
- `AtlasPromptAssemblyService`

### UC010 - Gerenciar biblioteca/registro de modelos locais

**Ator principal:** Desenvolvedor.

**Objetivo:** Exibir e manter referencias a modelos locais configurados.

**Componentes principais:**

- `ChatPanelManager`
- `ChatMessageRouter`
- `ChatViewProvider`
- `AtlasConfigManager`
- `AtlasModelRegistryService`

**Observacao:** busca, download, instalacao e execucao fisica de modelos locais permanecem como evolucao futura.

### UC011 - Abrir paineis da extensao

**Ator principal:** Desenvolvedor.

**Objetivo:** Navegar entre chat, configuracoes e biblioteca.

**Componentes principais:**

- `ChatViewProvider`
- `ChatPanelManager`
- `ChatMessageRouter`

### UC012 - Indexar projeto com RAG

**Ator principal:** Desenvolvedor.

**Objetivo:** Indexar o projeto para recuperacao semantica de contexto.

**Estado:** futuro.

### UC013 - Pesquisar modelos de IA

**Ator principal:** Desenvolvedor.

**Objetivo:** Pesquisar modelos de IA disponiveis em repositorios externos, como Hugging Face, exibindo informacoes relevantes para escolha do modelo.

**Estado:** futuro.

**Componentes planejados:**

- `Model Search UI` (futuro)
- `HuggingFaceModelSearchService` (futuro)
- `AtlasModelRegistryService`
- `AtlasConfigManager`
- `Model CompatibilityService` (futuro)

### UC014 - Baixar modelo local

**Ator principal:** Desenvolvedor.

**Objetivo:** Baixar um modelo de IA selecionado para a maquina local e registra-lo na biblioteca local do ATLAS.

**Estado:** futuro.

**Componentes planejados:**

- `Model Download UI` (futuro)
- `ModelDownloadService` (futuro)
- `LocalModelStorageService` (futuro)
- `AtlasModelRegistryService`
- `AtlasConfigManager`
- `Local Model Runtime (llama.cpp)` (futuro)

### UC015 - Adicionar documentos externos ao RAG

**Ator principal:** Desenvolvedor.

**Objetivo:** Adicionar documentos externos para uso no contexto recuperado pelo RAG.

**Estado:** futuro.

## 2. Diagrama de Casos de Uso

```plantuml
@startuml
left to right direction
skinparam packageStyle rectangle
skinparam shadowing false

actor "Usuario" as Usuario
actor "Modelo de IA" as ModeloIA
actor "Repositorio de Modelos\n(API)" as RepoAPI
actor "Runtime Local\n(futuro)" as RuntimeLocal
actor "Base Vetorial\n(futuro)" as BaseVetorial

rectangle "ATLAS" {
  usecase "Perguntar sobre o\ncodigo" as UC_PerguntarCodigo
  usecase "Solicitar analise\nrapida do arquivo" as UC_AnaliseRapida
  usecase "Solicitar analise\narquitetural" as UC_AnaliseArquitetural
  usecase "Ativar modo\nestudo" as UC_ModoEstudo
  usecase "Gerenciar\nchaves de API" as UC_ChavesAPI
  usecase "Selecionar provedor\ne modelo cloud" as UC_SelecionarCloud
  usecase "Alternar modo\nlocal / nuvem" as UC_AlternarModo
  usecase "Configurar\nparametros do\nmodelo" as UC_ConfigModelo
  usecase "Alterar\ncomportamento\ndo modelo" as UC_Comportamento
  usecase "Gerenciar biblioteca\nlocal de modelos" as UC_Biblioteca
  usecase "Pesquisar\nmodelos de IA" as UC_PesquisarModelos
  usecase "Baixar\nmodelo local" as UC_BaixarModelo
  usecase "Indexar projeto\ncom RAG" as UC_IndexarRAG
  usecase "Adicionar\ndocumentos ao\nRAG" as UC_AddDocsRAG

  usecase "Coletar contexto\ndo editor" as UC_ContextoEditor
  usecase "Consultar modelo\nde IA" as UC_ConsultarModelo
  usecase "Montar prompt" as UC_MontarPrompt
  usecase "Aplicar modo de\nresposta" as UC_AplicarModo
  usecase "Analisar codigo" as UC_AnalisarCodigo
  usecase "Gerar resposta" as UC_GerarResposta
  usecase "Destacar trechos\nno editor" as UC_DestacarEditor

  usecase "Consultar\nrepositorio de\nmodelos" as UC_ConsultarRepo
  usecase "Verificar\ncompatibilidade de\nhardware" as UC_VerificarHW
  usecase "Registrar modelo\nlocal" as UC_RegistrarModelo
  usecase "Executar modelo\nlocal" as UC_ExecutarLocal

  usecase "Usar contexto do\nprojeto via RAG" as UC_ContextoProjetoRAG
  usecase "Gerar embeddings" as UC_GerarEmbeddings
  usecase "Armazenar vetores" as UC_ArmazenarVetores
}

Usuario --> UC_PerguntarCodigo
Usuario --> UC_AnaliseRapida
Usuario --> UC_AnaliseArquitetural
Usuario --> UC_ModoEstudo
Usuario --> UC_ChavesAPI
Usuario --> UC_SelecionarCloud
Usuario --> UC_AlternarModo
Usuario --> UC_ConfigModelo
Usuario --> UC_Comportamento
Usuario --> UC_Biblioteca
Usuario --> UC_PesquisarModelos
Usuario --> UC_BaixarModelo
Usuario --> UC_IndexarRAG
Usuario --> UC_AddDocsRAG

UC_PerguntarCodigo ..> UC_ContextoEditor : <<include>>
UC_PerguntarCodigo ..> UC_MontarPrompt : <<include>>
UC_PerguntarCodigo ..> UC_ConsultarModelo : <<include>>
UC_PerguntarCodigo ..> UC_GerarResposta : <<include>>

UC_AnaliseRapida ..> UC_ContextoEditor : <<include>>
UC_AnaliseRapida ..> UC_MontarPrompt : <<include>>
UC_AnaliseRapida ..> UC_ConsultarModelo : <<include>>
UC_AnaliseRapida ..> UC_AnalisarCodigo : <<include>>
UC_AnaliseRapida ..> UC_DestacarEditor : <<include>>

UC_AnaliseArquitetural ..> UC_PerguntarCodigo : <<extend>>
UC_ModoEstudo ..> UC_AplicarModo : <<include>>
UC_Comportamento ..> UC_AplicarModo : <<include>>
UC_MontarPrompt ..> UC_AplicarModo : <<include>>
UC_ContextoProjetoRAG ..> UC_MontarPrompt : <<extend>>

UC_ConsultarModelo ..> UC_AnalisarCodigo : <<include>>
UC_AnalisarCodigo ..> UC_GerarResposta : <<include>>

ModeloIA --> UC_AnalisarCodigo
ModeloIA --> UC_GerarResposta

UC_PesquisarModelos ..> UC_ConsultarRepo : <<include>>
UC_PesquisarModelos ..> UC_VerificarHW : <<extend>>
UC_BaixarModelo ..> UC_ConsultarRepo : <<include>>
UC_BaixarModelo ..> UC_VerificarHW : <<include>>
UC_BaixarModelo ..> UC_RegistrarModelo : <<include>>
UC_ExecutarLocal ..> UC_BaixarModelo : <<include>>

RepoAPI --> UC_ConsultarRepo
RuntimeLocal --> UC_ExecutarLocal

UC_IndexarRAG ..> UC_GerarEmbeddings : <<include>>
UC_IndexarRAG ..> UC_ArmazenarVetores : <<include>>
UC_AddDocsRAG ..> UC_GerarEmbeddings : <<include>>
UC_AddDocsRAG ..> UC_ArmazenarVetores : <<include>>
UC_ContextoProjetoRAG ..> UC_IndexarRAG : <<extend>>

BaseVetorial --> UC_ArmazenarVetores
BaseVetorial --> UC_ContextoProjetoRAG
@enduml
```

## 3. Diagrama de Classes - Visao Geral da Extensao

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0
skinparam packageStyle rectangle

package "VS Code Extension" {
  class "extension.ts" as ExtensionEntry <<entrypoint>>
  class ChatViewProvider {
    +viewType: string
    +resolveWebviewView(webviewView)
    +runQuickAnalysisFromCommand()
    +dispose()
  }
}

package "Interface / Webview" {
  class ChatPanelManager {
    +setMessageHandler(handler)
    +getLocalResourceRoots()
    +setInitialHtml(webview, selectedView)
    +openPanel(selectedView)
    +normalizeSelectedView(selectedView)
    +getHtmlForWebview(webview, selectedView)
  }

  class "src/webview/chat" as WebviewChat <<webview>>
  class "src/webview/api-keys" as WebviewApiKeys <<webview>>
  class "src/webview/library" as WebviewLibrary <<webview>>
}

package "Aplicacao" {
  class ChatMessageRouter {
    -activeResponseController
    +handle(data, webview)
    -handleSendQuestion(data, webview)
    -handleCancelGeneration(webview)
    -handleSelectMode(data, webview)
    -handleSelectModel(data, webview)
    -handleSelectCloudProvider(data, webview)
    -handleToggleStudyMode(data, webview)
  }

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

package "Prompts / IA" {
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

  class CloudApiService {
    +sendChat(messages, onChunk, options)
    +getModelsForCurrentProvider()
    +isAbortError(error)
  }
}

package "Configuracao / Persistencia" {
  class AtlasConfigManager {
    +getConfig()
    +setMode(mode)
    +setActiveCloudModel(modelId)
    +setSelectedCloudProvider(providerId)
    +isStudyModeEnabled()
    +setStudyModeEnabled(enabled)
  }

  class ApiKeyManager {
    +handleMessage(data, webview)
    +addKey(webview)
    +deleteKey(provider, webview)
    +editKey(provider, webview)
    +listCredentials()
    +getRawKey(provider)
  }

  class SecretStorageService {
    +store(key, value)
    +get(key)
    +delete(key)
  }
}

ExtensionEntry --> ChatViewProvider : registra
ChatViewProvider *-- ChatPanelManager
ChatViewProvider *-- ChatMessageRouter
ChatViewProvider *-- AtlasConfigManager
ChatViewProvider *-- ApiKeyManager
ChatViewProvider *-- CloudApiService
ChatViewProvider *-- AtlasPromptAssemblyService
ChatViewProvider *-- AtlasEditorContextService
ChatViewProvider *-- AtlasQuickAnalysisController

ChatPanelManager --> WebviewChat : renderiza
ChatPanelManager --> WebviewApiKeys : renderiza
ChatPanelManager --> WebviewLibrary : renderiza
WebviewChat --> ChatMessageRouter : postMessage

ChatMessageRouter --> ApiKeyManager
ChatMessageRouter --> AtlasConfigManager
ChatMessageRouter --> CloudApiService
ChatMessageRouter --> AtlasPromptAssemblyService
ChatMessageRouter --> AtlasEditorContextService
ChatMessageRouter --> AtlasQuickAnalysisController

AtlasQuickAnalysisController --> AtlasEditorContextService
AtlasQuickAnalysisController --> AtlasQuickAnalysisService
AtlasQuickAnalysisService --> AtlasPromptAssemblyService
AtlasQuickAnalysisService --> CloudApiService

AtlasPromptAssemblyService --> AtlasSystemPromptPolicyService
AtlasPromptAssemblyService --> AtlasPromptCustomizationService
AtlasPromptAssemblyService --> AtlasPromptModeResolver

ApiKeyManager --> SecretStorageService
ApiKeyManager --> AtlasConfigManager
CloudApiService --> AtlasConfigManager
CloudApiService --> ApiKeyManager
@enduml
```

## 4. Diagrama de Classes - Configuracao, Selecao e Persistencia

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0
skinparam packageStyle rectangle

package "Managers" {
  class AtlasConfigManager {
    -defaults
    -repository
    -settingsService
    -providerService
    -modelRegistry
    -selectionService
    +getConfig()
    +saveConfig(config)
    +resetConfig()
    +updateSecuritySettings(settings)
    +updateLlmDefaults(defaults)
    +getCurrentMode()
    +setMode(mode)
    +setActiveLocalModel(modelId)
    +setSelectedCloudProvider(providerId)
    +setActiveCloudModel(modelId)
    +getAllProviders()
    +addProvider(provider)
    +updateProvider(providerId, partialData)
    +removeProvider(providerId)
    +getAllModels()
    +getLocalModels()
    +isStudyModeEnabled()
    +setStudyModeEnabled(enabled)
  }
}

package "Services" {
  class AtlasSettingsService {
    +getConfig()
    +saveConfig(config)
    +resetConfig()
    +getSection(section)
    +updateSection(section, partialData)
    +updateSecuritySettings(settings)
    +updateRagSettings(settings)
    +updateLlmDefaults(defaults)
    +updateCustomRoot(customData)
  }

  class AtlasProviderService {
    +getAllProviders()
    +getProvider(providerId)
    +getSelectedProvider()
    +saveProviders(providers)
    +addProvider(provider)
    +updateProvider(providerId, partialData)
    +removeProvider(providerId)
  }

  class AtlasModelRegistryService {
    +getAllModels()
    +getLocalModel(modelId)
    +getLocalModels()
    +upsertModel(model)
    +updateModel(modelId, partialData)
    +removeModel(modelId)
  }

  class AtlasSelectionService {
    +getCurrentMode()
    +isCloudMode()
    +isLocalMode()
    +setMode(mode)
    +setActiveLocalModel(modelId)
    +setSelectedCloudProvider(providerId)
    +setActiveCloudModel(modelId)
    +getResolvedCloudSelection()
    +getResolvedLocalSelection()
    +getResolvedSelectionForCurrentMode()
  }
}

package "Repository" {
  class AtlasConfigRepository {
    -configDirPath
    -configFilePath
    +load()
    +save(config)
    +reset()
  }

  class AtlasConfigDefaults {
    +createDefaultConfig()
    +mergeWithDefaults(partial)
  }
}

package "Types" {
  interface AtlasConfigSchema
  interface ProviderConfig
  interface AtlasModelConfig
  interface AtlasLlmSelection
  interface AtlasStudyModeConfig
  interface AtlasCustomSettings
}

database "config/atlas-config.json" as ConfigFile

AtlasConfigManager *-- AtlasConfigDefaults
AtlasConfigManager *-- AtlasConfigRepository
AtlasConfigManager *-- AtlasSettingsService
AtlasConfigManager *-- AtlasProviderService
AtlasConfigManager *-- AtlasModelRegistryService
AtlasConfigManager *-- AtlasSelectionService

AtlasSettingsService --> AtlasConfigRepository
AtlasProviderService --> AtlasConfigRepository
AtlasModelRegistryService --> AtlasConfigRepository
AtlasSelectionService --> AtlasConfigRepository
AtlasSelectionService --> AtlasProviderService
AtlasSelectionService --> AtlasModelRegistryService

AtlasConfigRepository --> AtlasConfigDefaults
AtlasConfigRepository --> ConfigFile : le/grava
AtlasConfigRepository ..> AtlasConfigSchema
AtlasConfigDefaults ..> AtlasConfigSchema
AtlasConfigSchema *-- ProviderConfig
AtlasConfigSchema *-- AtlasLlmSelection
AtlasConfigSchema *-- AtlasCustomSettings
AtlasCustomSettings *-- AtlasStudyModeConfig
AtlasConfigSchema *-- AtlasModelConfig
@enduml
```

## 5. Diagrama de Classes - Prompt e Integracao com IA

```plantuml
@startuml
skinparam shadowing false
skinparam classAttributeIconSize 0
skinparam packageStyle rectangle

package "Prompt Layer" {
  class AtlasPromptAssemblyService {
    -policyService
    -customizationService
    -modeResolver
    +buildMessages(input)
  }

  class AtlasPromptModeResolver {
    -architecturalTerms
    -quickAnalysisTerms
    -developerTerms
    +resolve(input)
  }

  class AtlasSystemPromptPolicyService {
    +buildBaseSystemMessage(mode)
    -buildArchitecturalAnalysisMessage()
    -buildQuickAnalysisMessage()
    -buildStudyModeMessage()
    -buildDeveloperAssistantMessage()
  }

  class AtlasPromptCustomizationService {
    -repository
    +getBehaviorConfig()
    +saveBehaviorConfig(input)
    +buildCustomizationBlock()
    -sanitizeCustomInstructions(text)
  }
}

package "Cloud IA" {
  class CloudApiService {
    -configManager
    -apiKeyManager
    +sendChat(messages, onChunk, options)
    +getModelsForCurrentProvider()
    -sendOpenAiCompatibleChat(...)
    -sendClaudeChat(...)
    -sendGeminiChat(...)
    -normalizeOpenAiCompatibleResponse(...)
    -normalizeClaudeResponse(...)
    -normalizeGeminiResponse(...)
  }
}

package "Types" {
  enum AtlasPromptMode {
    developer-assistant
    architectural-analysis
    quick-analysis
    study-mode
  }

  interface AtlasPromptAssemblyInput
  interface AtlasPromptAssemblyResult
  interface ChatMessage
  interface AtlasCloudChatResponse
  interface AtlasModelSummary
}

class AtlasConfigRepository
class AtlasConfigManager
class ApiKeyManager

AtlasPromptAssemblyService --> AtlasSystemPromptPolicyService
AtlasPromptAssemblyService --> AtlasPromptCustomizationService
AtlasPromptAssemblyService --> AtlasPromptModeResolver
AtlasPromptAssemblyService ..> AtlasPromptAssemblyInput
AtlasPromptAssemblyService ..> AtlasPromptAssemblyResult
AtlasPromptAssemblyService ..> ChatMessage
AtlasPromptAssemblyService ..> AtlasPromptMode

AtlasPromptCustomizationService --> AtlasConfigRepository
AtlasSystemPromptPolicyService ..> AtlasPromptMode

CloudApiService --> AtlasConfigManager
CloudApiService --> ApiKeyManager
CloudApiService ..> ChatMessage
CloudApiService ..> AtlasCloudChatResponse
CloudApiService ..> AtlasModelSummary
@enduml
```

## 6. Diagrama de Sequencia - Perguntar sobre o Codigo

```plantuml
@startuml
skinparam shadowing false
actor "Desenvolvedor" as Dev
participant "Webview Chat" as Webview
participant "ChatMessageRouter" as Router
participant "AtlasEditorContextService" as EditorContext
participant "AtlasPromptAssemblyService" as PromptAssembly
participant "AtlasPromptModeResolver" as ModeResolver
participant "AtlasSystemPromptPolicyService" as PromptPolicy
participant "AtlasPromptCustomizationService" as PromptCustom
participant "CloudApiService" as CloudApi
participant "Provedor Cloud" as Cloud

Dev -> Webview : Digita pergunta
Webview -> Router : enviarPergunta(value, forcedMode?)
Router -> EditorContext : getChatEditorContext()
EditorContext --> Router : contexto do arquivo/selecao ou null

Router -> PromptAssembly : buildMessages(input)
PromptAssembly -> ModeResolver : resolve(input)
ModeResolver --> PromptAssembly : modo
PromptAssembly -> PromptPolicy : buildBaseSystemMessage(modo)
PromptPolicy --> PromptAssembly : system prompt
PromptAssembly -> PromptCustom : buildCustomizationBlock()
PromptCustom --> PromptAssembly : diretivas ou null
PromptAssembly --> Router : { mode, messages }

Router -> CloudApi : sendChat(messages, onChunk, signal)
CloudApi -> Cloud : requisicao HTTP

alt streaming ativo
  Cloud --> CloudApi : chunks
  CloudApi --> Router : onChunk(chunk)
  Router --> Webview : respostaParcial(chunk)
  Cloud --> CloudApi : fim
  CloudApi --> Router : metadata
  Router --> Webview : fimResposta(metadata)
else streaming desativado
  Cloud --> CloudApi : resposta completa
  CloudApi --> Router : AtlasCloudChatResponse
  Router --> Webview : novaResposta(content, metadata)
end
@enduml
```

## 7. Diagrama de Sequencia - Analise Rapida

```plantuml
@startuml
skinparam shadowing false
actor "Desenvolvedor" as Dev
participant "VS Code Command\natlas.quickAnalysis" as Command
participant "ChatViewProvider" as Provider
participant "AtlasQuickAnalysisController" as Controller
participant "AtlasEditorContextService" as EditorContext
participant "AtlasQuickAnalysisService" as QuickService
participant "AtlasPromptAssemblyService" as PromptAssembly
participant "CloudApiService" as CloudApi
participant "Provedor Cloud" as Cloud
participant "Editor VS Code" as Editor
participant "Webview Chat" as Webview

Dev -> Command : Executa comando
Command -> Provider : runQuickAnalysisFromCommand()
Provider -> Controller : execute(webview?)
Controller -> EditorContext : getFullDocumentContext()

alt arquivo valido aberto
  EditorContext --> Controller : codigo + metadados
  Controller -> Webview : analiseRapidaStatus(loading=true)
  Controller -> QuickService : analyzeCode(code, languageId, fileName)
  QuickService -> PromptAssembly : buildMessages(forcedMode="quick-analysis")
  PromptAssembly --> QuickService : messages
  QuickService -> CloudApi : sendChat(messages)
  CloudApi -> Cloud : requisicao HTTP
  Cloud --> CloudApi : JSON de achados
  CloudApi --> QuickService : resposta
  QuickService -> QuickService : parseIssues(response.content)
  QuickService --> Controller : AtlasQuickIssue[]
  Controller -> Controller : sanitizeIssues(...)
  Controller -> Editor : setDecorations(...)
  Controller -> Webview : analiseRapidaConcluida(total, issues)
  Controller -> Webview : analiseRapidaStatus(loading=false)
else nenhum arquivo valido
  EditorContext --> Controller : null
  Controller -> Webview : erro
end
@enduml
```

## 8. Diagrama de Sequencia - Ativar Modo Estudo

```plantuml
@startuml
skinparam shadowing false
actor "Estudante/Desenvolvedor" as User
participant "Webview Chat" as Webview
participant "ChatMessageRouter" as Router
participant "AtlasConfigManager" as ConfigManager
participant "AtlasConfigRepository" as Repository
database "config/atlas-config.json" as ConfigFile

User -> Webview : Clica no botao Modo Estudo
Webview -> Webview : applyStudyModeState(nextValue)
Webview -> Router : alterarModoEstudo(enabled)
Router -> ConfigManager : setStudyModeEnabled(enabled)
ConfigManager -> ConfigManager : atualiza custom.studyMode.enabled
ConfigManager -> Repository : saveConfig(config)
Repository -> ConfigFile : grava JSON
Router --> Webview : modoEstudoAtualizado(enabled)
Webview -> Webview : atualiza botao e placeholder
@enduml
```

## 9. Diagrama de Sequencia - Perguntar com Modo Estudo Ativo

```plantuml
@startuml
skinparam shadowing false
actor "Estudante" as Student
participant "Webview Chat" as Webview
participant "ChatMessageRouter" as Router
participant "AtlasPromptAssemblyService" as PromptAssembly
participant "AtlasSystemPromptPolicyService" as PromptPolicy
participant "CloudApiService" as CloudApi
participant "Provedor Cloud" as Cloud

Student -> Webview : Envia pergunta
Webview -> Router : enviarPergunta(value,\nforcedMode="study-mode")
Router -> PromptAssembly : buildMessages(input)
PromptAssembly -> PromptPolicy : buildBaseSystemMessage("study-mode")
PromptPolicy --> PromptAssembly : prompt didatico do modo estudo
PromptAssembly --> Router : messages
Router -> CloudApi : sendChat(messages)
CloudApi -> Cloud : requisicao HTTP
Cloud --> CloudApi : resposta didatica
CloudApi --> Router : AtlasCloudChatResponse
Router --> Webview : respostaParcial/fimResposta\nou novaResposta
@enduml
```

## 10. Diagrama de Sequencia - Gerenciar Chave de API

```plantuml
@startuml
skinparam shadowing false
actor "Desenvolvedor" as Dev
participant "Webview API Keys" as Webview
participant "ChatMessageRouter" as Router
participant "ApiKeyManager" as ApiKeyManager
participant "AtlasConfigManager" as ConfigManager
participant "SecretStorageService" as SecretStorage
participant "VS Code SecretStorage" as VSSecret

Dev -> Webview : Solicita adicionar/editar/excluir chave
Webview -> Router : adicionarChave/listarChaves/editarChave/excluirChave
Router -> ApiKeyManager : handleMessage(data, webview)

alt adicionar ou editar chave
  ApiKeyManager -> Dev : showQuickPick/showInputBox
  Dev --> ApiKeyManager : provedor, URL, chave
  ApiKeyManager -> ConfigManager : addProvider/updateProvider(...)
  ApiKeyManager -> SecretStorage : store(secretKey, apiKey)
  SecretStorage -> VSSecret : store(...)
else excluir chave
  ApiKeyManager -> Dev : confirmacao
  Dev --> ApiKeyManager : confirmar
  ApiKeyManager -> SecretStorage : delete(secretKey)
  SecretStorage -> VSSecret : delete(...)
  ApiKeyManager -> ConfigManager : removeProvider(provider)
else listar chaves
  ApiKeyManager -> SecretStorage : get(secretKey)
  SecretStorage -> VSSecret : get(...)
  VSSecret --> SecretStorage : chave
end

ApiKeyManager -> ApiKeyManager : listCredentials()
ApiKeyManager --> Webview : credenciaisAtualizadas
@enduml
```

## 11. Diagrama de Sequencia - Selecionar Provedor e Modelo Cloud

```plantuml
@startuml
skinparam shadowing false
actor "Desenvolvedor" as Dev
participant "Webview Chat" as Webview
participant "ChatMessageRouter" as Router
participant "AtlasConfigManager" as ConfigManager
participant "AtlasSelectionService" as SelectionService
participant "CloudApiService" as CloudApi
participant "ApiKeyManager" as ApiKeyManager
participant "Provedor Cloud" as Cloud

Dev -> Webview : Abre seletor de agente/modelo
Webview -> Router : carregarLLMs
Router -> ConfigManager : getAllProviders()
Router -> ConfigManager : getLocalModels()
Router --> Webview : informarLLMsCarregados(...)

Dev -> Webview : Seleciona provedor cloud
Webview -> Router : selecionarProviderCloud(providerId)
Router -> ConfigManager : setSelectedCloudProvider(providerId)
ConfigManager -> SelectionService : setSelectedCloudProvider(providerId)
Router -> CloudApi : getModelsForCurrentProvider()
CloudApi -> ConfigManager : getSelectedCloudProviderId()
CloudApi -> ApiKeyManager : getRawKey(providerId)
CloudApi -> Cloud : GET /models
Cloud --> CloudApi : lista de modelos
CloudApi --> Router : AtlasModelSummary[]
Router --> Webview : modelosCloudCarregados(providerId, models)

Dev -> Webview : Seleciona modelo
Webview -> Router : selecionarModelo(mode="cloud", modelId)
Router -> ConfigManager : setActiveCloudModel(modelId)
Router --> Webview : modeloSelecionado
@enduml
```

## 12. Diagrama de Sequencia - Configuracoes de Seguranca e Execucao

```plantuml
@startuml
skinparam shadowing false
actor "Desenvolvedor" as Dev
participant "Webview Configuracoes" as Webview
participant "ChatMessageRouter" as Router
participant "AtlasConfigManager" as ConfigManager
participant "AtlasSettingsService" as SettingsService
participant "AtlasConfigRepository" as Repository
database "config/atlas-config.json" as ConfigFile

Dev -> Webview : Abre configuracoes
Webview -> Router : carregarConfiguracoesSeguranca
Router -> ConfigManager : getSection("cloudSecurity")
Router -> ConfigManager : getConfig().llms.defaults
Router --> Webview : configuracoesSegurancaCarregadas

Dev -> Webview : Salva parametros
Webview -> Router : salvarConfiguracoesSeguranca(payload)
Router -> ConfigManager : updateSecuritySettings(...)
ConfigManager -> SettingsService : updateSecuritySettings(...)
SettingsService -> Repository : save(config)
Repository -> ConfigFile : grava JSON

Router -> ConfigManager : updateLlmDefaults(...)
ConfigManager -> SettingsService : updateLlmDefaults(...)
SettingsService -> Repository : save(config)
Repository -> ConfigFile : grava JSON

Router --> Webview : configuracoesSegurancaSalvas
@enduml
```

## 13. Diagrama de Sequencia - Pesquisar Modelos de IA (Futuro)

```plantuml
@startuml
skinparam shadowing false
actor "Desenvolvedor" as Dev
participant "Webview Biblioteca" as LibraryUI
participant "ChatMessageRouter" as Router
participant "HuggingFaceModelSearchService\n(futuro)" as SearchService
participant "ModelCompatibilityService\n(futuro)" as Compatibility
participant "Repositorio de Modelos\nHugging Face" as HuggingFace

Dev -> LibraryUI : Informa termo/filtro de pesquisa
LibraryUI -> Router : pesquisarModelosIa(query, filters)
Router -> SearchService : searchModels(query, filters)
SearchService -> HuggingFace : GET /models?query=...
HuggingFace --> SearchService : modelos encontrados
SearchService -> Compatibility : enrichWithCompatibility(models)
Compatibility --> SearchService : modelos com metadados de compatibilidade
SearchService --> Router : ModelSearchResult[]
Router --> LibraryUI : modelosPesquisados(results)
LibraryUI --> Dev : Exibe modelos disponiveis
@enduml
```

## 14. Diagrama de Sequencia - Baixar Modelo Local (Futuro)

```plantuml
@startuml
skinparam shadowing false
actor "Desenvolvedor" as Dev
participant "Webview Biblioteca" as LibraryUI
participant "ChatMessageRouter" as Router
participant "ModelDownloadService\n(futuro)" as DownloadService
participant "Repositorio de Modelos\nHugging Face" as HuggingFace
participant "LocalModelStorageService\n(futuro)" as Storage
participant "AtlasModelRegistryService" as Registry
participant "AtlasConfigManager" as ConfigManager
database "Diretorio local de modelos\n(futuro)" as ModelDir
database "config/atlas-config.json" as ConfigFile

Dev -> LibraryUI : Seleciona modelo e clica em baixar
LibraryUI -> Router : baixarModeloLocal(modelId, variant)
Router -> DownloadService : downloadModel(modelId, variant)
DownloadService -> HuggingFace : requisita artefato do modelo

loop progresso do download
  HuggingFace --> DownloadService : chunk
  DownloadService --> Router : downloadProgress(percentual)
  Router --> LibraryUI : progressoDownloadModelo(percentual)
end

DownloadService -> Storage : saveModelFile(file)
Storage -> ModelDir : grava arquivo GGUF/binario
Storage --> DownloadService : caminho local
DownloadService -> ConfigManager : upsertModel(modelConfig)
ConfigManager -> Registry : upsertModel(modelConfig)
Registry -> ConfigFile : registra modelo local
DownloadService --> Router : modeloBaixado(modelConfig)
Router --> LibraryUI : modeloLocalAtualizado(modelConfig)
LibraryUI --> Dev : Modelo disponivel na biblioteca
@enduml
```
