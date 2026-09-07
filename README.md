ATLAS é uma extensão para Visual Studio Code que atua como um assistente técnico, lógico e arquitetural de software. A proposta do projeto é ajudar desenvolvedores a analisar código, discutir decisões de design, revisar riscos arquiteturais e interagir com modelos de linguagem diretamente dentro do editor.

O identificador canônico da extensão é `vscode.atlas`. No catálogo de extensões, o produto é apresentado como **ATLAS** e usa o logo disponível em `assets/atlas-logo.png`.

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
- RAG local com ChromaDB gerenciado pela extensão, embeddings locais, seletor múltiplo de pastas antes da indexação do workspace ou de uma pasta-base, detecção preventiva de pastas grandes com alternativa de processamento sequencial por subpastas, materiais complementares e recuperação semântica integrada ao chat, inclusive a partir de uma pasta-mãe que contenha projetos já indexados.
- Tela RAG com projetos indexados, remoção individual ou de todos os projetos, materiais complementares, status da base vetorial, progresso por arquivos/chunks, cancelamento, seleção de modelo de embeddings e carregamento inicial não bloqueante.
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
- `docs`: documentação e materiais de modelagem do projeto.
- `resources`: runtimes e artefatos empacotáveis, incluindo ChromaDB, o runtime privado do Linux e modelos de embeddings quando preparados para distribuição.
- `scripts`: preparação dos runtimes, download do modelo de embeddings, testes de integração e empacotamento por plataforma.

Configuração, histórico, modelos locais, engines baixadas e dados do RAG são gravados fora da pasta instalada da extensão, sob o `globalStorageUri` do VS Code, salvo quando o usuário escolhe diretórios personalizados.

## Documentação técnica

- [Guia rápido de desenvolvimento](vsc-extension-quickstart.md)
- [Resumo arquitetural](docs/resumo-arquitetura-atlas.md)
- [Fluxo completo de geração de resposta](docs/processo-geracao-resposta-atlas.md)
- [Refatoração e edição aplicada](docs/processo-refatoracao-edicao-aplicada-atlas.md)
- [Montagem de prompt e resolução de modo](docs/processo-prompts-modos-atlas.md)
- [Prompts de comportamento do ATLAS](src/prompt/README.md)
- [Sistema de configuração](docs/processo-configuracao-atlas.md)
- [Análise rápida](docs/processo-analise-rapida-atlas.md)
- [Execução local e lifecycle da engine](docs/processo-engine-local-atlas.md)
- [Configuração automática da engine](docs/processo-configuracao-automatica-engine-atlas.md)
- [Compatibilidade de hardware para modelos locais](docs/processo-compatibilidade-hardware-modelos-locais-atlas.md)
- [Repositório e download de modelos](docs/processo-repositorio-modelos-atlas.md)
- [Integração cloud](docs/processo-integracao-cloud-atlas.md)
- [Sessões, histórico e resumo](docs/processo-sessoes-historico-resumo-atlas.md)
- [Build, empacotamento e distribuição](docs/processo-build-empacotamento-distribuicao-atlas.md)
- [Processos de contexto, janela local e RAG](docs/processos-contexto-rag-atlas.md)
- [Plano e estado do RAG](docs/plano-implementacao-rag-atlas.md)
- [Diagramas gerais](docs/plantuml-diagramas-gerais-atlas.md)
- [Diagramas por caso de uso](docs/plantuml-diagramas-por-caso-de-uso-atlas.md)
