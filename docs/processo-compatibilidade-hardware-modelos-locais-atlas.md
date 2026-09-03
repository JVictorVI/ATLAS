# Processo de compatibilidade de hardware para modelos locais no ATLAS

Atualizado em 3 de setembro de 2026.

Este documento descreve como o ATLAS avalia a compatibilidade entre uma variante de modelo local disponível no repositório Hugging Face e o hardware da máquina do usuário.

O diagnóstico aparece na seção **Repositório de Modelos**, ao abrir os detalhes de um modelo LLM. Modelos de embeddings em ONNX não exibem esse diagnóstico.

## Objetivo

O objetivo do processo é indicar se uma variante local deve rodar bem, rodar com ressalvas ou não ser recomendada para a máquina atual.

A avaliação dá mais peso à VRAM disponível, porque um modelo pode até caber na RAM e rodar via CPU, mas a experiência tende a ser consideravelmente mais lenta quando há pouca ou nenhuma aceleração por GPU.

## Fluxo geral

1. A tela do repositório solicita o hardware local ao backend da extensão.
2. O `HardwareDiagnosticService` coleta RAM, CPU, GPU, VRAM e armazenamento livre.
3. O `ChatMessageRouter` envia os dados numéricos para o webview.
4. O webview seleciona a variante atual do modelo.
5. O módulo `compatibility-diagnostics.js` identifica a quantização e estima o peso de execução.
6. A compatibilidade é classificada como `Compatível`, `Com ressalvas` ou `Não recomendado`.
7. A UI exibe somente o veredito, a base da análise, a quantização e os parâmetros estimados.

## Coleta de hardware

O serviço local coleta:

- RAM total em bytes.
- Número de núcleos lógicos da CPU.
- Nome da GPU.
- Fornecedor da GPU, inferido pelo nome quando possível.
- VRAM total em bytes.
- Espaço livre em disco.

No Windows, o ATLAS tenta usar:

- `Get-CimInstance Win32_ComputerSystem` para RAM.
- `Get-CimInstance Win32_Processor` para CPU.
- Registro do Windows, `Win32_VideoController` e `nvidia-smi` para GPU/VRAM.
- `Win32_LogicalDisk` para espaço livre.

No Linux, o ATLAS tenta usar `lspci`, `nvidia-smi` e informações em `/sys/class/drm`.

RAM, CPU e VRAM são usadas internamente para o cálculo. O armazenamento livre ainda pode ser coletado e enviado no payload geral de hardware, mas não participa do veredito de compatibilidade do modelo.

O mesmo `HardwareDiagnosticService` também é usado pelo fluxo de configuração automática da engine para escolher CPU, CUDA ou Vulkan. Esse outro uso está descrito em [Processo de configuração automática da engine](processo-configuracao-automatica-engine-atlas.md).

## Modelos avaliados

O diagnóstico é aplicado apenas a modelos LLM em formato GGUF. Modelos de embeddings em ONNX são ignorados nessa etapa, porque o custo de execução e o uso esperado são diferentes do fluxo de inferência local de texto.

## Identificação da quantização

A quantização é lida a partir da variante selecionada e do nome do arquivo. O ATLAS tenta encontrar a base da quantização em padrões como:

```text
Q4_K_M
Q6_K_XL
Q8_K_XL
IQ4_NL
IQ2_M
IQ2_XXS
```

Quando a variação exata não tem um perfil próprio, o ATLAS usa a base da quantização:

```text
Q6_K_XL  -> Q6
Q8_K_XL  -> Q8
IQ4_NL   -> IQ4
IQ2_M    -> IQ2/IQ2
IQ2_XXS  -> IQ2/IQ2
```

Isso evita cair no perfil conservador quando o sufixo muda, mas a família principal da quantização ainda é reconhecível.

## Perfis de quantização

Cada perfil define valores aproximados para:

- Bytes por parâmetro.
- Multiplicador de RAM mínima.
- Multiplicador de RAM recomendada.
- Fração mínima de VRAM para offload parcial.
- Fração recomendada de VRAM para melhor velocidade.
- Núcleos mínimos de CPU.

Tabela atual:

| Perfil | Bytes por parâmetro | RAM mínima | RAM recomendada | VRAM mínima | VRAM recomendada | CPU mínima |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| F32 | 4.00 | 1.75x | 2.80x | 0.45x | 0.85x | 8 |
| F16/BF16 | 2.00 | 1.55x | 2.45x | 0.38x | 0.75x | 6 |
| Q8 | 1.00 | 1.45x | 2.25x | 0.32x | 0.68x | 6 |
| Q6 | 0.78 | 1.38x | 2.10x | 0.28x | 0.62x | 4 |
| Q5/IQ5 | 0.68 | 1.32x | 1.95x | 0.24x | 0.55x | 4 |
| Q4 | 0.56 | 1.25x | 1.75x | 0.20x | 0.50x | 4 |
| IQ4 | 0.50 | 1.20x | 1.60x | 0.18x | 0.45x | 2 |
| Q3/IQ3 | 0.45 | 1.18x | 1.55x | 0.16x | 0.42x | 2 |
| Q2/IQ2 | 0.35 | 1.12x | 1.40x | 0.12x | 0.35x | 2 |
| Q1/IQ1 | 0.22 | 1.08x | 1.28x | 0.08x | 0.25x | 2 |
| Não identificada | 0.75 | 1.35x | 2.10x | 0.25x | 0.58x | 4 |

Esses valores são heurísticos. Eles não tentam substituir um benchmark real, mas fornecem uma estimativa prática para orientar a escolha da variante.

## Estimativa de parâmetros

O ATLAS tenta obter o número de parâmetros de duas formas.

Primeiro, usa o campo `safetensors.parameters` retornado pela API do Hugging Face, quando disponível. Nesse caso, soma todos os valores informados.

Depois, se esse dado não existir, tenta inferir a quantidade pelo texto do modelo:

- ID do modelo.
- Nome do modelo.
- Nome do arquivo selecionado.
- Quantização declarada.
- Tags do Hugging Face.

Exemplos:

```text
Llama-3-8B       -> 8B
Mistral-7B       -> 7B
Mixtral-8x7B     -> 56B
modelo-350M      -> 350M
```

Quando nenhum padrão é encontrado, os parâmetros aparecem como **Não identificado** na UI, e o cálculo usa o tamanho do arquivo como base.

## Cálculo do peso em memória

O peso estimado dos pesos do modelo é calculado assim:

```text
peso_por_parametros = parâmetros * bytes_por_parâmetro
```

O ATLAS usa o tamanho real do arquivo da variante como base principal quando esse dado existe:

```text
peso_em_memória = tamanho_do_arquivo
```

Quando o tamanho do arquivo não está disponível, usa a estimativa por parâmetros como fallback:

```text
peso_em_memória = peso_por_parametros
```

Isso evita que uma inferência ampla de parâmetros, vinda do nome do modelo ou do repositório, torne uma variante pequena artificialmente pior que outra variante maior. Para GGUF, o arquivo selecionado costuma ser o melhor sinal prático do peso que o usuário vai baixar e executar.

## Cálculos internos de compatibilidade

Mesmo que a UI não mostre os números detalhados, o diagnóstico calcula internamente alguns limiares:

```text
ram_mínima = peso_em_memória * multiplicador_de_ram_mínima
ram_recomendada = peso_em_memória * multiplicador_de_ram_recomendada
vram_mínima = peso_em_memória * fração_mínima_de_vram
vram_recomendada_para_offload = peso_em_memória * maior_valor(fração_recomendada_de_vram, 0.55)
vram_com_folga_de_capacidade = peso_em_memória / (1 - 0.125)
vram_recomendada_estimada = maior_valor(vram_recomendada_para_offload, vram_com_folga_de_capacidade)
vram_recomendada = próxima_faixa_convencional(vram_recomendada_estimada; 4, 8, 16, 32, ...)
```

O piso de `0.55` evita que quantizações muito agressivas, como Q2/IQ2, sejam classificadas como plenamente compatíveis apenas por exigirem uma fração teórica baixa de VRAM. A folga de capacidade representa a VRAM total necessária para que os pesos da variante fiquem fora da faixa de ressalva de 12,5%. O resultado é arredondado para a próxima capacidade convencional de GPU, começando em 4 GB e seguindo 8 GB, 16 GB, 32 GB e assim por diante. Essa recomendação é comparada à VRAM disponível no cartão e também participa do veredito.

## Regras de classificação

O resultado pode ser:

- **Compatível**: RAM, CPU e VRAM atingem as margens recomendadas.
- **Com ressalvas**: o modelo provavelmente roda, mas com risco de lentidão, especialmente por baixa VRAM ou uso maior de CPU.
- **Não recomendado**: RAM mínima ou a pontuação ponderada de recursos não parecem suficientes.

A lógica atual segue esta ordem:

1. Se não houver peso estimado ou RAM local, retorna **Com ressalvas**.
2. Se a RAM total for menor que a RAM mínima, retorna **Não recomendado**.
3. Se a diferença absoluta entre o peso estimado da variante e a VRAM disponível estiver dentro da margem de 12,5% da VRAM, retorna **Com ressalvas**. A regra vale tanto para variantes um pouco maiores quanto para variantes um pouco menores que a capacidade total.
4. Se o peso estimado da variante ultrapassar a VRAM além dessa margem de 12,5%, retorna **Não recomendado**.
5. Calcula uma pontuação ponderada de recursos: VRAM pesa 80%, RAM pesa 10% e CPU pesa 10%.
6. Retorna **Compatível** somente quando RAM e VRAM atingem as margens recomendadas e a CPU atinge o mínimo do perfil.
7. Se a pontuação for muito baixa e a RAM também estiver abaixo da recomendada, retorna **Não recomendado**.
8. Nos demais casos intermediários, retorna **Com ressalvas**.

## Ênfase em VRAM

A VRAM tem peso alto no veredito final.

Um modelo de 5 GB, por exemplo, pode rodar com pouca VRAM usando CPU ou offload parcial, mas isso tende a tornar a geração mais lenta. Por isso, o ATLAS só classifica como **Compatível** quando a VRAM atinge uma faixa confortável para a variante selecionada.

Se a variante cabe em RAM, mas a VRAM é baixa, o resultado tende a ser **Com ressalvas** em vez de **Compatível**. Quando o peso da variante fica próximo da capacidade total da GPU, dentro de 12,5% para mais ou para menos, o resultado também fica **Com ressalvas**, pois há pouca folga para outros consumos de VRAM. Em uma GPU com 4 GB, por exemplo, essa faixa cobre aproximadamente 500 MB em torno do limite. Se o modelo ultrapassar a faixa superior, fica **Não recomendado**. A RAM e a CPU ainda influenciam o resultado, mas baixa VRAM impede o veredito positivo.

Quando a ressalva é causada especificamente por essa proximidade, o cartão informa que a variante está no limite da memória de vídeo, que parte dos dados pode precisar ser transferida para a RAM durante a execução e que isso reduz consideravelmente a velocidade de resposta. A mensagem também recomenda considerar uma variante menor para obter melhor desempenho.

## O que aparece na interface

O cartão mostra:

- Veredito de compatibilidade.
- Mensagem curta de orientação.
- Quantização detectada e descrição do perfil.
- Parâmetros estimados, quando identificados.
- VRAM disponível e VRAM recomendada para a variante.

O cartão não mostra:

- Especificações completas da máquina.
- Precisão estimada em bytes por parâmetro.
- Tamanho do arquivo.
- Peso em memória.
- RAM mínima ou recomendada.
- VRAM mínima e os cálculos intermediários da recomendação.

## Limitações atuais

O cálculo ainda é uma estimativa. Algumas limitações importantes:

- O custo do KV cache da janela de contexto ainda não é calculado explicitamente.
- O tamanho da janela de contexto configurada não entra diretamente na fórmula.
- A inferência de parâmetros por nome pode errar em nomes ambíguos.
- Modelos MoE são tratados de forma conservadora quando aparecem como `8x7B`.
- Espaço livre em disco não entra no veredito; a compatibilidade avalia execução, não disponibilidade para download.
- O desempenho real depende também da engine local, do número de camadas descarregadas para GPU, drivers, largura de banda de memória e outras configurações.

## Arquivos relacionados

- `src/services/HardwareDiagnosticService.ts`: coleta o hardware local.
- `src/services/HuggingFaceModelService.ts`: consulta modelos no Hugging Face, extrai parâmetros e infere quantização por arquivo.
- `src/providers/ChatMessageRouter.ts`: envia o payload de hardware para o webview.
- `src/webview/search/scripts/compatibility-diagnostics.js`: calcula e renderiza o diagnóstico.
- `src/webview/search/scripts/render-details.js`: insere o cartão na tela de detalhes do modelo.
