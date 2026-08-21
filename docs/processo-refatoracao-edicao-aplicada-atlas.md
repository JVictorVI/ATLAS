# Processo de Refatoração e Edição Aplicada

Atualizado em 15 de agosto de 2026.

Este documento descreve como o ATLAS reconhece pedidos de alteração no código, gera um plano de edições, apresenta uma prévia e só modifica o arquivo após confirmação do usuário.

## Escopo atual

A capacidade de edição aplicada atua somente sobre o arquivo aberto. Ela possui duas entradas:

- pedido operacional no modo `developer-assistant`, como corrigir, implementar, alterar ou refatorar o código atual;
- botão `Refatorar com base nesta análise`, exibido em respostas de `architectural-analysis` elegíveis.

A edição aplicada não é um novo modo de resposta. Ela é uma camada de ação que pode interromper o fluxo textual comum antes da montagem do prompt ou reutilizar uma análise arquitetural já concluída.

O ATLAS não cria nem altera vários arquivos nesse fluxo. Pedidos amplos, como modificar todo o projeto ou vários arquivos sem delimitação local, permanecem como resposta textual.

## Componentes

```text
Webview Chat
  -> ChatMessageRouter
     -> ChatResponseController
        -> AtlasCodeEditController
           -> AtlasEditorContextService
           -> AtlasDocumentStructureService
           -> AtlasCodeEditService
              -> AtlasInferenceService
              -> AtlasCodeEditPreviewProvider
              -> vscode.WorkspaceEdit
        -> AtlasRagService (opcional)
        -> AtlasSessionService
```

Responsabilidades principais:

- `ChatResponseController`: decide se a pergunta deve seguir para edição direta antes da resposta textual;
- `ChatMessageRouter`: recebe a ação de refatoração baseada em análise arquitetural e localiza a mensagem que a originou;
- `AtlasCodeEditController`: aplica guardas, classifica a intenção, coleta contexto, controla cancelamento e valida a identidade do arquivo;
- `AtlasCodeEditService`: monta o prompt de edição, interpreta e valida o plano, abre o diff e aplica as mudanças;
- `AtlasCodeEditPreviewProvider`: fornece ao VS Code o conteúdo virtual usado no lado direito da prévia;
- `AtlasInferenceService`: envia tanto a classificação opcional de intenção quanto o pedido do plano de edição ao modelo ativo.

## Configurações envolvidas

| Configuração | Default | Efeito |
| --- | --- | --- |
| `custom.refactoring.enabled` | `true` | Habilita a edição direta e a refatoração guiada por análise. |
| `custom.refactoring.useModelIntentDetection` | `false` | Usa o modelo ativo para classificar a intenção de editar; desativada, mantém a heurística local. |
| `custom.staticAnalysis.enabled` | `true` | Habilita a coleta estrutural global. |
| `custom.staticAnalysis.useInRefactoring` | `true` | Autoriza estrutura, diagnósticos e relações como apoio à refatoração. |
| `rag.useInCodeEditing` | `false` | Autoriza o uso de trechos RAG em edições aplicadas e refatorações. |

O perfil de contexto também precisa permitir análise estática ou RAG. As regras de destino continuam valendo: no modo local, `rag.allowLocalContext` não pode estar desativado; no modo cloud, `rag.offlineOnly` deve estar desativado e `rag.allowCloudContext` deve estar habilitado.

## Edição direta pelo chat

O desvio para edição direta acontece no início de `ChatResponseController.handleSendQuestion`, antes da montagem normal do prompt.

Pré-condições:

1. não existe `forcedMode` na mensagem;
2. há um arquivo ou uma seleção válida no editor;
3. `custom.refactoring.enabled !== false`;
4. o pedido passa pelas guardas determinísticas;
5. a heurística ou o classificador do modelo reconhece intenção operacional.

Quando essas condições não são atendidas, o fluxo segue para uma resposta textual comum.

## Guardas determinísticas

As guardas são executadas mesmo quando a classificação por modelo está habilitada. Elas bloqueiam:

- pedidos explícitos para não editar, não aplicar ou apenas explicar;
- escopo amplo, como projeto inteiro, workspace, vários arquivos ou funcionalidade completa, quando não há delimitação para o arquivo, classe, método ou seleção atual.

A heurística local também diferencia pedidos operacionais de perguntas exploratórias ou analíticas. Ela normaliza caixa e acentos, tolera pequenas duplicações de letras e reconhece formas imperativas e informais em português.

Exemplos que podem acionar edição:

```text
corrija este método
coloque a validação nesta função
vamos implementar essa mudança
refatore o trecho selecionado
```

Exemplos que permanecem como resposta textual:

```text
como eu poderia corrigir isso?
quais mudanças você sugere?
analise, mas não edite
refatore todo o projeto
```

## Classificação opcional pelo modelo

Com `custom.refactoring.useModelIntentDetection === true`, o modelo ativo recebe:

- nome, linguagem e quantidade de linhas do arquivo aberto;
- indicação de arquivo completo ou seleção;
- até seis mensagens recentes da sessão;
- mensagem atual do usuário.

A resposta interna esperada é:

```json
{
  "shouldApplyCodeEdit": true,
  "confidence": "medium",
  "reason": "pedido operacional de alteração no arquivo aberto"
}
```

A edição só prossegue quando `shouldApplyCodeEdit` é `true` e a confiança é `medium` ou `high`. Resposta inválida, falha de inferência ou indisponibilidade do serviço fazem o ATLAS voltar à heurística local. Abort solicitado pelo usuário é propagado, sem fallback.

## Refatoração guiada por análise arquitetural

Ao concluir uma resposta em `architectural-analysis`, o ATLAS pode persistir:

```text
refactorable=true
generationId
sessionId
refactorContext.documentUri
refactorContext.fileName
refactorContext.languageId
refactorContext.contentHash
refactorContext.source
refactorContext.selection
```

A Webview usa esses metadados para exibir o botão `Refatorar com base nesta análise`.

Quando o botão é acionado:

1. `ChatMessageRouter` localiza a análise pelo `sessionId` e pelo `generationId`;
2. o arquivo aberto é comparado com o `documentUri` armazenado;
3. o hash SHA-256 do conteúdo atual é comparado com `contentHash`;
4. se o arquivo mudou, o fluxo é bloqueado e uma nova análise deve ser executada;
5. a análise arquitetural completa passa a orientar o plano de edição;
6. o ATLAS segue para a mesma etapa de prévia e confirmação usada na edição direta.

Essa validação evita aplicar uma recomendação antiga sobre uma versão diferente do arquivo.

## Contexto enviado ao plano de edição

O pedido ao modelo contém:

- origem da ação: `developer-assistant` ou `architectural-analysis`;
- nome e linguagem do arquivo;
- pedido do usuário;
- código com linhas numeradas;
- seleção principal, quando houver;
- análise arquitetural anterior, na refatoração guiada;
- estrutura estática opcional;
- trechos RAG opcionais.

Na edição direta, a estrutura estática só é coletada quando o texto é reconhecido como refatoração. Na ação arquitetural, ela é sempre considerada elegível. Em ambos os casos, a coleta ainda depende de `staticAnalysis.enabled`, `staticAnalysis.useInRefactoring` e do perfil de contexto.

O RAG só participa quando `rag.useInCodeEditing === true`, o perfil inclui RAG e o destino local/cloud está autorizado. Falha na recuperação não impede a edição; o ATLAS registra o aviso e continua sem esse contexto.

## Plano JSON de edições

`AtlasCodeEditService` exige um objeto JSON sem Markdown:

```json
{
  "summary": "resumo curto da mudança",
  "rationale": "justificativa técnica",
  "risk": "low",
  "verification": ["passo objetivo de validação"],
  "edits": [
    {
      "startLine": 10,
      "endLine": 14,
      "replacement": "bloco completo que substitui o intervalo"
    }
  ]
}
```

O prompt exige mudanças pequenas, seguras e limitadas ao arquivo atual. Para refatorações, o comportamento deve ser preservado. Se não houver alteração segura, o modelo deve retornar `edits: []` e justificar a decisão.

## Validação do plano

Antes de abrir a prévia, o serviço:

1. exige `summary` e `rationale`;
2. normaliza o risco para `low`, `medium` ou `high`;
3. limita a oito itens de verificação;
4. ordena as edições pela linha inicial;
5. valida linhas inteiras, com numeração 1-based e inclusiva;
6. rejeita intervalos fora do documento;
7. rejeita intervalos sobrepostos.

O serviço preserva o padrão de fim de linha do documento, seja LF ou CRLF.

## Prévia e confirmação

Quando há edições propostas:

1. o conteúdo final é calculado sem alterar o arquivo real;
2. `AtlasCodeEditPreviewProvider` publica um documento virtual no esquema `atlas-code-edit-preview`;
3. o comando `vscode.diff` abre o original e a prévia;
4. o VS Code exibe as opções `Aplicar alterações` e `Cancelar`;
5. somente a confirmação explícita cria e aplica um `vscode.WorkspaceEdit`.

Se o plano vier sem edições, não há diff. O fluxo é concluído como `Nenhuma alteração aplicada`.

## Persistência e eventos da Webview

| Evento | Uso |
| --- | --- |
| `edicaoCodigoStatus` | Mostra ou remove o estado de carregamento da aplicação. |
| `edicaoCodigoCancelada` | Limpa o estado quando a prévia não é confirmada. |
| `edicaoCodigoConcluida` | Finaliza uma edição direta sem criar resposta do assistente no chat. |
| `novaResposta` | Exibe o resumo da refatoração guiada por análise. |
| `geracaoCancelada` | Informa abort durante classificação, geração do plano ou ação arquitetural. |
| `sessoesAtualizadas` | Atualiza a lista e o histórico após uma conclusão persistida. |

Na edição direta aprovada, o pedido do usuário é salvo, mas não é criada uma mensagem textual do assistente. Na refatoração guiada, são salvos o pedido operacional e a resposta `Refatoração aplicada`, com arquivo, quantidade de edições, risco, resumo, justificativa e validações sugeridas.

Quando o usuário cancela a prévia da edição direta, nenhuma mensagem desse pedido é persistida.

Enquanto a edição está em andamento, `AtlasCodeEditController` mantém `activeEdits` por `sessionId`, `generationId` ou chave standalone e serializa esses itens como `activeGenerations`. A Webview usa `forcedMode="code-edit"` ou `forcedMode="architecture-code-edit"` para mostrar o loading correto na conversa e na lista de sessões.

## Cancelamento e erros

`cancelarGeracao` recebe `sessionId` e `generationId` quando acionado pelo chat. O roteador repassa esse alvo para análise rápida, resposta textual e edição aplicada, cancelando apenas a operação correspondente. O sinal de abort é propagado para classificação, recuperação RAG e inferência do plano.

Erros esperados incluem:

- refatoração desativada;
- ausência de arquivo aberto;
- arquivo diferente daquele usado na análise;
- conteúdo alterado desde a análise;
- JSON inválido ou sem campos obrigatórios;
- linhas inválidas ou sobrepostas;
- recusa do VS Code ao aplicar o `WorkspaceEdit`.

## Limitações atuais

- apenas o arquivo aberto pode ser alterado;
- não há criação, renomeação ou exclusão de arquivos;
- o plano trabalha com intervalos de linhas inteiras;
- a validação automática se limita à estrutura do plano; testes, build e lint ficam como passos sugeridos ao usuário;
- a qualidade da mudança depende do modelo ativo e do contexto disponível;
- a confirmação humana é obrigatória para qualquer plano com edições.

## Relações com outros processos

- Geração: [Processo de geração de resposta](processo-geracao-resposta-atlas.md).
- Prompts e modos: [Processo de prompts e resolução de modos](processo-prompts-modos-atlas.md).
- Configuração: [Processo de configuração](processo-configuracao-atlas.md).
- RAG: [Processos de contexto, janela local e RAG](processos-contexto-rag-atlas.md).
- Análise arquitetural e casos de uso: [Diagramas por caso de uso](plantuml-diagramas-por-caso-de-uso-atlas.md).
