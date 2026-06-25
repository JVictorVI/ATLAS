# Plano de Implementação do RAG no ATLAS

## 1. Objetivo

Implementar recuperação semântica local para que o ATLAS possa:

- indexar manual ou automaticamente o código-fonte de um workspace;
- transformar arquivos e documentos externos em chunks e embeddings;
- persistir vetores e metadados em uma base local;
- atualizar apenas os arquivos alterados;
- recuperar trechos relevantes para a pergunta do usuário;
- injetar o contexto recuperado na camada de prompts;
- impedir envio de contexto RAG para provedores cloud sem consentimento;
- exibir status, tamanho e ações de manutenção da base na tela RAG.

O plano cobre os requisitos RF12 a RF15, a composição de prompt do RF17 e os requisitos não funcionais RNF12 e RNF16 a RNF20 descritos na documentação do projeto.

## 2. Estado atual e pontos de integração

O projeto já possui parte da infraestrutura necessária:

| Área | Estado atual | Ação |
| --- | --- | --- |
| Configuração | `AtlasRagSettings` já contém ativação, autoindexação, permissão cloud, modo offline, chunking e caminhos ignorados | ampliar contrato e conectar à UI e aos serviços |
| Prompt | `AtlasPromptAssemblyService` já aceita `ragContext` | manter contrato e enriquecer a formatação com fontes |
| Chat | `ChatResponseController` sempre envia `ragContext: []` | consultar o RAG antes da montagem final do prompt |
| Análise rápida | `AtlasQuickAnalysisService` também envia contexto vazio | deixar fora do primeiro corte; integrar posteriormente com limite mais restrito |
| UI | `src/webview/rag` é um protótipo estático | trocar dados simulados por mensagens reais da extensão |
| Persistência | configurações e histórico usam JSON; não existe armazenamento do índice | criar diretório próprio no `globalStorageUri` da extensão |
| Ciclo de vida | `ChatViewProvider` instancia e conecta os serviços | registrar ali o subsistema RAG e descartá-lo no `dispose()` |
| Testes | existe apenas teste de exemplo | criar testes unitários dos componentes puros e testes de integração do fluxo |

## 3. Arquitetura enxuta proposta

### 3.1 Componentes

O núcleo deve usar quatro componentes:

```text
ChatResponseController / ChatMessageRouter
  -> AtlasRagService
       -> AtlasEmbeddingService
       -> AtlasChromaService
       -> AtlasRagRepository
```

Responsabilidades:

- `AtlasRagService`: indexar, atualizar, consultar e excluir índices. Também realiza leitura de arquivos, chunking e formatação do contexto.
- `AtlasEmbeddingService`: gerar embeddings locais para documentos e perguntas.
- `AtlasChromaService`: iniciar, verificar e encerrar o servidor ChromaDB incluído na extensão.
- `AtlasRagRepository`: encapsular a base vetorial e o manifesto JSON usado pela UI e pela detecção de mudanças.

Não criar inicialmente serviços separados para scanner, chunker, recuperação, sincronização, formatação ou ingestão. Esses comportamentos começam como métodos privados do `AtlasRagService` e só serão extraídos quando houver complexidade ou necessidade de substituição comprovada.

Essa organização mantém o RAG independente da inferência sem espalhar o fluxo entre muitas classes.

### 3.2 Base vetorial

Decisão:

- utilizar ChromaDB local em modo cliente-servidor;
- incluir o runtime do ChromaDB no pacote de instalação do ATLAS;
- executar o servidor como processo auxiliar gerenciado pela extensão;
- conectar pelo cliente TypeScript oficial;
- dados armazenados em `context.globalStorageUri/rag/`;
- coleção separada por workspace;
- nomes de coleção derivados de um `projectId` estável, nunca diretamente do caminho;
- metadados do índice mantidos em JSON pelo ATLAS, sem depender da base vetorial para a tela de gestão.

O usuário não deverá instalar Python, Docker, ChromaDB ou executar comandos adicionais. O pacote da extensão deve conter:

- runtime executável do ChromaDB para a plataforma;
- cliente TypeScript `chromadb`;
- runtime e modelo local de embeddings;
- arquivos de licença das dependências;
- código de inicialização, health check, recuperação e encerramento do processo.

O `AtlasRagRepository` será a fronteira entre o ATLAS e o ChromaDB. Ele será responsável por coleções, inserção, atualização, consulta e exclusão. Não será criada uma abstração para múltiplos bancos vetoriais.

### 3.2.1 Distribuição

A distribuição deverá usar VSIX específico por plataforma, começando por `win32-x64`, conforme o escopo atual do projeto.

Estrutura prevista no pacote:

```text
atlas/
├── dist/extension.js
├── node_modules/chromadb/
├── resources/
│   ├── chroma/win32-x64/
│   └── embeddings/
└── package.json
```

Na ativação do RAG:

1. localizar o runtime compatível com `process.platform` e `process.arch`;
2. iniciar o ChromaDB em `127.0.0.1` usando uma porta livre;
3. apontar a persistência para `globalStorageUri/rag/chroma`;
4. aguardar o health check;
5. criar o cliente TypeScript;
6. reutilizar o processo enquanto o ATLAS estiver ativo;
7. encerrar somente o processo iniciado pela extensão.

Se não existir runtime compatível no pacote, o RAG deve ser desabilitado com uma mensagem clara, sem impedir o restante do ATLAS de funcionar.

### 3.3 Embeddings

O `AtlasEmbeddingService` terá somente duas operações:

```ts
class AtlasEmbeddingService {
  embedDocuments(texts: string[], signal?: AbortSignal): Promise<number[][]>;
  embedQuery(text: string, signal?: AbortSignal): Promise<number[]>;
}
```

Política inicial:

- embeddings locais por padrão;
- modelo de embedding configurado separadamente do LLM de chat;
- processamento em lote;
- nenhuma chamada cloud para embeddings no MVP;
- envio dos vetores já calculados ao ChromaDB, sem depender da função de embedding padrão do servidor;
- registrar modelo e dimensões na coleção para impedir mistura de vetores incompatíveis;
- troca de modelo de embedding exige reindexação.

### 3.4 Tipos e persistência

Usar três tipos principais:

- `RagProjectIndex`;
- `RagIndexedSource`;
- `RagSearchResult`;

Campos mínimos:

- projeto: `projectId`, nome, raiz, coleção, status, datas, modelo de embedding, dimensões e tamanho;
- fonte: `sourceId`, tipo, caminho relativo, hash, tamanho, modificação e linguagem;
- resultado: score, conteúdo, caminho, linhas, símbolo e tipo de artefato.

O `projectId` deve ser derivado de uma identidade persistida do workspace, não apenas do nome da pasta.

### 3.5 Chunking

No primeiro corte, usar chunking textual simples:

1. dividir por tamanho com overlap;
2. evitar cortar uma linha no meio;
3. manter caminho, linguagem e intervalo de linhas nos metadados;
4. calcular `hash_chunk` para evitar embeddings repetidos.

Os valores atuais `chunkSize: 1000` e `chunkOverlap: 200` serão tratados inicialmente como caracteres, mas o contrato deve explicitar a unidade para evitar ambiguidade futura.

Chunking orientado a símbolos permanece como otimização posterior.

### 3.6 Recuperação e orçamento de contexto

Fluxo:

1. validar se RAG está habilitado e se existe índice pronto para o workspace;
2. gerar embedding da pergunta;
3. recuperar candidatos por similaridade;
4. remover duplicações e chunks muito sobrepostos;
5. aplicar limiar mínimo de relevância;
6. limitar por quantidade de trechos e orçamento de caracteres/tokens;
7. formatar cada trecho com fonte, linhas e score;
8. injetar o resultado em `ragContext`.

Configurações novas sugeridas:

```ts
interface AtlasRagSettings {
  enabled: boolean;
  autoIndex: boolean;
  allowCloudContext: boolean;
  offlineOnly: boolean;
  chunkSize: number;
  chunkOverlap: number;
  ignoredPaths: string[];
  embeddingModel: string;
  topK: number;
  maxContextCharacters: number;
}
```

`minScore`, filtros avançados e opções específicas para documentos externos só devem entrar quando essas funcionalidades forem implementadas.

O RAG deve ser aplicável aos modos `developer-assistant`, `architectural-analysis` e `study-mode`. A análise rápida fica fora do MVP para não degradar sua latência e seu formato estruturado.

### 3.7 Segurança

Regras obrigatórias:

- índice, documentos e embeddings permanecem locais;
- `offlineOnly: true` bloqueia contexto RAG quando o modo de inferência for cloud;
- em modo cloud, o contexto só pode ser usado quando `allowCloudContext === true`;
- a UI deve explicar que serão enviados apenas os chunks recuperados, não a base completa;
- documentos externos devem ser copiados apenas com consentimento ou referenciados explicitamente conforme escolha de produto;
- logs não devem imprimir conteúdo completo dos chunks;
- caminhos exibidos ao modelo devem ser relativos ao workspace sempre que possível.

## 4. Arquivos a criar

### Tipos

- `src/interfaces/AtlasRagTypes.ts`

### Serviços

- `src/services/AtlasRagService.ts`
- `src/services/AtlasEmbeddingService.ts`
- `src/services/AtlasChromaService.ts`

### Persistência

- `src/repository/AtlasRagRepository.ts`

### Integrações existentes

- novas mensagens RAG em `ChatMessageRouter`;
- dependências RAG em `ChatMessageRouterTypes`;
- instanciação no `ChatViewProvider`;
- recuperação de contexto no `ChatResponseController`;
- substituição dos dados simulados em `src/webview/rag`.

O `AtlasChromaService` gerencia o processo, a porta e o health check. O `AtlasRagRepository` utiliza o cliente ChromaDB e não conhece detalhes de inicialização do executável.

## 5. Fluxos principais

### 5.1 Indexação manual

```text
Usuário -> Webview RAG: indexar workspace
Webview -> ChatMessageRouter: indexarProjetoRag
Router -> AtlasRagService: indexProject(workspace)
AtlasRagService -> AtlasRagService: ler, filtrar e dividir arquivos
AtlasRagService -> AtlasEmbeddingService: gerar vetores em lote
AtlasRagService -> AtlasRagRepository: salvar vetores e metadados
Router -> Webview: progresso e resultado
```

### 5.2 Consulta no chat

```text
ChatResponseController
  -> resolve contexto do editor
  -> AtlasRagService.retrieveContext(pergunta, workspace, modo)
  -> AtlasPromptAssemblyService.buildMessages(..., ragContext)
  -> AtlasInferenceService.sendChat(...)
```

O contexto do arquivo aberto continua sendo evidência principal. O RAG complementa essa visão com trechos de outros arquivos e documentos.

### 5.3 Atualização incremental

- observar criação, alteração e exclusão com um `FileSystemWatcher` registrado pelo `AtlasRagService`;
- usar debounce para agrupar salvamentos rápidos;
- comparar hash e data de modificação com o manifesto;
- apagar os chunks antigos da fonte;
- gerar e inserir somente os chunks novos;
- marcar o índice como `outdated` quando a atualização falhar;
- nunca executar reindexação completa por uma alteração pontual.

## 6. Roadmap de implementação

### Fase 0 - Empacotamento do runtime

Entregas:

- runtime ChromaDB empacotado no VSIX `win32-x64`;
- inicialização sem Python ou Docker instalados no sistema;
- health check e encerramento seguro;
- prova de persistência, busca, filtros e exclusão;
- runtime e modelo local de embeddings empacotados;
- definição do diretório de dados no `globalStorageUri`;
- validação das licenças e do tamanho final do VSIX.

Critério de saída:

- instalar o VSIX em uma máquina Windows limpa, indexar dez chunks, reiniciar o VS Code e recuperar os mesmos dados sem instalar dependências adicionais.

### Fase 1 - Vertical slice: indexar e consultar o workspace atual

Entregas:

- scanner com exclusões padrão e respeito a `.gitignore`;
- chunking textual com metadados de linhas;
- embeddings locais em lote;
- criação e exclusão de coleção;
- indexação manual do workspace atual;
- recuperação top-k;
- injeção no `ChatResponseController`;
- indicação das fontes na resposta ou nos metadados da UI.

Critério de saída:

- uma pergunta sobre código fora do arquivo aberto recupera o arquivo correto e o envia ao prompt;
- em modo cloud, nenhum contexto é enviado sem `allowCloudContext`;
- excluir o índice remove coleção e manifesto.

### Fase 2 - Tela e atualização incremental

Entregas:

- carregar e salvar configurações RAG;
- lista real de projetos indexados;
- status `not-indexed`, `indexing`, `ready`, `outdated`, `error`;
- progresso por arquivos/chunks;
- tamanho em disco;
- ações indexar, cancelar, reindexar e excluir;
- mensagens claras para base ausente ou indisponível.
- manifesto com hash por fonte e chunk;
- watcher do workspace;
- fila assíncrona com debounce e cancelamento;
- atualização por create/change/delete;
- opção `autoIndex`;
- detecção de mudança de configuração ou modelo que exige reindexação total.

Critério de saída:

- a tela não contém dados simulados e reflete o estado persistido após reiniciar o VS Code;
- editar um arquivo atualiza somente sua fonte;
- excluir um arquivo remove seus chunks;
- alterações não bloqueiam o editor.

### Fase 3 - Documentos externos

Entregas:

- seleção de PDF, Markdown e TXT;
- parsing incorporado ao `AtlasRagService`, com funções privadas por tipo;
- metadados de origem e páginas quando disponíveis;
- inclusão/exclusão por documento;
- filtro para habilitar ou não documentos externos na consulta;
- tratamento de arquivo movido, alterado ou inacessível.

Critério de saída:

- uma pergunta recupera conteúdo de um PDF indexado e apresenta a fonte correspondente.

### Fase 4 - Refinamento de recuperação

Entregas:

- chunking orientado a símbolos;
- deduplicação e diversidade entre arquivos;
- limiar de score configurável;
- orçamento de contexto;
- filtros por linguagem, tipo e caminho;
- integração opcional com análise rápida após benchmark;
- conjunto de avaliação com perguntas e trechos esperados.

Critério de saída:

- os testes de avaliação demonstram recuperação relevante sem exceder o orçamento de contexto definido.

## 7. Critérios de aceite globais

- indexação inicial de projeto com menos de 20 mil linhas em até 3 minutos no ambiente de referência;
- atualização incremental sem reindexação completa;
- operações longas assíncronas e canceláveis;
- nenhuma transmissão externa de documento, embedding ou chunk sem consentimento;
- recuperação limitada por relevância e orçamento;
- índice persistente entre sessões do VS Code;
- exclusão completa e verificável da base do projeto;
- tela informa quantidade de arquivos, chunks, tamanho, modelo de embedding, data e status;
- falha do mecanismo RAG não impede o chat de funcionar sem RAG;
- troca de modelo/dimensões não mistura embeddings incompatíveis;
- caminhos ignorados e arquivos binários nunca são indexados.

## 8. Estratégia de testes

### Unitários

- normalização de caminhos e regras de exclusão;
- chunking, overlap e cálculo de linhas;
- hashes e detecção de mudança;
- orçamento de contexto;
- política de segurança local/cloud;
- formatação das fontes;
- migração e defaults da configuração.

### Integração

- indexar, recuperar, atualizar e excluir uma coleção;
- reiniciar o armazenamento e preservar o índice;
- cancelar indexação;
- falha parcial do embedding ou vector store;
- troca do modelo de embedding;
- watcher para criação, alteração e exclusão.

### Avaliação de recuperação

Criar um fixture de projeto com perguntas conhecidas e medir:

- recall@k;
- precisão dos trechos recuperados;
- latência de consulta;
- quantidade de contexto descartado por score/orçamento;
- diversidade de fontes.

### Segurança

- cloud bloqueado com `offlineOnly`;
- cloud bloqueado sem `allowCloudContext`;
- logs sem conteúdo sensível;
- exclusão limitada ao diretório RAG gerenciado pela extensão;
- rejeição de caminhos externos não autorizados.

## 9. Ordem recomendada para começar

1. empacotar e validar ChromaDB + embeddings locais em uma máquina Windows limpa;
2. criar os três tipos principais e os quatro componentes;
3. implementar indexação manual no `AtlasRagService`;
4. implementar recuperação e conectar ao `ChatResponseController`;
5. tornar a Webview RAG funcional e adicionar atualização incremental;
6. adicionar documentos externos;
7. otimizar qualidade, desempenho e análise rápida.

O primeiro marco demonstrável deve ser pequeno e completo: indexar o workspace atual, fazer uma pergunta sobre outro arquivo e mostrar quais trechos foram recuperados. Esse corte valida a arquitetura inteira antes de ampliar a superfície da UI e dos formatos de documento.
