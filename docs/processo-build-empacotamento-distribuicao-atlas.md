# Build, empacotamento e distribuição

Atualizado em 15 de agosto de 2026 com base nos scripts e artefatos presentes no repositório.

Este documento descreve como preparar o ATLAS para distribuição como extensão VS Code, incluindo ChromaDB, embeddings, runtime ONNX, geração do VSIX, limitações atuais de plataforma e conteúdo esperado em `resources`.

## Objetivo do pacote

O pacote distribuível deve conter:

- `dist/extension.js`, gerado pelo `esbuild`;
- manifesto `package.json`;
- assets da Webview usados pela extensão;
- runtime local do ChromaDB preparado para a plataforma alvo;
- runtime local de embeddings preparado para a plataforma alvo;
- modelo padrão de embeddings, quando o build baixar e empacotar esse modelo;
- arquivos de suporte em `resources`.

O pacote não deve depender de Python, Docker ou instalação manual do ChromaDB pelo usuário.

## Scripts principais

Os scripts ficam em `package.json`.

```bash
npm install
npm run check-types
npm run lint
npm run compile
npm run package
npm run vsix
```

Função de cada etapa:

| Script | Função |
| --- | --- |
| `npm run check-types` | Executa `tsc --noEmit`. |
| `npm run lint` | Executa `eslint src`. |
| `npm run compile` | Valida tipos, roda lint e gera `dist/extension.js` em modo desenvolvimento. |
| `npm run prepare-rag-runtime` | Copia o binding nativo do ChromaDB para `resources/chroma/<platform>-<arch>/` conforme o target atual. |
| `npm run prepare-embedding-model` | Baixa o modelo padrão de embeddings para `resources/embeddings/atlas-embedding/`. |
| `npm run prepare-embedding-runtime` | Instala dependências e opcionais do runtime de embeddings para o target atual, recupera binários nativos ausentes de ONNX/Sharp e remove plataformas não distribuídas. |
| `npm run package` | Prepara RAG, embeddings, runtime, valida tipos, roda lint e gera bundle de produção. |
| `npm run vsix` | Gera o pacote padrão `atlas-win32-x64.vsix`. |
| `npm run vsix:win32-x64` | Gera `atlas-win32-x64.vsix`. |
| `npm run vsix:linux-x64` | Gera `atlas-linux-x64.vsix`. |
| `npm run vsix:linux-arm64` | Gera `atlas-linux-arm64.vsix`. |

`vscode:prepublish` aponta para `npm run package`, então a geração por `vsce` também passa pelo fluxo de preparação antes de montar o VSIX.

## Fluxo recomendado de release

1. Atualizar `version`, `displayName`, `publisher`, descrição e metadados necessários em `package.json`.
2. Instalar dependências com `npm install`.
3. Rodar `npm run package`.
4. Rodar `npm run test-rag-runtime`.
5. Rodar `npm run test-rag-semantic` quando o modelo padrão de embeddings estiver disponível.
6. Gerar o VSIX do target desejado com `npm run vsix`, `npm run vsix:win32-x64`, `npm run vsix:linux-x64` ou `npm run vsix:linux-arm64`.
7. Instalar o VSIX localmente em um VS Code limpo.
8. Validar abertura da Webview, chat cloud, chat local, RAG, indexação e análise rápida.

Para instalar manualmente o pacote gerado:

```bash
code --install-extension atlas-win32-x64.vsix
# ou
code --install-extension atlas-linux-x64.vsix
```

Também é possível instalar pelo VS Code em `Extensions > Install from VSIX...`.

## Preparação do ChromaDB

O ChromaDB é usado como banco vetorial local do RAG.

O script responsável é:

```bash
npm run prepare-rag-runtime
```

Esse script executa `scripts/copy-chroma-runtime.mjs`.

Comportamento atual:

1. Resolve o target solicitado por `--target`, `ATLAS_PACKAGE_TARGET`, `npm_config_atlas_target`, `npm_config_target` ou pela plataforma corrente.
2. Resolve o pacote nativo do ChromaDB correspondente ao target, como `chromadb-js-bindings-win32-x64-msvc`, `chromadb-js-bindings-linux-x64-gnu` ou `chromadb-js-bindings-linux-arm64-gnu`.
3. Cria `resources/chroma/<platform>-<arch>/`.
4. Copia o binding para `resources/chroma/<platform>-<arch>/chromadb-binding.node`.
5. Evita cópia quando o arquivo de destino já existe com o mesmo tamanho.
6. Falha o build se o binding nativo do target solicitado não estiver disponível, para evitar um VSIX quebrado silenciosamente.

O runner empacotado fica em:

```text
resources/chroma/chroma-runner.cjs
```

Em runtime, `AtlasChromaService`:

1. procura `resources/chroma/<process.platform>-<process.arch>/chromadb-binding.node`;
2. se estiver em ambiente de desenvolvimento, tenta resolver o pacote nativo por `require.resolve`;
3. inicia `resources/chroma/chroma-runner.cjs` com `process.execPath`;
4. define `ATLAS_CHROMA_BINDING` apontando para o binding escolhido;
5. usa `ELECTRON_RUN_AS_NODE=1`;
6. sobe o ChromaDB em `127.0.0.1` com porta livre;
7. grava os dados em `context.globalStorageUri/rag/chroma/`;
8. aguarda heartbeat por até 30 segundos.

Os dados vetoriais do usuário não entram no VSIX. Eles são criados no storage global da extensão durante o uso.

## Preparação do modelo de embeddings

O script responsável é:

```bash
npm run prepare-embedding-model
```

Esse script executa `scripts/download-embedding-model.mjs`.

Modelo atual:

```text
Xenova/paraphrase-multilingual-MiniLM-L12-v2
```

Destino no pacote:

```text
resources/embeddings/atlas-embedding/
```

Arquivos baixados:

```text
config.json
special_tokens_map.json
tokenizer.json
tokenizer_config.json
unigram.json
onnx/model_quantized.onnx
atlas-model.json
```

Metadados gerados em `atlas-model.json`:

| Campo | Valor atual |
| --- | --- |
| `name` | `Modelo padrão (paraphrase-multilingual-MiniLM-L12-v2)` |
| `source` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` |
| `revision` | `main` |
| `task` | `feature-extraction` |
| `dimensions` | `384` |
| `quantization` | `int8` |

Em runtime, o ATLAS descobre modelos em:

1. exclusivamente na pasta configurada em `rag.embeddingModelsDir`, quando definida;
2. `context.globalStorageUri/rag/embedding-models/` e `resources/embeddings/`, quando nenhuma pasta foi escolhida.

Modelos baixados pelo usuário na interface não entram no VSIX. Eles ficam na pasta gravável ativa.

## Preparação do runtime de embeddings

O script responsável é:

```bash
npm run prepare-embedding-runtime
```

Esse script executa `scripts/prepare-embedding-runtime.mjs`, que:

1. resolve o target de plataforma;
2. roda `npm install --prefix resources/embedding-runtime --omit=dev --include=optional --no-package-lock --os=<os> --cpu=<cpu>`;
3. verifica se o binding nativo esperado do `onnxruntime-node` existe;
4. verifica se os pacotes nativos esperados do Sharp existem;
5. quando algum artefato nativo está ausente, usa `npm pack` em diretório temporário e extrai apenas o pacote necessário;
6. executa `scripts/prune-embedding-runtime.mjs --target <platform>-<arch>` para manter somente os binários nativos do target;
7. valida novamente ONNX Runtime e Sharp depois da poda.

O `package.json` local de `resources/embedding-runtime` instala:

```json
{
  "onnxruntime-node": "1.21.0",
  "sharp": "0.34.5"
}
```

`AtlasEmbeddingService` adiciona `resources/embedding-runtime/node_modules` ao `NODE_PATH` antes de carregar `@huggingface/transformers`.

Para ONNX Runtime, o arquivo validado é:

```text
resources/embedding-runtime/node_modules/onnxruntime-node/bin/napi-v3/<os>/<arch>/onnxruntime_binding.node
```

Para Sharp, o script valida o pacote `@img/sharp-*` do target e, nos targets que exigem libvips separado, também valida `@img/sharp-libvips-*`. Em Linux, por exemplo, `linux-x64` e `linux-arm64` preservam tanto `sharp-linux-*` quanto `sharp-libvips-linux-*`.

O runtime é local:

- `allowRemoteModels = false`;
- `allowLocalModels = true`;
- `local_files_only = true`;
- o modelo ativo precisa existir em disco;
- `model_quantized.onnx` usa dtype `q8`;
- `model.onnx` usa dtype `fp32`.

## Poda de plataformas do runtime de embeddings

`scripts/prune-embedding-runtime.mjs` mantém no `onnxruntime-node` apenas o diretório nativo do target atual:

```text
resources/embedding-runtime/node_modules/onnxruntime-node/bin/napi-v3/<os>/<arch>/
```

Também remove pacotes `@img/sharp-*` e `@img/sharp-libvips-*` que não pertencem ao target, preservando apenas os artefatos necessários para aquela plataforma.

Depois da poda, o runtime distribuído fica reduzido ao target selecionado, por exemplo `win32-x64`, `linux-x64` ou `linux-arm64`.

Essa poda reduz o tamanho do VSIX sem transformar o pacote em universal. Cada VSIX deve conter os binários nativos de uma única plataforma.

## Conteúdo esperado em resources

Antes da preparação, o repositório mantém apenas estrutura e arquivos de suporte:

```text
resources/
├── chroma/
│   └── chroma-runner.cjs
├── embedding-runtime/
│   └── package.json
└── embeddings/
    └── README.md
```

Depois de `npm run package`, o conteúdo esperado para o alvo atual inclui:

```text
resources/
├── chroma/
│   ├── chroma-runner.cjs
│   └── <platform>-<arch>/
│       └── chromadb-binding.node
├── embedding-runtime/
│   ├── package.json
│   └── node_modules/
│       ├── @img/
│       ├── onnxruntime-node/
│       └── sharp/
└── embeddings/
    ├── README.md
    └── atlas-embedding/
        ├── atlas-model.json
        ├── config.json
        ├── special_tokens_map.json
        ├── tokenizer.json
        ├── tokenizer_config.json
        ├── unigram.json
        └── onnx/
            └── model_quantized.onnx
```

Não entram em `resources` por padrão:

- modelos GGUF de chat;
- binários do `llama.cpp`;
- índices ChromaDB gerados pelo usuário;
- modelos de embeddings baixados pela interface para o storage do usuário;
- configurações e histórico do usuário.

## O que entra no VSIX

O VSIX é controlado pelo bundle produzido em `dist/` e pelas regras de `.vscodeignore`.

Atualmente são excluídos do pacote:

- `.vscode/`;
- `.vscode-test/`;
- `out/`;
- `node_modules/` da raiz;
- `scripts/`;
- `docs/`;
- `models/`;
- `engine/`;
- `src/**/*.ts`;
- mapas `.map`;
- arquivos auxiliares de empacotamento e instalação.

Isso significa que o VSIX contém o código compilado e os recursos preparados, mas não contém a documentação técnica do repositório nem os scripts de preparação.

## Relação com engines locais

O fluxo de distribuição atual não empacota `llama.cpp`.

`AtlasLocalEngineService` procura o `llama-server` em:

1. `model.custom.llamaServerPath`;
2. `custom.localEngine.llamaServerPath`;
3. `<enginesDir>/<engineFolder>/llama-server.exe`;
4. `<enginesDir>/<engineFolder>/llama-server`;
5. fallback CPU em `<enginesDir>/bin/`;
6. fallback final no PATH do sistema.

Como `.vscodeignore` exclui `engine/`, o VSIX não sai com binários do `llama.cpp`. A experiência atual, porém, não depende apenas de configuração manual: `AtlasEngineDownloadService` pode baixar o release mais recente do `llama.cpp` em runtime, escolher CPU/CUDA/Vulkan por hardware ou respeitar o modo configurado e gravar os arquivos em `custom.localEngine.enginesDir` ou, por padrão, em `context.globalStorageUri/engine`.

Para empacotar engines diretamente no VSIX no futuro, será necessário:

- remover ou ajustar a exclusão de `engine/` em `.vscodeignore`;
- separar VSIX por plataforma e aceleração;
- definir política de tamanho e licenças;
- validar CPU, CUDA e Vulkan por artefato;
- atualizar o seletor e a documentação de plataforma.

## Distribuição por plataforma

O ATLAS não gera um pacote universal contendo Windows e Linux ao mesmo tempo. Cada VSIX deve ser produzido para um único target, porque ChromaDB, ONNX Runtime e Sharp dependem de binários nativos específicos por sistema operacional e arquitetura.

Targets com scripts de release no `package.json`:

```text
win32-x64      -> npm run vsix:win32-x64   -> atlas-win32-x64.vsix
linux-x64      -> npm run vsix:linux-x64   -> atlas-linux-x64.vsix
linux-arm64    -> npm run vsix:linux-arm64 -> atlas-linux-arm64.vsix
```

`npm run vsix` permanece como atalho para `win32-x64`.

Cada target precisa de:

- binding ChromaDB próprio em `resources/chroma/<platform>-<arch>/`;
- runtime ONNX compatível em `resources/embedding-runtime`;
- pacotes Sharp nativos compatíveis;
- alvo VSCE correspondente;
- validação do ChromaDB;
- validação de embeddings;
- validação do tamanho final do VSIX.

O runner do ChromaDB e o código da extensão conhecem múltiplas plataformas, mas o artefato final distribuído deve carregar somente os binários do target escolhido.

Engines `llama.cpp` continuam fora do VSIX. Elas são baixadas em runtime ou configuradas manualmente pelo usuário.

## Validações recomendadas

Antes de distribuir:

```bash
npm run check-types
npm run lint
npm run package
npm run test-rag-runtime
npm run test-rag-semantic
npm run vsix
```

Depois de instalar o VSIX:

- abrir o painel ATLAS;
- confirmar que a Webview carrega;
- configurar uma chave cloud e enviar uma pergunta simples;
- selecionar um modelo local GGUF e iniciar a engine;
- indexar um workspace pequeno;
- verificar logs do ChromaDB;
- testar busca semântica com RAG habilitado;
- testar download ou seleção do modelo de embeddings;
- testar análise rápida em um arquivo com diagnóstico real;
- reiniciar o VS Code e confirmar persistência de configuração, histórico e índice.

## Falhas comuns

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| `Runtime ChromaDB não encontrado` | Binding nativo não foi copiado para `resources/chroma/<platform>-<arch>/`. | Rodar `npm run prepare-rag-runtime` e conferir a plataforma alvo. |
| ChromaDB não fica pronto em 30 segundos | Binding incompatível, porta indisponível ou erro no runner. | Verificar logs `[ATLAS ChromaDB]` e testar `npm run test-rag-runtime`. |
| Modelo de embeddings não encontrado | `resources/embeddings/atlas-embedding` não existe ou o usuário selecionou modelo ausente. | Rodar `npm run prepare-embedding-model` ou baixar pelo painel RAG. |
| Erro de ONNX no VSIX | `resources/embedding-runtime/node_modules` não foi preparado ou foi podado para outra plataforma. | Rodar `npm run prepare-embedding-runtime` e validar arquitetura. |
| VSIX muito grande | Modelo, runtime ou engines foram incluídos sem poda. | Revisar `resources`, `.vscodeignore` e artefatos por plataforma. |
| Engine local não inicia após instalar VSIX | Download automático falhou, pacote não possui `llama-server`, engine configurada não existe ou `llamaServerPath` aponta para arquivo ausente. | Rodar `ATLAS: Baixar engine local automaticamente`, conferir `custom.localEngine.enginesDir` e validar o modo CPU/CUDA/Vulkan selecionado. |

## Relação com outros documentos

- [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md)
- [Execução local e lifecycle da engine](processo-engine-local-atlas.md)
- [Configuração automática da engine](processo-configuracao-automatica-engine-atlas.md)
- [Sistema de configuração](processo-configuracao-atlas.md)
- [Plano e estado do RAG](plano-implementacao-rag-atlas.md)
