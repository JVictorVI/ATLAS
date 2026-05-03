# Atualizacao da Documentacao Geral do Projeto ATLAS

Este documento aponta o que precisa ser alterado ou adicionado em `ATLAS - Documentacao do Projeto.pdf`, considerando a implementacao atual do sistema. Diferente da documentacao de arquitetura, este material tem uma visao mais generalista do projeto: proposta, escopo, requisitos, cronograma, riscos e criterios de sucesso.

O objetivo desta atualizacao nao e remover funcionalidades planejadas. Recursos como RAG, ChromaDB, backend Python, llama.cpp, diagnostico de hardware e download de modelos locais continuam fazendo parte da evolucao prevista. A correcao necessaria e deixar claro o que ja foi implementado no MVP atual e o que permanece planejado para fases futuras.

## 1. Resumo Executivo da Atualizacao

A documentacao atual descreve corretamente a ambicao geral do ATLAS: uma extensao para IDE voltada a analise arquitetural de codigo com apoio de LLMs. Porem, alguns trechos tratam funcionalidades futuras como se ja fossem parte do funcionamento atual.

Recomenda-se adicionar uma secao chamada **Estado Atual da Implementacao** logo apos a identificacao/proposta do projeto ou antes dos requisitos.

Texto sugerido:

> Na versao atual, o ATLAS encontra-se implementado como uma extensao para VS Code, desenvolvida em TypeScript, com interface de chat em Webview, gerenciamento de chaves de API, selecao de provedores em nuvem, montagem de prompts especializados, personalizacao parcial do comportamento do modelo, modo estudo para respostas didaticas, analise rapida do arquivo aberto e marcacao visual de problemas arquiteturais no editor. A inferencia atualmente funcional ocorre por meio de provedores cloud, com suporte a APIs OpenAI-compatible, Claude e Gemini. Funcionalidades como execucao local de modelos, backend Python, RAG, ChromaDB, diagnostico de hardware, download de modelos e indexacao semantica do projeto permanecem planejadas para fases futuras do desenvolvimento.

## 2. Alteracoes Recomendadas por Secao

### 2.1 Proposta do Projeto

**Situacao atual do texto:** a proposta afirma que modelos poderao operar localmente ou em nuvem.

**Ajuste recomendado:** manter a proposta hibrida, mas distinguir implementacao atual de evolucao planejada.

Texto sugerido para adicionar ao final da proposta:

> No MVP atual, a integracao com modelos em nuvem ja esta operacional, permitindo que o usuario configure provedores externos, selecione modelos e envie perguntas ou solicitacoes de analise a partir da extensao. A execucao local de modelos permanece prevista na arquitetura, mas depende da implementacao futura do runtime local e dos mecanismos de gerenciamento/download de modelos.

### 2.2 Escopo Principal

**Situacao atual do texto:** o escopo lista analise estatica, avaliacao estrutural e feedback explicativo.

**Ajuste recomendado:** especificar que a analise atual e baseada em contexto do arquivo aberto ou trecho selecionado, nao em varredura estrutural completa de todo o projeto.

Texto sugerido:

> Na implementacao atual, o escopo ja cobre a analise do arquivo aberto e de trechos selecionados no editor, com feedback textual no chat e marcacoes visuais em linhas ou blocos identificados como problematicos. A analise estrutural ampla de todo o projeto, com indexacao, relacoes entre modulos e recuperacao semantica via RAG, permanece como evolucao futura.

### 2.3 Exclusoes de Escopo

**Adicionar:** deixar explicito que a ferramenta ainda nao executa refatoracoes automaticas, nao faz testes dinamicos e nao substitui revisao humana.

Texto sugerido:

> A ferramenta nao realiza refatoracao automatica do codigo, nao executa a aplicacao analisada e nao substitui revisao humana. As sugestoes e marcacoes fornecidas pelo ATLAS devem ser interpretadas como apoio tecnico a decisao arquitetural.

### 2.4 Requisitos Funcionais

**Ajuste principal:** classificar os RFs por estado atual. A documentacao original lista todos os requisitos em uma unica camada, o que pode dar a impressao de que todos ja estao implementados.

Recomenda-se adicionar uma coluna ou observacao com os estados:

- **Implementado:** disponivel no MVP atual.
- **Parcial:** existe parte da estrutura, mas nao o fluxo completo.
- **Planejado:** permanece no roadmap.

Matriz sugerida:

| Requisito | Estado atual | Observacao sugerida |
| --- | --- | --- |
| RF01 - Integracao com IDE | Implementado | A extensao VS Code ja registra Webview lateral e comando `atlas.quickAnalysis`. |
| RF02 - Leitura e Interpretacao do Codigo-Fonte | Parcial | O sistema le arquivo aberto e selecao ativa. Mapeamento completo de classes, interfaces e dependencias do projeto ainda e futuro. |
| RF03 - Analise Estrutural Estatica e Avaliacao Arquitetural | Parcial | Ja ha analise arquitetural via LLM sobre arquivo/trecho. Analise estatica estrutural completa ainda nao esta implementada. |
| RF04 - Geracao de Feedback Explicativo | Implementado | Ha feedback textual no chat e destaque visual no editor para analise rapida. |
| RF05 - Suporte a Modelos Locais | Parcial | Existe selecao/configuracao de modelos locais em estrutura de dados, mas nao ha inferencia local funcional. |
| RF06 - Integracao com Modelos em Nuvem | Implementado | Suporte a OpenAI-compatible, Claude e Gemini por `CloudApiService`. |
| RF07 - Interface de Interacao | Parcial | Chat, paineis e alternancia de modo estao implementados. Busca/download via Hugging Face ainda e futuro. |
| RF08 - Diagnostico de Compatibilidade | Planejado | Ainda nao ha deteccao de RAM, GPU, VRAM ou CPU. |
| RF09 - Biblioteca Local de Modelos | Parcial | Existe tela/registro de modelos, mas download, instalacao e remocao fisica ainda sao futuros. |
| RF10 - Configuracao de Modelo Ativo | Parcial | Temperatura, tokens, top_p, streaming e selecao de modelo/provedor existem. GPU/CPU local ainda e futuro. |
| RF11 - Configuracao Automatica do Ambiente Local | Planejado | Depende do backend/runtime local. |
| RF12 - Implementacao de RAG | Planejado | Ainda nao ha indexacao, embeddings ou base vetorial. |
| RF13 - Indexacao do Projeto | Planejado | Ainda nao ha indexador de projeto. |
| RF14 - Inclusao de Documentos Externos no RAG | Planejado | Depende do mecanismo de RAG. |
| RF15 - Integracao do RAG com Modelos Locais e em Nuvem | Planejado | Ha configuracoes relacionadas a RAG, mas nao o fluxo funcional. |
| RF16 - Definicao de Comportamento Padrao do Modelo | Implementado | `AtlasSystemPromptPolicyService` define os modos e regras de resposta. |
| RF17 - Camada de Sistema | Implementado | `AtlasPromptAssemblyService` combina prompt base, personalizacao, contexto e pergunta. Tambem aceita o modo `study-mode`. RAGContext existe como entrada prevista, mas ainda sem recuperacao real. |
| RF18 - Customizacao Parcial de Comportamento | Implementado | `AtlasPromptCustomizationService` permite diretivas complementares com preservacao das regras obrigatorias. |
| RF19 - Estrutura Padronizada de Resposta | Implementado | Existe estrutura formal em modo arquitetural, JSON obrigatorio em analise rapida e estrutura didatica em modo estudo. |
| RF20 - Historico de Chats | Planejado | O roteador envia historico vazio atualmente; armazenamento/recuperacao de conversas ainda nao foi implementado. |

## 3. Requisitos que Precisam Ser Adicionados

A implementacao atual criou funcionalidades que nao aparecem com clareza no documento original. Recomenda-se adicionar os seguintes requisitos:

### RF21 - Cancelamento de Geracao

O sistema deve permitir que o usuario cancele uma resposta em andamento, interrompendo a geracao e notificando a interface.

**Estado:** implementado.

### RF22 - Streaming de Resposta

O sistema deve permitir recebimento incremental da resposta do modelo quando o provedor suportar streaming, exibindo a resposta progressivamente na interface.

**Estado:** implementado para provedores OpenAI-compatible.

### RF23 - Gerenciamento de Provedores Customizados

O sistema deve permitir que o usuario cadastre provedores personalizados informando nome, URL base e chave de API.

**Estado:** implementado.

### RF24 - Selecao de Provedor Cloud e Listagem de Modelos

O sistema deve permitir selecionar um provedor cloud, consultar os modelos disponiveis e definir o modelo ativo para as proximas interacoes.

**Estado:** implementado.

### RF25 - Analise Rapida do Arquivo Atual

O sistema deve disponibilizar um comando de analise rapida capaz de analisar o arquivo aberto, solicitar ao modelo uma lista estruturada de problemas e aplicar marcacoes visuais no editor.

**Estado:** implementado.

### RF26 - Tratamento de Falhas de API

O sistema deve tratar falhas de autenticacao, limite de requisicoes, indisponibilidade do provedor, timeout e erros de rede, exibindo mensagens compreensiveis ao usuario.

**Estado:** implementado.

### RF27 - Modo Estudo

O sistema deve permitir que o usuario ative um modo de resposta didatico, no qual o ATLAS assume uma postura de mentor/professor, explicando conceitos, codigo e decisoes tecnicas de forma progressiva e acessivel.

**Estado:** implementado.

**Observacao:** o modo estudo e persistido em `custom.studyMode.enabled`, e a interface envia `forcedMode: "study-mode"` nas perguntas quando o modo estiver ativo.

## 4. Requisitos Nao Funcionais: Ajustes Necessarios

### RNF01 - Desempenho em Modo Nuvem

**Ajuste recomendado:** manter como meta, mas indicar que o tempo depende do provedor, do tamanho do arquivo, do modelo selecionado e da configuracao de streaming.

### RNF02 e RNF03 - Modo Local e Hardware

**Ajuste recomendado:** marcar como planejado para a fase de runtime local. Hoje o sistema possui configuracao e selecao de modo local, mas nao executa inferencia local.

### RNF05 - Seguranca e Privacidade

**Ajuste recomendado:** adicionar que chaves de API sao armazenadas via SecretStorage do VS Code e que o envio a nuvem depende de provedor/modelo/chave configurados.

Texto sugerido:

> Na implementacao atual, as chaves de API sao armazenadas no SecretStorage do VS Code. O envio de codigo para modelos em nuvem ocorre apenas quando o usuario configura um provedor, cadastra uma chave e seleciona o modo/modelo cloud correspondente.

### RNF12 - Execucao Assincrona

**Estado:** implementado. As chamadas de chat e analise usam fluxos assincronos e a geracao pode ser cancelada.

### RNF14 - Limitacao de Payload

**Estado:** parcial. Existe configuracao de `limitPayload` e `maxTokens`, mas a limitacao automatica completa do tamanho de codigo enviado ainda deve ser validada/implementada de forma mais robusta.

### RNF15 - Tratamento de Falhas

**Estado:** implementado para falhas de API e rede. O sistema diferencia autenticacao, limite de requisicoes, erros 5xx, timeout e resposta invalida.

### RNF16 a RNF20 - Indexacao, Armazenamento Vetorial e Consistencia Semantica

**Estado:** planejado. Devem permanecer vinculados ao roadmap de RAG.

### RNF22 - Controle de Seguranca

**Estado:** implementado parcialmente. O sistema sanitiza diretivas customizadas e reforca que elas nao substituem as regras obrigatorias do ATLAS.

### RNF23 - Clareza Didatica

**Adicionar:** no modo estudo, as respostas devem ser tecnicamente corretas, acessiveis, progressivas e adequadas a usuarios em aprendizado, evitando excesso de jargoes e priorizando explicacao do raciocinio.

## 5. Cronograma: Pontos que Precisam Ser Atualizados

O cronograma atual ainda faz sentido como planejamento geral, mas precisa refletir o progresso real do MVP.

### Marco ja implementado ou em andamento avancado

- Estrutura base da extensao VS Code.
- Interface principal com chat e painel lateral.
- Painel de chaves/configuracoes.
- Integracao com modelos em nuvem.
- Configuracao de parametros de execucao para cloud.
- Camada de system prompt.
- Personalizacao parcial de comportamento.
- Modo estudo para apoio didatico a estudantes.
- Analise rapida do arquivo atual.
- Marcacao visual de problemas no editor.
- Tratamento de falhas de API.

### Marco parcialmente implementado

- Leitura e mapeamento estrutural do codigo: hoje ha leitura do arquivo aberto/selecao, mas nao mapeamento estrutural completo do projeto.
- Biblioteca local de modelos: existe estrutura de tela/registro, mas ainda nao download/instalacao/execucao local.
- Alternancia local/nuvem: existe configuracao de modo, mas apenas cloud possui inferencia funcional.
- RAG: existem configuracoes e entradas previstas na montagem de prompt, mas nao ha indexacao nem recuperacao real.

### Marco ainda planejado

- Setup automatico do ambiente local.
- Integracao com Hugging Face.
- Download de modelos.
- Execucao local com runtime dedicado.
- Diagnostico de compatibilidade de hardware.
- Indexacao do projeto.
- Base vetorial local.
- Inclusao de documentos externos no RAG.
- Integracao funcional do RAG com modelos locais e cloud.
- Historico persistente de chats.

## 6. Partes Interessadas e Responsabilidades

A divisao de responsabilidades do documento original pode ser mantida, mas recomenda-se atualizar as responsabilidades ja materializadas no codigo:

### Responsabilidades tecnicas ja evidenciadas pela implementacao

- Interface da extensao: Webviews de chat, configuracao/chaves e biblioteca.
- Integracao com APIs externas: provedores OpenAI-compatible, Claude e Gemini.
- Gerenciamento de credenciais: SecretStorage do VS Code.
- Configuracao do sistema: arquivo local `config/atlas-config.json`.
- System Prompt Layer: servicos de politica, montagem, resolucao de modo e customizacao.
- Modo estudo: prompt didatico, persistencia de estado e controle pela Webview.
- Analise rapida: coleta do arquivo aberto, chamada ao LLM, parse de JSON e marcacao visual.

### Responsabilidades ainda futuras

- Backend local.
- RAG.
- ChromaDB.
- Download de modelos.
- Diagnostico de hardware.
- Validacao formal de desempenho e precisao.

## 7. Riscos: Novos Riscos a Adicionar

### Risco - Dependencia de formato estruturado retornado pelo LLM

**Descricao:** a analise rapida depende de resposta JSON valida. Modelos podem retornar texto fora do formato esperado.

**Mitigacao:** reforcar prompts, validar JSON, tratar erro de parse e considerar camada adicional de normalizacao.

### Risco - Variacao entre APIs de provedores

**Descricao:** provedores cloud possuem formatos distintos para mensagens, modelos, erros, streaming e limites.

**Mitigacao:** manter adaptadores por tipo de provedor e testes especificos para OpenAI-compatible, Claude e Gemini.

### Risco - Exposicao acidental de codigo em modo nuvem

**Descricao:** usuarios podem enviar arquivos sensiveis a provedores externos sem compreender completamente o impacto.

**Mitigacao:** reforcar avisos de envio, manter configuracoes de seguranca, permitir limites de payload e destacar o modo ativo.

### Risco - Acumulo de responsabilidades na extensao TypeScript

**Descricao:** enquanto backend local e RAG nao existem, a extensao concentra UI, orquestracao, prompts, configuracao e integracao cloud.

**Mitigacao:** manter servicos pequenos, preservar separacao por camadas e mover responsabilidades pesadas para backend dedicado na fase local/RAG.

### Risco - Respostas didaticas excessivamente longas

**Descricao:** o modo estudo pode gerar respostas mais extensas do que o necessario, afetando fluidez e custo de uso em provedores cloud.

**Mitigacao:** ajustar o prompt do modo estudo para ser progressivo, mas objetivo, e permitir refinamento com base em testes de usuarios.

## 8. Criterios de Sucesso: Atualizacao Sugerida

Os criterios atuais continuam validos, mas recomenda-se distinguir sucesso do MVP e sucesso da versao completa.

### Criterios de sucesso do MVP atual

- A extensao deve abrir no VS Code com painel lateral funcional.
- O usuario deve conseguir cadastrar e gerenciar chaves de API.
- O usuario deve conseguir selecionar provedor/modelo cloud.
- O chat deve responder usando o provedor configurado.
- O sistema deve montar prompts especializados para assistente tecnico, analise arquitetural e analise rapida.
- O modo estudo deve poder ser ativado na interface e gerar respostas didaticas.
- O comando de analise rapida deve analisar o arquivo aberto e destacar achados no editor.
- Falhas de API devem ser tratadas sem travar a extensao.

### Criterios de sucesso da versao completa

- Execucao local funcional com modelos instalados.
- Download e gerenciamento fisico de modelos locais.
- Diagnostico de hardware.
- Indexacao do projeto.
- Base vetorial local.
- Inclusao de documentos externos.
- RAG integrado a modelos locais e cloud.
- Historico persistente de conversas.

## 9. Funcionalidades Implementadas que Devem Ser Citadas no Documento

Recomenda-se adicionar uma subsecao chamada **Funcionalidades ja implementadas no MVP**:

- Extensao VS Code com View Container `ATLAS`.
- Webview lateral de chat.
- Painel de configuracoes/chaves.
- Painel de biblioteca de modelos.
- Cadastro, edicao, listagem e exclusao de chaves de API.
- Cadastro de provedor personalizado.
- Provedores padrao: OpenAI, OpenRouter, Groq, Claude, Gemini e xAI.
- Listagem de modelos por provedor cloud.
- Selecao de modo `local` ou `cloud`.
- Selecao de modelo cloud ativo.
- Configuracao de temperatura, top_p, max_tokens, timeout e streaming.
- Prompt base por modo: assistente de desenvolvimento, analise arquitetural e analise rapida.
- Prompt de modo estudo para respostas didaticas e progressivas.
- Botao de modo estudo na interface de chat.
- Persistencia do estado do modo estudo em `custom.studyMode.enabled`.
- Customizacao complementar do comportamento do modelo.
- Sanitizacao de diretivas customizadas que tentem remover regras obrigatorias.
- Contexto automatico do arquivo aberto ou trecho selecionado.
- Analise rapida com retorno JSON.
- Marcacao visual por severidade no editor.
- Cancelamento de geracao.
- Tratamento de erros de API e timeout.
- Persistencia local em `config/atlas-config.json`.
- Credenciais armazenadas no SecretStorage do VS Code.

## 10. Texto Curto Para Inserir Como Nota de Status

> Observacao sobre o estado atual: a documentacao descreve a visao completa planejada para o ATLAS. No estado atual do desenvolvimento, o MVP ja implementa a extensao VS Code, interface de chat, gerenciamento de chaves, selecao de provedores/modelos cloud, camada de prompts, customizacao parcial de comportamento, modo estudo, analise rapida do arquivo atual e marcacao visual no editor. Os recursos de execucao local, download de modelos, diagnostico de hardware, RAG, ChromaDB, indexacao de projeto e inclusao de documentos externos permanecem previstos para as proximas fases.
