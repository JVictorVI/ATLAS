# ATLAS

ATLAS é uma extensão para Visual Studio Code que atua como um assistente técnico, lógico e arquitetural de software. A proposta do projeto é ajudar desenvolvedores a analisar código, discutir decisões de design, revisar riscos arquiteturais e interagir com modelos de linguagem diretamente dentro do editor.

## Sobre o Projeto

O objetivo do ATLAS é aproximar a análise arquitetural do fluxo real de desenvolvimento. Em vez de depender apenas de revisões externas ou documentação separada, a extensão permite usar o arquivo aberto, o trecho selecionado e o histórico da conversa como contexto para respostas mais úteis.

O projeto oferece modos diferentes de interação: conversa geral de desenvolvimento, análise arquitetural formal e análise rápida do arquivo atual.

## Principais funcionalidades

- Chat integrado ao VS Code por meio de Webview.
- Seleção entre modelos locais e provedores em nuvem.
- Cadastro e gerenciamento seguro de chaves de API usando o Secret Storage do VS Code.
- Suporte a provedores compatíveis com OpenAI, Claude e Gemini.
- Respostas com streaming quando o provedor oferece suporte.
- Sessões de conversa com histórico persistido.
- Resumo arquitetural de conversas longas para manter contexto entre interações.
- Análise rápida do arquivo atual com marcações diretamente no editor, acionada pelo botão da interface ou por intenção textual no chat.
- Normalização de achados da análise rápida, com categorias arquiteturais, severidade (`low`, `medium`, `high`), sanitização de linhas e hover explicativo no editor.
- Modo de análise arquitetural com foco em decisões de design, trade-offs, evolução do risco, testabilidade e custo de mudança.
- Edição aplicada do arquivo aberto para pedidos operacionais, com detecção de intenção por heurística ou pelo modelo ativo, plano JSON validado, prévia em diff e confirmação obrigatória antes da alteração.
- Refatoração guiada por análise arquitetural, protegida pela identidade e pelo hash do arquivo analisado, com apoio opcional de análise estática e RAG.
- RAG local com ChromaDB gerenciado pela extensão, embeddings locais, indexação do workspace atual ou de uma pasta escolhida, materiais complementares e recuperação semântica integrada ao chat.
- Tela RAG com projetos indexados, materiais complementares, status da base vetorial, progresso por arquivos/chunks, cancelamento, seleção de modelo de embeddings e carregamento inicial não bloqueante.
- Configurações de execução, como temperatura, top-p, limite de tokens, timeout, streaming e ajuste automático de contexto para modelos locais.
- Biblioteca de modelos locais para visualizar e ajustar parâmetros registrados, incluindo contexto, tokens gerados, GPU, temperatura e comportamento do modelo.

## Estrutura do projeto

- `src/extension.ts`: ponto de entrada da extensão.
- `src/providers`: integração com Webviews, roteamento de mensagens e controladores de UI/editor.
- `src/services`: serviços de sessão, seleção de modelos, chamadas para APIs cloud, execução local, análise rápida e RAG.
- `src/managers`: facades de configuração e chaves de API.
- `src/repository`: leitura e escrita de configurações e histórico.
- `src/prompt`: montagem de prompts, políticas de sistema, heurística de resolução de modo e customização de comportamento.
- `src/interfaces`: contratos TypeScript usados entre serviços.
- `src/webview`: telas HTML, CSS e JavaScript da interface da extensão.
- `config`: arquivos locais de configuração e histórico usados em desenvolvimento.
- `docs`: documentação e materiais de modelagem do projeto.
- `resources`: runtimes e artefatos empacotáveis, incluindo ChromaDB, engines locais e modelos de embeddings quando preparados para distribuição.

## Documentação técnica

- [Resumo arquitetural](docs/resumo-arquitetura-atlas.md)
- [Fluxo completo de geração de resposta](docs/processo-geracao-resposta-atlas.md)
- [Refatoração e edição aplicada](docs/processo-refatoracao-edicao-aplicada-atlas.md)
- [Montagem de prompt e resolução de modo](docs/processo-prompts-modos-atlas.md)
- [Prompts de comportamento do ATLAS](src/prompt/README.md)
- [Sistema de configuração](docs/processo-configuracao-atlas.md)
- [Análise rápida](docs/processo-analise-rapida-atlas.md)
- [Execução local e lifecycle da engine](docs/processo-engine-local-atlas.md)
- [Integração cloud](docs/processo-integracao-cloud-atlas.md)
- [Sessões, histórico e resumo](docs/processo-sessoes-historico-resumo-atlas.md)
- [Build, empacotamento e distribuição](docs/processo-build-empacotamento-distribuicao-atlas.md)
- [Processos de contexto, janela local e RAG](docs/processos-contexto-rag-atlas.md)
- [Plano e estado do RAG](docs/plano-implementacao-rag-atlas.md)
- [Diagramas gerais](docs/plantuml-diagramas-gerais-atlas.md)
- [Diagramas por caso de uso](docs/plantuml-diagramas-por-caso-de-uso-atlas.md)

## Comandos úteis

```bash
npm install
npm run check-types
npm run lint
npm run compile
```

Para testar no VS Code, abra o projeto, execute a extensão em modo debug e acesse o painel ATLAS na Activity Bar.
