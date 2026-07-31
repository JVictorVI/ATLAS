# Processo de Configuração

Atualizado em 24 de julho de 2026.

Este documento descreve onde as configurações do ATLAS vivem, como são normalizadas e quais fluxos da UI alteram cada seção.

## Componentes

```text
AtlasConfigManager
  -> AtlasConfigRepository
  -> AtlasSettingsService
  -> AtlasProviderService
  -> AtlasModelRegistryService
  -> AtlasSelectionService
  -> AtlasContextProfileService
```

## Arquivo principal

As configurações são salvas em:

```text
config/atlas-config.json
```

`AtlasConfigRepository.load` garante que o arquivo exista. Se ele estiver ausente ou inválido, o repositório recria a configuração padrão.

Depois de carregar, o conteúdo sempre passa por:

```text
AtlasConfigDefaults.mergeWithDefaults
```

Isso preserva compatibilidade quando campos novos são adicionados.

## Estrutura de alto nível

```text
version
updatedAt
general
cloudConfigs
rag
ui
llms
custom
providers
```

## Configurações gerais

Seção:

```text
general
```

Campos principais:

```text
language
theme
autoSave
logLevel
```

A UI de Configurações Gerais altera `language` e também partes de `custom`, `rag` e análise estática.

## Configurações de execução cloud

Seção:

```text
cloudConfigs
```

Campos:

```text
limitPayload
dynamicMaxTokens
maxTokens
timeout
temperature
topP
stream
```

`dynamicMaxTokens` permite ao `CloudApiService` tentar buscar o limite real do modelo na listagem do provedor.

Defaults atuais:

```text
limitPayload: true
dynamicMaxTokens: false
maxTokens: 8192
timeout: 30
temperature: 0.4
topP: 0.95
stream: true
```

## RAG

Seção:

```text
rag
```

Controla:

- ativação;
- autorização para cloud;
- modelo e pasta de embeddings;
- scanner;
- chunking;
- limites de arquivos;
- recuperação;
- filtros;
- materiais complementares;
- fontes exibidas.

O fluxo operacional detalhado está em [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).

Defaults atuais relevantes:

```text
enabled: true
allowLocalContext: true
allowCloudContext: false
offlineOnly: true
indexingMode: incremental
includeMarkdownFiles: true
includeConfigFiles: true
includeExternalDocuments: true
showSources: true
```

## LLMs

Seção:

```text
llms
```

Subseções:

```text
selection
defaults
localModels
```

### Selection

Controla o modo ativo e a seleção corrente:

```text
llms.selection.mode = local | cloud
llms.selection.local.activeModelId
llms.selection.cloud.providerId
llms.selection.cloud.activeModelId
```

`AtlasSelectionService` valida se o modelo/provedor existe antes de salvar.

### Defaults

Usados como fallback para chamadas:

```text
temperature
maxTokens
topP
stream
```

### Local models

`llms.localModels` é um mapa por id de modelo local.

Cada `AtlasModelConfig` contém:

```text
id
name
provider
enabled
source
path
apiModelName
baseUrl
parameters
metadata
custom
```

Parâmetros locais relevantes:

```text
temperature
maxTokens
topP
gpuLayers
contextWindow
seed
stopSequences
```

## Custom

Seção flexível:

```text
custom
```

Campos usados hoje:

```text
studyMode
refactoring
staticAnalysis
contextProfile
localEngine
localModels
```

### Local engine

```text
custom.localEngine.engineType
custom.localEngine.prepareOnAtlasOpen
custom.localEngine.startOnAtlasOpen
custom.localEngine.enginesDir
custom.localEngine.llamaServerPath
custom.localEngine.dynamicContextWindow
custom.localEngine.stream
custom.localEngine.timeout
custom.saveInterruptedResponses
```

### Refatoração aplicada

```text
custom.refactoring.enabled
```

Quando `enabled` está `false`, o ATLAS não aplica edições diretamente, não exibe novas ações de refatoração em análises arquiteturais e responde pedidos operacionais em modo textual.

### Análise estática

```text
custom.staticAnalysis.enabled
custom.staticAnalysis.useInQuickAnalysis
custom.staticAnalysis.useInArchitecturalAnalysis
custom.staticAnalysis.useInRefactoring
custom.staticAnalysis.includeDiagnostics
custom.staticAnalysis.includeSymbolRelations
```

`useInRefactoring` controla se a estrutura coletada pelo VS Code pode ser usada como contexto auxiliar quando o ATLAS aplica uma refatoração.

Defaults atuais:

```text
custom.saveInterruptedResponses: true
custom.refactoring.enabled: true
custom.localEngine.dynamicContextWindow: true
custom.localEngine.prepareOnAtlasOpen: true
custom.localEngine.stream: true
custom.localEngine.timeout: 30
```

### Local models

```text
custom.localModels.modelsDir
```

Essa pasta é usada por `AtlasLocalModelDiscoveryService` para procurar arquivos `.gguf`.

## Perfis de contexto

`AtlasContextProfileService` define quatro modos:

```text
light
balanced
advanced
custom
```

### Light

- histórico: 5 mensagens;
- sem memória arquitetural;
- sem RAG no prompt;
- contexto do editor até 10000 caracteres;
- sem análise estática;
- contexto dinâmico local desativado por efeito do preset.

### Balanced

- histórico: 8 mensagens;
- memória arquitetural ativa;
- RAG ativo;
- contexto do editor até 20000 caracteres;
- análise estática desativada por efeito do preset;
- contexto dinâmico local ativo.

### Advanced

- histórico: 12 mensagens;
- memória arquitetural ativa;
- RAG ativo;
- contexto do editor até 40000 caracteres;
- análise estática com diagnósticos e relações;
- contexto dinâmico local ativo.

### Custom

Preserva ajustes finos vindos das telas específicas. Campos numéricos são normalizados com limites.

## Fluxos de UI que salvam configuração

| Mensagem Webview | Handler | O que altera |
| --- | --- | --- |
| `salvarConfiguracoesCloud` | `handleSaveCloudConfigs` | `cloudConfigs`. |
| `salvarConfiguracoesAtlas` | `handleSaveAtlasSettings` | `general`, `custom.contextProfile`, `custom.localEngine`, `custom.refactoring`, `custom.staticAnalysis`, `rag.topK`, `rag.maxContextCharacters`. |
| `salvarConfiguracoesRag` | `handleSaveRagSettings` | `rag`. |
| `selecionarModo` | `handleSelectMode` | `llms.selection.mode`. |
| `selecionarModelo` | `handleSelectModel` | modelo local ou cloud ativo. |
| `saveModelParams` | `handleSaveModelParams` | `llms.localModels[modelId].parameters`. |
| `saveModelBehavior` | `handleSaveModelBehaviorForLocalModel` | `llms.localModels[modelId].custom.systemPrompt`. |
| `editModelMetadata` | `handleEditModelMetadata` | nome/provedor do modelo local. |
| `deleteModelRequest` | `handleDeleteModelRequest` | remove o arquivo `.gguf` da pasta de modelos e exclui o registro local. |
| `baixarEngineConfigurada` | `handleDownloadConfiguredEngineRequest` | prepara a engine selecionada em `custom.localEngine.engineType`. |

## Provedores

Seção:

```text
providers
```

Cada provider tem:

```text
id
label
baseUrl
apiKeyPlaceholder
kind
```

`kind` pode ser:

```text
openai-compatible
claude
gemini
```

Se ausente, `CloudApiService` infere pelo id.

O provider `HuggingFace` pode guardar token para busca/download de modelos, mas não é tratado como provedor de conversa no chat.

## Chaves de API

Chaves não ficam em `atlas-config.json`. Elas são salvas no Secret Storage do VS Code.

Chave secreta:

```text
atlas.apiKey.<provider>
```

Metadados:

```text
atlas.apiKeyMetadata.<provider>
```

## Descoberta de modelos locais

`AtlasLocalModelDiscoveryService.refreshLocalModels`:

1. lê a pasta de modelos;
2. filtra `.gguf`;
3. cria ou atualiza `AtlasModelConfig`;
4. remove da lista retornada modelos que não existem mais na pasta;
5. ajusta o modelo ativo se o anterior sumiu.

Defaults para modelo descoberto:

```text
temperature: 0.4
maxTokens: 8192
topP: 0.95
gpuLayers: 0
contextWindow: 8192
baseUrl: http://127.0.0.1:8080/v1
engine: llama.cpp
```

## Paradas automáticas da engine

Algumas alterações exigem parar a engine:

- trocar modelo local ativo;
- salvar parâmetros do modelo ativo;
- alterar configurações gerais de engine;
- trocar pasta de modelos ou engines.

A próxima geração local reinicia a engine com a configuração atual.

## Relações com outros processos

- Geração: [Processo de geração de resposta](processo-geracao-resposta-atlas.md).
- Engine local: [Processo da engine local](processo-engine-local-atlas.md).
- Configuração automática da engine: [Processo de configuração automática da engine](processo-configuracao-automatica-engine-atlas.md).
- Cloud: [Processo de integração cloud](processo-integracao-cloud-atlas.md).
- RAG: [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).
