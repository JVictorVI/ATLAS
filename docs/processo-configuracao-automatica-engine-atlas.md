# Processo de configuração automática da engine

Atualizado em 24 de julho de 2026.

Este documento descreve como o ATLAS escolhe, baixa, valida e prepara automaticamente a engine local `llama.cpp` usada para executar modelos GGUF.

## Objetivo

O objetivo do processo é reduzir a configuração manual da execução local.

Quando possível, o ATLAS:

- detecta o tipo de engine mais adequado para a máquina;
- salva o modo selecionado em configuração;
- baixa o pacote correto do `llama.cpp`;
- extrai os arquivos na pasta de engines;
- valida se `llama-server` está disponível;
- deixa a engine pronta para ser iniciada pela biblioteca local ou pelo chat.

A preparação automática não inicia necessariamente um modelo. Ela garante que os binários da engine existam. A inicialização do processo `llama-server` é responsabilidade do fluxo descrito em [Processo da Engine Local](processo-engine-local-atlas.md).

## Componentes

```text
ChatViewProvider
  -> AtlasEngineDownloadService
     -> HardwareDiagnosticService
     -> AtlasConfigManager
     -> GitHub releases do llama.cpp
```

Componentes relacionados:

```text
ChatMessageRouter
AtlasLocalEngineService
AtlasLocalModelDiscoveryService
Webview atlas
Webview library
Webview search
```

## Configurações envolvidas

As configurações ficam em:

```text
custom.localEngine
```

Campos principais:

```text
engineType
prepareOnAtlasOpen
startOnAtlasOpen
enginesDir
llamaServerPath
dynamicContextWindow
stream
timeout
```

Valores aceitos para `engineType`:

```text
cpu
cuda
vulkan
```

Default importante:

```text
prepareOnAtlasOpen: true
```

Quando `enginesDir` não está configurado, a pasta padrão é:

```text
<extensionPath>/engine
```

## Pastas esperadas

Cada tipo de engine usa uma subpasta própria:

| Tipo | Pasta |
| --- | --- |
| CPU | `llama.cpp` |
| CUDA | `llama.cpp-cuda` |
| Vulkan | `llama.cpp-vulkan` |

Dentro da subpasta, o ATLAS procura:

```text
llama-server.exe
llama-server
```

No Windows, a engine CUDA também precisa de DLLs runtime, como:

```text
cudart64_<versão>.dll
cublas64_<versão>.dll
cublasLt64_<versão>.dll
```

## Preparação automática ao abrir o ATLAS

Quando a view principal é resolvida, `ChatViewProvider.resolveWebviewView` chama:

```text
ensureEngineDownloadedOnAtlasOpen()
startEngineOnAtlasOpenIfEnabled()
```

O primeiro método prepara a engine. O segundo inicia a engine apenas se essa opção estiver ligada.

O preparo automático é ignorado quando:

```text
custom.localEngine.prepareOnAtlasOpen === false
```

Também é ignorado se qualquer engine já estiver baixada:

```text
AtlasEngineDownloadService.isAnyEngineDownloaded()
```

Se nenhuma engine existir, o ATLAS chama:

```text
AtlasEngineDownloadService.ensureEngineDownloaded()
```

Esse método escolhe o tipo recomendado para a máquina, salva `engineType` e baixa o pacote correspondente se necessário.

## Seleção automática do tipo de engine

`AtlasEngineDownloadService.selectEngineTypeForCurrentMachine` usa os dados de:

```text
HardwareDiagnosticService.getHardwareInfo()
```

Regra atual:

1. Se a VRAM detectada for menor que 2 GB, usa `cpu`.
2. Se a GPU for NVIDIA e houver VRAM suficiente, usa `cuda`.
3. Se a GPU for AMD ou Intel e houver VRAM suficiente, usa `vulkan`.
4. Para outros fornecedores com VRAM suficiente, usa `vulkan`.

Depois da escolha, o ATLAS persiste:

```text
custom.localEngine.engineType
```

Essa persistência acontece mesmo antes do download, para que a configuração reflita o modo recomendado ou efetivo.

## Preparação da engine selecionada

Há situações em que o ATLAS não escolhe automaticamente, mas respeita o modo configurado pelo usuário:

- botão "Baixar agora" nas Configurações Gerais;
- download de um modelo GGUF pelo Repositório de Modelos;
- início manual da engine local;
- início automático da engine quando `startOnAtlasOpen` está ativo.

Nesses casos, o fluxo usa:

```text
AtlasEngineDownloadService.ensureConfiguredEngineDownloaded()
```

Esse método lê:

```text
custom.localEngine.engineType
```

e baixa exatamente essa engine se ela ainda não estiver instalada.

## UI de Configurações Gerais

A tela `atlas` permite selecionar:

```text
CPU
GPU NVIDIA CUDA
GPU Vulkan
```

Ao trocar o modo, `engine-download.js`:

1. verifica se o modo já está baixado com `verificarEngineModoExecucao`;
2. mostra um aviso se a engine selecionada ainda não estiver instalada;
3. salva as configurações antes do download;
4. envia `baixarEngineConfigurada`;
5. atualiza a UI com `downloadEngineConfiguradaStatus`.

O status exibido vem do backend em mensagens como:

```text
Verificando a engine selecionada...
Consultando a versão mais recente do llama.cpp no GitHub...
Baixando a engine da llama (...)
Extraindo os arquivos da engine...
Engine selecionada pronta para uso.
```

## Consulta do release mais recente

O serviço consulta:

```text
https://api.github.com/repos/ggml-org/llama.cpp/releases/latest
```

Headers usados:

```text
User-Agent: atlas-vscode-extension
Accept: application/vnd.github+json
```

O ATLAS usa os assets do release para escolher o pacote compatível com plataforma, arquitetura e modo de execução.

## Seleção de pacote

No Windows:

- CPU: `llama-...-bin-win-cpu-x64.zip` ou `llama-...-bin-win-cpu-arm64.zip`;
- CUDA: prefere `cuda-13`, depois `cuda-12`, depois qualquer pacote CUDA x64;
- Vulkan: `llama-...-bin-win-vulkan-x64.zip`.

No Linux:

- CPU: `llama-...-bin-ubuntu-x64.tar.gz` ou `llama-...-bin-ubuntu-arm64.tar.gz`;
- CUDA: pacotes Ubuntu CUDA x64;
- Vulkan: pacote Ubuntu Vulkan para a arquitetura atual.

No macOS:

- usa pacote macOS `arm64` ou `x64`;
- a seleção não diferencia CUDA/Vulkan, porque os padrões disponíveis são por plataforma/arquitetura.

Se o usuário pedir CUDA e o release atual não tiver asset CUDA compatível, o ATLAS tenta usar Vulkan como fallback. Nesse caso, salva `engineType: "vulkan"` e informa o motivo no progresso.

## Download, extração e validação

O fluxo de download:

1. cria a pasta da engine;
2. cria uma pasta temporária em `os.tmpdir()`;
3. baixa o pacote do GitHub;
4. grava o arquivo temporário;
5. extrai `.zip` ou `.tar.gz`;
6. encontra a pasta que contém `llama-server`;
7. copia os arquivos para a pasta final;
8. ajusta permissão executável em sistemas não-Windows;
9. instala DLLs CUDA complementares quando necessário;
10. valida com `isEngineDownloaded`;
11. remove a pasta temporária.

Para `.zip`, no Windows o ATLAS usa:

```text
Expand-Archive
```

Em outros sistemas, usa:

```text
unzip
```

Para `.tar.gz`, usa:

```text
tar -xzf
```

## DLLs CUDA complementares

No Windows, após baixar a engine CUDA principal, o ATLAS tenta encontrar um asset complementar:

```text
cudart-llama-bin-win-cuda-<versão>-x64.zip
```

Quando encontrado, extrai e copia todos os `.dll` para a pasta da engine CUDA.

Se o pacote complementar não existir, o fluxo não falha imediatamente; ele informa que manteve apenas a engine CUDA principal. A validação final ainda pode falhar se as DLLs necessárias não estiverem presentes.

## Início automático da engine

Preparar a engine não é o mesmo que iniciar.

O processo `llama-server` só é iniciado automaticamente na abertura quando:

```text
custom.localEngine.startOnAtlasOpen === true
```

Nesse caso, `ChatViewProvider.startEngineOnAtlasOpenIfEnabled`:

1. verifica a opção;
2. resolve o modelo local ativo;
3. garante que a engine configurada esteja baixada;
4. chama `AtlasLocalEngineService.ensureEngine(model)`.

Se não houver modelo local ativo, a engine não pode ser iniciada.

## Relação com download de modelos GGUF

Ao baixar um LLM no Repositório de Modelos, o ATLAS prepara a engine configurada antes de baixar o GGUF:

```text
AtlasEngineDownloadService.ensureConfiguredEngineDownloaded()
```

Isso evita que o usuário baixe um modelo de chat local e depois descubra que ainda falta o runtime básico para executá-lo.

Embeddings ONNX não disparam esse preparo, porque são usados pelo RAG e não pelo `llama-server`.

## Resolução do executável em tempo de execução

Quando a engine local precisa iniciar, `AtlasLocalEngineService.resolveLlamaServerExecutable` procura nesta ordem:

1. `model.custom.llamaServerPath`;
2. `custom.localEngine.llamaServerPath`;
3. `<enginesDir>/<engineFolder>/llama-server.exe`;
4. `<enginesDir>/<engineFolder>/llama-server`;
5. fallback CPU: `<enginesDir>/bin/llama-server.exe`;
6. fallback CPU: `<enginesDir>/bin/llama-server`;
7. último fallback: `llama-server.exe` no Windows ou `llama-server` em outros sistemas.

Se CUDA ou Vulkan estiverem selecionados e os arquivos não existirem na pasta esperada, o serviço lança erro em vez de cair silenciosamente para CPU.

## Concorrência e progresso

`ChatViewProvider` mantém promessas internas para evitar downloads duplicados:

```text
startupEngineDownloadPromise
startupEnginePromise
```

O download usa:

```text
vscode.window.withProgress
```

com:

```text
cancellable: false
```

Durante o progresso, o backend também envia mensagens para a webview:

```text
engineLocalStatus
downloadEngineConfiguradaStatus
```

## Comando da extensão

A extensão registra o comando:

```text
atlas.baixarEngineAi
```

Esse comando chama:

```text
ChatViewProvider.downloadEngineAI()
```

Ele usa a seleção automática por hardware, baixa a engine recomendada e informa a pasta final ao usuário.

## Tratamento de erros

Erros comuns:

- falha ao consultar o release do GitHub;
- resposta inesperada da API de releases;
- ausência de pacote compatível para plataforma/modo;
- formato de pacote não suportado;
- pacote sem `llama-server`;
- falha de extração por ausência de `tar` ou `unzip`;
- engine baixada sem executável válido;
- CUDA sem DLLs runtime exigidas.

Na abertura do ATLAS, falhas de preparo automático são exibidas com:

```text
ATLAS: <mensagem>
```

Na tela de Configurações Gerais, falhas retornam:

```text
downloadEngineConfiguradaStatus
```

com:

```text
error: true
```

## Relações com outros processos

- Lifecycle e argumentos do `llama-server`: [Processo da Engine Local](processo-engine-local-atlas.md).
- Seleção e descoberta de modelos GGUF: [Processo do Repositório de Modelos](processo-repositorio-modelos-atlas.md).
- Persistência de `custom.localEngine`: [Processo de configuração](processo-configuracao-atlas.md).
- Ajuste automático de contexto local: [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).

## Limitações atuais

- A escolha automática depende da detecção de VRAM e fornecedor de GPU.
- CUDA é escolhida apenas para NVIDIA com VRAM suficiente.
- AMD e Intel usam Vulkan quando há VRAM suficiente.
- Se qualquer engine já estiver baixada, a preparação automática na abertura não baixa outra engine recomendada.
- O download depende do layout de nomes dos assets publicados pelo `llama.cpp`.
- O preparo automático não valida benchmark, driver, throughput ou estabilidade real da GPU.
- A preparação automática não seleciona nem baixa modelo GGUF; ela cuida apenas da engine.

## Arquivos relacionados

- `src/services/AtlasEngineDownloadService.ts`: seleção, download, extração, fallback e validação da engine.
- `src/services/AtlasLocalEngineService.ts`: resolução do executável e inicialização do `llama-server`.
- `src/services/HardwareDiagnosticService.ts`: coleta de GPU, fornecedor e VRAM.
- `src/providers/ChatViewProvider.ts`: preparo automático na abertura, início opcional e comando de download.
- `src/providers/ChatMessageRouter.ts`: mensagens de configuração, verificação e download da engine selecionada.
- `src/webview/atlas/scripts/engine-download.js`: estado visual da engine selecionada e download sob demanda.
- `src/webview/atlas/scripts/settings.js`: leitura e salvamento de `custom.localEngine`.
- `src/webview/atlas/scripts/message-bus.js`: tratamento das respostas do backend.
- `src/repository/AtlasConfigDefaults.ts`: defaults de `prepareOnAtlasOpen`, streaming e timeout local.
