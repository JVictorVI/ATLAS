# Processo de Prompts e Resolução de Modos

Atualizado em 24 de julho de 2026.

Este documento descreve como o ATLAS decide o modo de resposta e monta a lista final de mensagens enviada ao modelo.

## Componentes

```text
AtlasPromptAssemblyService
  -> AtlasPromptModeResolver
  -> AtlasSystemPromptPolicyService
  -> AtlasPromptCustomizationService
  -> AtlasContextProfileService
```

## Modos suportados

```text
developer-assistant
architectural-analysis
quick-analysis
study-mode
```

Na prática, `study-mode` é tratado como modo de prompt especializado quando ativado pelo fluxo de estudo; os modos mais comuns do resolver são assistente dev, análise arquitetural e análise rápida.

## Camada de ação aplicada

A refatoração aplicada não é tratada como um modo principal de prompt. Ela funciona como uma capacidade de ação sobre os modos existentes:

```text
answer-only
apply-edit
architecture-guided-edit
```

No `developer-assistant`, pedidos operacionais claros como corrigir, alterar, implementar, renomear, extrair ou refatorar podem ser desviados para edição aplicada do arquivo atual quando `custom.refactoring.enabled !== false`.

No `architectural-analysis`, a resposta continua sendo a análise formal. Quando a resposta for elegível, a Webview pode exibir a ação `Refatorar com base nesta análise`, usando a análise recém-gerada como critério para a mudança.

O modo `quick-analysis` permanece parseável e não aplica edições automaticamente.

## Entrada da montagem

`AtlasPromptAssemblyService.buildMessages` recebe:

```text
userQuestion
history
analysisContext
ragContext
hasCodeContext
forcedMode
architecturalSummary
contextProfile
```

Antes de resolver o modo, o perfil de contexto é normalizado. Se não houver perfil explícito, é usado o perfil padrão `balanced`.

## Resolução de modo

`AtlasPromptModeResolver.resolve` segue esta ordem:

1. Se `forcedMode` existir, ele vence.
2. Se a pergunta contiver intenção de análise rápida, retorna `quick-analysis`.
3. Se contiver frase arquitetural explícita, retorna `architectural-analysis`.
4. Se não houver contexto de código, retorna `developer-assistant`.
5. Se houver contexto de código, calcula pontuações arquiteturais e de desenvolvimento.

### Sinais de análise rápida

Exemplos:

```text
análise rápida
quick analysis
identificar linhas
destacar linhas
problemas por linha
destacar problemas no editor
```

### Sinais arquiteturais explícitos

Exemplos:

```text
análise arquitetural
avaliação arquitetural
decisão de design
risco arquitetural
bom design de software
diagnóstico qualitativo
```

### Pontuação arquitetural

O resolver soma:

- termos arquiteturais fortes com peso 3;
- termos contextuais arquiteturais com peso 2;
- termos de intenção de análise com peso 1.

Exemplos de termos fortes:

```text
arquitetura
acoplamento
coesão
SOLID
GRASP
modularização
manutenibilidade
qualidade de design
```

### Pontuação de desenvolvimento

O resolver soma:

- termos fortes de dev/debug com peso 3;
- termos de stack/framework com peso 2;
- termos gerais de assistência com peso 2.

Exemplos:

```text
erro
bug
debug
teste
compilar
typescript
python
api
implemente
explique
```

### Regras de decisão arquitetural

Com código disponível, vira `architectural-analysis` quando:

- `architecturalScore >= 4` e é maior ou igual ao score dev;
- há intenção de análise, score arquitetural >= 3 e score dev <= 1;
- há sinal arquitetural forte, score arquitetural >= 3 e score dev igual a 0.

Caso contrário, permanece `developer-assistant`.

## Ordem das mensagens montadas

`AtlasPromptAssemblyService` monta mensagens nesta ordem:

1. Prompt de sistema base do modo.
2. Memória arquitetural da sessão, se habilitada e não for quick analysis.
3. Diretivas customizadas do usuário, se existirem e não for quick analysis.
4. Contexto do editor/análise estrutural, se o perfil permitir.
5. Contexto RAG, se o perfil permitir e não for quick analysis.
6. Janela recente do histórico, se não for quick analysis.
7. Pergunta atual do usuário.

Essa ordem preserva a política do ATLAS como instrução mais alta e deixa a pergunta do usuário por último.

## Prompt base por modo

`AtlasSystemPromptPolicyService.buildBaseSystemMessage` seleciona:

| Modo | Prompt |
| --- | --- |
| `developer-assistant` | Assistente técnico geral de desenvolvimento. |
| `architectural-analysis` | Análise formal em 8 tópicos obrigatórios. |
| `quick-analysis` | Saída exclusivamente JSON com achados por linha. |
| `study-mode` | Explicação didática e progressiva. |

Todo prompt recebe a política de idioma no final.

## Política de idioma

A linguagem vem de:

```text
general.language
```

Valores:

```text
pt-BR
en-US
```

A política instrui o modelo a traduzir texto humano, mas manter schemas, chaves JSON e identificadores de código.

## Análise arquitetural

O modo arquitetural exige resposta em oito tópicos Markdown:

1. Decisão de design observável no código analisado.
2. Trade-offs arquiteturais explícitos da decisão.
3. Princípios, responsabilidades e fronteiras tensionadas.
4. Evolução do risco conforme o sistema cresce.
5. Cenários concretos que pressionam mudança arquitetural.
6. Grau de impacto arquitetural e custo de mudança.
7. Impacto em testes, isolamento e verificabilidade.
8. Síntese crítica da decisão e prioridade de atenção.

O prompt reforça que sugestões de refatoração são consequência da análise, não substituto da análise.

Quando houver sugestão de mudança, o prompt também pede uma justificativa técnica explícita, indicando qual Design Pattern, princípio de modularização ou Refactoring Technique sustenta a recomendação e qual trade-off negativo ela busca reduzir.

## Análise rápida

O prompt de quick analysis exige:

- JSON válido;
- array de achados;
- `startLine` e `endLine`;
- severidade `low`, `medium` ou `high`;
- categoria controlada;
- `message`, `impact` e `suggestion`.

Esse modo ignora histórico, customização e RAG para reduzir ruído e manter saída parseável.

## Modo estudo

O modo estudo orienta:

- didática progressiva;
- explicação do raciocínio;
- uso de exemplos;
- evitar entregar apenas resposta final;
- usar o código aberto apenas quando relevante.

## Customização do usuário

`AtlasPromptCustomizationService.buildCustomizationBlock` adiciona diretivas complementares quando configuradas.

No modo local, `AtlasInferenceService` remove mensagens de sistema iniciadas por:

```text
Diretivas complementares do usuário:
```

Isso evita conflito entre customização global e comportamento local específico do modelo. O comportamento customizado do modelo local é aplicado por `LocalApiService.applyModelBehavior`.

## Perfil de contexto

O perfil influencia diretamente a montagem:

- inclui ou remove contexto do editor;
- inclui ou remove memória arquitetural;
- inclui ou remove RAG;
- define tamanho da janela histórica;
- define limites do contexto do editor.

Perfis não customizados também aplicam efeitos colaterais na tela de configurações, como RAG, análise estática e contexto local dinâmico.

## Janela histórica

O histórico é filtrado para mensagens não-system e limitado por:

```text
contextProfile.historyWindowSize
```

O assembly registra log:

```text
[ATLAS] Context window: total=<n>, sending=<m>/<limite> messages
```

## Relações com outros processos

- Geração: [Processo de geração de resposta](processo-geracao-resposta-atlas.md).
- Sessões e memória: [Processo de sessões, histórico e resumo](processo-sessoes-historico-resumo-atlas.md).
- Análise rápida: [Processo de análise rápida](processo-analise-rapida-atlas.md).
- Configuração: [Processo de configuração](processo-configuracao-atlas.md).
