# Atualização da Documentação V3 do ATLAS

Este README registra os pontos do arquivo `V3 - ATLAS - Documentação do Projeto.pdf` que precisam ser atualizados quando comparados com a arquitetura atual do projeto ATLAS no código-fonte.

## Arquitetura atual observada

O ATLAS está implementado como uma extensão do Visual Studio Code em TypeScript. O ponto de entrada é `src/extension.ts`, que registra a Webview principal `atlas-chat.view` por meio de `ChatViewProvider`.

A arquitetura atual está organizada nos seguintes blocos:

- `src/providers`: orquestração da Webview, roteamento de mensagens, abertura de painéis, coleta de contexto do editor e controle da análise rápida.
- `src/services`: integração com provedores em nuvem, execução local, descoberta de modelos locais, inferência, sessões, seleção de contexto e configurações.
- `src/managers`: fachadas para configuração e chaves de API.
- `src/repository`: persistência local de configurações e histórico em arquivos JSON dentro da pasta `config`.
- `src/prompt`: camada de sistema, resolução de modo, montagem de mensagens e customização controlada do comportamento do modelo.
- `src/webview`: telas de chat, chaves de API, configurações do ATLAS, biblioteca local e busca de modelos.
- `models`: pasta usada para descoberta de modelos locais no formato `.gguf`.
- `engine`: pasta esperada para binários do `llama.cpp` nas variações CPU, CUDA e Vulkan.

## Pontos que precisam de atualização no documento V3

### 1. Análise estrutural ampla do projeto

O documento afirma que o sistema deve identificar classes, interfaces, métodos, dependências e mapear relações estruturais entre módulos.

No código atual, o ATLAS ainda não possui parser estrutural, indexador de projeto ou grafo de dependências. A análise usa o conteúdo do arquivo aberto ou do trecho selecionado no editor como contexto textual enviado ao modelo.

Atualização sugerida:

- Tratar a leitura do arquivo aberto e do trecho selecionado como funcionalidade implementada.
- Tratar mapeamento estrutural completo, relações entre módulos e análise de projeto inteiro como evolução futura.

### 2. RAG e base vetorial

O documento lista RAG, indexação do projeto, base vetorial local, atualização incremental, inclusão de documentos externos e integração do RAG com modelos locais e em nuvem.

Na arquitetura atual, existem configurações e pontos de extensão para RAG (`rag` em `AtlasConfigDefaults` e `ragContext` em `AtlasPromptAssemblyService`), mas não há implementação de indexação, embeddings, armazenamento vetorial, recuperação semântica, tela funcional de RAG ou inclusão de documentos externos. Também não existe pasta `src/webview/rag`, apesar de `ChatPanelManager` referenciar essa visão.

Atualização sugerida:

- Marcar RF12, RF13, RF14, RF15, RNF16, RNF17, RNF18, RNF19 e RNF20 como planejados para evolução futura.
- Informar que a camada de prompt já aceita contexto RAG, mas o mecanismo de recuperação ainda não foi implementado.
- Corrigir qualquer trecho que dê a entender que a base vetorial já está funcional.

### 3. Hugging Face, busca e download de modelos

O documento diz que a interface permite busca, visualização, download e gerência de modelos disponíveis no Hugging Face via API.

No código atual, a tela `src/webview/search` exibe dados estáticos de modelos e detalhes simulados. Não há serviço de integração com a API do Hugging Face, busca remota real ou download automatizado de modelos.

Atualização sugerida:

- Descrever a tela de busca como protótipo visual ou repositório estático de modelos.
- Manter busca real no Hugging Face e download automatizado como funcionalidades futuras.

### 4. Diagnóstico de compatibilidade de hardware

O documento prevê detecção de RAM, GPU, VRAM e CPU, com sugestão automática de modelos compatíveis.

Na implementação atual, a tela de busca mostra informações de compatibilidade preenchidas estaticamente. Não existe serviço que leia hardware real da máquina ou faça diagnóstico automático.

Atualização sugerida:

- Alterar RF08 para indicar que o diagnóstico automático de hardware ainda não está implementado.
- Informar que a compatibilidade exibida hoje é um apoio visual/protótipo, não uma medição real do ambiente.

### 5. Execução local de modelos

O documento descreve suporte a modelos locais e configuração automática do ambiente.

No código atual, o suporte local está mais específico: o ATLAS descobre arquivos `.gguf` na pasta `models`, registra metadados, permite selecionar um modelo local, configura parâmetros e inicia uma engine `llama.cpp` em `127.0.0.1:8080` usando CPU, CUDA ou Vulkan quando os binários estão disponíveis.

Ainda não há instalação automática de dependências, download de runtime, preparação completa do ambiente ou detecção automática de CPU/GPU.

Atualização sugerida:

- Detalhar que a execução local atual depende de arquivos `.gguf` em `models` e de binários `llama-server` disponíveis em `engine/llama.cpp`, `engine/llama.cpp-cuda` ou `engine/llama.cpp-vulkan`.
- Marcar configuração automática completa do ambiente local como evolução futura.
- Incluir a opção de iniciar a engine automaticamente ao abrir o ATLAS quando `startOnAtlasOpen` estiver habilitado.

### 6. Provedores em nuvem

O documento menciona integração com modelos em nuvem de forma geral.

A implementação atual suporta provedores OpenAI-compatible, Claude e Gemini. A configuração padrão inclui OpenAI, OpenRouter, Groq, Claude, Gemini e xAI. As chaves são armazenadas com o Secret Storage do VS Code.

Atualização sugerida:

- Atualizar a seção de provedores para listar os provedores padrão atuais.
- Explicar que provedores customizados podem ser cadastrados com nome, URL base, tipo e chave.
- Informar que a listagem de modelos é feita por provedor quando a API permite.

### 7. Streaming de resposta

O documento afirma que o sistema deve permitir streaming quando o provedor suportar.

Na arquitetura atual, o streaming real por SSE está implementado para provedores OpenAI-compatible e para a engine local compatível com OpenAI. Para Claude e Gemini, quando a interface solicita streaming, o serviço usa um fallback: recebe a resposta completa e envia o conteúdo de uma vez.

Atualização sugerida:

- Especificar que o streaming incremental está implementado para OpenAI-compatible e local.
- Registrar que Claude e Gemini ainda usam fallback não incremental.

### 8. Análise rápida do arquivo atual

O documento descreve um comando de análise rápida que analisa o arquivo aberto, retorna uma lista estruturada e aplica marcações visuais.

Essa funcionalidade está implementada por `AtlasQuickAnalysisService` e `AtlasQuickAnalysisController`, acionada pela Webview. O modelo deve retornar JSON válido; o sistema valida as linhas e aplica decorações coloridas no editor com mensagem em hover.

Atualização sugerida:

- Ajustar o termo "comando" para "ação acionada pela interface da Webview", salvo se um comando formal do VS Code for registrado futuramente em `package.json`.
- Explicar que as marcações atuais são decorações e hover, não comentários persistidos no arquivo.

### 9. Histórico de chats e memória arquitetural

O documento cita histórico de chats e resumo arquitetural de conversas longas.

Essa parte está implementada em `AtlasSessionService` e `AtlasHistoryRepository`. O sistema mantém sessões, cria títulos automáticos, permite listar, trocar, renomear e excluir sessões. Conversas longas usam janela deslizante de mensagens recentes e resumo arquitetural em segundo plano.

Atualização sugerida:

- Manter esse requisito como implementado.
- Adicionar o detalhe técnico da janela deslizante de 10 mensagens e do resumo arquitetural persistido por sessão.

### 10. Camada de sistema e comportamento do modelo

O documento descreve camada de sistema, comportamento padrão, estrutura de resposta e customização parcial pelo usuário.

Essa arquitetura está implementada em `src/prompt`, com:

- `AtlasSystemPromptPolicyService`: prompts base por modo.
- `AtlasPromptModeResolver`: resolução do modo de resposta.
- `AtlasPromptCustomizationService`: customização controlada pelo usuário.
- `AtlasPromptAssemblyService`: montagem final das mensagens.

Atualização sugerida:

- Manter RF16, RF17, RF18, RF19 e RNF21 como implementados.
- Especificar os modos atuais: assistente de desenvolvimento, análise arquitetural, análise rápida e modo estudo.

### 11. Biblioteca local de modelos

O documento cita biblioteca local com lista de modelos, tamanho, data, informações e ativação de modelo padrão.

Essa parte está parcialmente implementada. O ATLAS descobre modelos `.gguf`, mostra metadados, permite editar nome/provedor, alterar parâmetros, salvar comportamento local personalizado, selecionar modelo e excluir arquivo `.gguf` da pasta `models`.

Atualização sugerida:

- Marcar gerenciamento de modelos locais como parcialmente implementado.
- Separar descoberta/seleção/edição/exclusão local, que já existem, de download automatizado, que ainda não existe.

### 12. Interface e painéis

O documento fala em chat, painéis, biblioteca e configurações.

Na implementação atual existem telas para:

- Chat principal.
- Gerenciamento de chaves de API.
- Configurações do ATLAS.
- Biblioteca local.
- Busca/detalhes de modelos.

Não há tela funcional de RAG no diretório `src/webview`.

Atualização sugerida:

- Atualizar a descrição da interface para refletir apenas as telas existentes.
- Remover ou marcar a tela de RAG como pendente até que `src/webview/rag` exista.

### 13. Requisitos não funcionais de desempenho

O documento define tempos máximos para análises em nuvem, local e RAG.

O código possui timeout configurável, execução assíncrona e tratamento de falhas, mas não há testes automatizados ou medição de desempenho que comprovem os limites de 20 segundos, 40 segundos ou 3 minutos de indexação.

Atualização sugerida:

- Reclassificar esses tempos como metas de desempenho.
- Evitar declarar esses limites como garantias já validadas.
- Remover métricas relacionadas à indexação enquanto o RAG não estiver implementado.

### 14. Segurança e privacidade

O documento afirma que o sistema permite uso offline e informa quando código será enviado para nuvem.

A arquitetura atual possui modo local, modo nuvem, chaves no Secret Storage, bloqueio de RAG para nuvem e limitação de payload. Porém o envio de contexto ao modelo depende do modo selecionado e ainda não há fluxo completo de consentimento por envio documentado no código analisado.

Atualização sugerida:

- Manter armazenamento seguro de chaves como implementado.
- Descrever controles de segurança como configurações existentes.
- Tratar consentimento explícito por chamada e política completa de privacidade como ponto a validar/evoluir.

## Resumo de status por funcionalidade

| Funcionalidade | Status atual |
| --- | --- |
| Extensão integrada ao VS Code | Implementado |
| Chat por Webview | Implementado |
| Provedores cloud | Implementado |
| Provedores customizados | Implementado |
| Chaves no Secret Storage | Implementado |
| Listagem de modelos cloud | Implementado por provedor |
| Streaming OpenAI-compatible | Implementado |
| Streaming local | Implementado |
| Streaming Claude/Gemini | Parcial, com fallback não incremental |
| Execução local via `llama.cpp` | Implementado quando binários e modelo existem |
| Descoberta de modelos `.gguf` | Implementado |
| Biblioteca local | Parcialmente implementado |
| Download de modelos | Não implementado |
| API do Hugging Face | Não implementado |
| Diagnóstico real de hardware | Não implementado |
| Análise rápida com marcações | Implementado |
| Comentários persistidos no editor | Não implementado |
| Histórico de sessões | Implementado |
| Resumo arquitetural de conversas longas | Implementado |
| Camada de sistema/prompt layer | Implementado |
| Modo estudo | Implementado |
| RAG, embeddings e base vetorial | Não implementado |
| Inclusão de documentos externos no RAG | Não implementado |
| Indexação incremental | Não implementado |

## Recomendações de alteração no PDF

1. Separar claramente o que é MVP implementado, o que é protótipo visual e o que é evolução futura.
2. Atualizar os requisitos de RAG para indicar que hoje só existem configurações e pontos de extensão, sem pipeline funcional.
3. Atualizar os requisitos de Hugging Face e download de modelos para o segundo semestre/evolução futura.
4. Corrigir a seção de diagnóstico de hardware para não afirmar detecção automática na versão atual.
5. Detalhar a arquitetura real baseada em `ChatViewProvider`, `ChatMessageRouter`, `ChatPanelManager`, serviços de inferência e camada de prompt.
6. Especificar que a análise estrutural atual é orientada por contexto textual do editor, não por análise estática completa com AST, grafo de dependências ou indexação semântica.
7. Atualizar a seção de provedores cloud com OpenAI, OpenRouter, Groq, Claude, Gemini e xAI.
8. Ajustar a descrição do streaming para diferenciar suporte incremental real e fallback.
9. Corrigir a descrição da análise rápida para "decorações no editor com hover" em vez de comentários persistidos.
10. Transformar metas de desempenho ainda não validadas em objetivos mensuráveis para testes futuros.
