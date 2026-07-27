# Processo da Engine Local

Atualizado em 24 de julho de 2026.

Este documento descreve a execução local com `llama-server`, incluindo seleção de modelo, lifecycle da engine, health check, troca de parâmetros e relação com a Biblioteca.

Para o ajuste automático específico de janela de contexto, consulte também [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).

Para a escolha, download e validação automática dos binários do `llama.cpp`, consulte também [Processo de configuração automática da engine](processo-configuracao-automatica-engine-atlas.md).

## Componentes

```text
AtlasInferenceService
  -> LocalApiService
     -> AtlasLocalEngineService
     -> AtlasConfigManager
```

Componentes auxiliares:

```text
AtlasLocalModelDiscoveryService
AtlasEngineDownloadService
ChatModelWebviewService
ChatMessageRouter
```

## Descoberta de modelos locais

`AtlasLocalModelDiscoveryService.refreshLocalModels` procura arquivos:

```text
*.gguf
```

na pasta configurada em:

```text
custom.localModels.modelsDir
```

Se não houver pasta configurada:

```text
<extensionPath>/models
```

Cada arquivo gera id:

```text
local/<nome-do-arquivo-sem-extensão>
```

Defaults do modelo:

```text
temperature: 0.4
maxTokens: 8192
topP: 0.95
gpuLayers: 0
contextWindow: 8192
baseUrl: http://127.0.0.1:8080/v1
engine: llama.cpp
```

## Biblioteca local

`ChatModelWebviewService` envia à Webview:

- lista de modelos locais;
- tamanho total;
- engine ativa/parada;
- tipo de engine configurado;
- memória de GPU, quando detectada;
- contagem de camadas GGUF, quando possível;
- parâmetros editáveis.

Parâmetros salvos por `saveModelParams`:

```text
gpuLayers
contextWindow
maxTokens
temperature
topP
```

Se o modelo salvo for o ativo, a engine é parada para que a próxima execução suba com parâmetros novos.

## Seleção de engine

Campo:

```text
custom.localEngine.engineType
```

Valores:

```text
cpu
cuda
vulkan
```

Pastas esperadas dentro de `enginesDir`:

```text
llama.cpp
llama.cpp-cuda
llama.cpp-vulkan
```

O download e a validação dessas pastas são feitos por `AtlasEngineDownloadService`, descrito em [Processo de configuração automática da engine](processo-configuracao-automatica-engine-atlas.md).

## Resolução do executável

`AtlasLocalEngineService.resolveLlamaServerExecutable` tenta:

1. `model.custom.llamaServerPath`;
2. `custom.localEngine.llamaServerPath`;
3. `<enginesDir>/<engineFolder>/llama-server.exe`;
4. `<enginesDir>/<engineFolder>/llama-server`;
5. fallback CPU: `<enginesDir>/bin/llama-server.exe`;
6. fallback CPU: `<enginesDir>/bin/llama-server`;
7. último fallback: `llama-server.exe` no Windows ou `llama-server` em outros sistemas.

Se CUDA/Vulkan forem selecionados e a pasta esperada não existir, o serviço lança erro.

## Inicialização

`LocalApiService.sendChat` chama:

```text
localEngineService.ensureEngine(model)
```

O serviço reutiliza o processo se:

- já existe processo;
- mesmo model id;
- mesmo tipo de engine;
- mesmo executável.

Caso contrário, para a engine anterior e inicia outra.

## Argumentos do llama-server

Argumentos atuais:

```text
--host 127.0.0.1
--port 8080
--model <model.path>
--ctx-size <model.parameters.contextWindow || 8192>
```

Se `gpuLayers >= 0`, adiciona:

```text
--n-gpu-layers <gpuLayers>
```

O valor `0` é tratado como automático: o ATLAS envia `--n-gpu-layers 0` para permitir que a engine aplique o comportamento de auto-fit em vez de omitir o argumento.

## Health check

Após spawn, o serviço espera até 30 segundos.

Endpoints testados:

```text
http://127.0.0.1:8080/health
http://127.0.0.1:8080/v1/models
```

Se nenhum responder ou o processo morrer antes, a inicialização falha.

## Status na Webview

`AtlasLocalEngineService.onStatus` permite ao `ChatViewProvider` enviar:

```text
engineLocalStatus
```

Mensagens normais:

```text
Inicializando a engine local para <modelo>.
Inicializando a engine CPU/CUDA/VULKAN.
Engine local pronta: <modelo>.
```

Quando o reinício é por atualização de parâmetros:

```text
Reiniciando a engine local para aplicar os novos parâmetros de <modelo>.
Aplicando novos parâmetros na engine CPU/CUDA/VULKAN.
Engine local pronta: <modelo>.
```

## Chamada à API local

Endpoint:

```text
http://127.0.0.1:8080/v1/chat/completions
```

Payload:

```json
{
  "model": "apiModelName ou id",
  "messages": [],
  "temperature": 0.4,
  "max_tokens": 8192,
  "top_p": 0.95,
  "stream": true
}
```

`LocalApiService` normaliza mensagens para o padrão esperado pelo llama.cpp:

- junta mensagens `system`;
- remove mensagens vazias;
- evita começar com `assistant`;
- junta mensagens consecutivas do mesmo papel.

## Comportamento customizado por modelo

Se o modelo local tiver:

```text
model.custom.systemPrompt
```

`LocalApiService.applyModelBehavior` injeta uma mensagem system adicional, exceto em quick analysis.

## Timeout local

Configuração:

```text
custom.localEngine.timeout
```

Default:

```text
30 segundos
```

Valor especial:

```text
0 segundos = aguarda indefinidamente
```

Para streaming, a chamada usa timeout. Para não-streaming, o serviço verifica antes se backend responde e depois deixa a geração sem timeout rígido.

## Streaming local

Quando streaming está ativo:

1. lê SSE linha por linha;
2. processa linhas `data:`;
3. ignora fragmentos JSON incompletos;
4. acumula `fullContent`;
5. chama `onChunk` para cada delta;
6. finaliza em `[DONE]` ou fim do stream.

Se a resposta final ficar vazia, lança erro.

## Overflow e ajuste automático

Quando a engine retorna erro de contexto, `LocalApiService` pode:

1. detectar overflow;
2. calcular novo `contextWindow`;
3. salvar no modelo;
4. chamar:

```text
restartEngine(model, { reason: "parameter-update" })
```

5. reenviar a requisição.

Esse processo é descrito em detalhe em [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).

## Parada da engine

`stopEngine`:

- limpa referências internas;
- tenta `process.kill()`;
- se `force` estiver ativo no Windows, usa `taskkill /T /F`.

Chamadas que podem parar a engine:

- troca para modo cloud;
- troca de modelo local;
- salvamento de parâmetros do modelo ativo;
- alteração de Configurações Gerais;
- troca de pasta de modelos/engines;
- encerramento da extensão.

## Logs

Prefixos principais:

```text
[ATLAS local engine]
[ATLAS local]
```

São logados:

- stdout/stderr do processo;
- falhas de taskkill;
- ajuste dinâmico de parâmetros;
- reinício para aplicar parâmetros;
- engine pronta após ajuste.

## Relações com outros processos

- Geração: [Processo de geração de resposta](processo-geracao-resposta-atlas.md).
- Configuração: [Processo de configuração](processo-configuracao-atlas.md).
- Contexto/tokens: [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).
