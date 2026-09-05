# Modelos de embeddings do ATLAS

Este diretório é usado para modelos de embeddings empacotados com a extensão.
A tela de RAG também permite escolher uma pasta externa do usuário para
armazenar e selecionar modelos de embeddings adicionais.

O nome padrão configurado é `atlas-embedding`, portanto a estrutura esperada é:

```text
resources/embeddings/atlas-embedding/
├── config.json
├── tokenizer.json
├── tokenizer_config.json
└── onnx/
    └── model_quantized.onnx
```

Os arquivos do modelo não são mantidos no repositório até a definição e
validação do modelo definitivo.

Em runtime, o ATLAS procura modelos:

1. exclusivamente na pasta configurada em `rag.embeddingModelsDir`, quando
   definida;
2. em `context.globalStorageUri/rag/embedding-models/` e neste diretório
   empacotado com a extensão, quando nenhuma pasta foi escolhida.

A tela de RAG possui o botão "Baixar modelo padrão", que baixa
`Xenova/paraphrase-multilingual-MiniLM-L12-v2` para a pasta gravável ativa e
seleciona o identificador interno `atlas-embedding`. Na interface, esse modelo
é exibido como `Modelo padrão (paraphrase-multilingual-MiniLM-L12-v2)`.

Cada modelo deve ficar em uma subpasta compatível com Transformers.js para a
tarefa `feature-extraction`, contendo `config.json`, tokenizer e arquivos ONNX.

## Execução e consumo de memória

O `AtlasEmbeddingService` executa o modelo localmente com pooling médio e
normalização dos vetores. Usa `q8` quando encontra `model_quantized.onnx` e
`fp32` quando apenas `model.onnx` está disponível.

Cada chamada ao pipeline recebe no máximo **16 textos**, conforme
`AtlasEmbeddingService.batchSize`. Esse limite é interno ao serviço e também
se aplica quando um chamador fornece uma lista maior. Indexações e consultas
compartilham uma fila de inferência: somente um lote executa por vez. Após a
conversão do resultado em vetores, o tensor de saída é liberado com `dispose()`.

Na importação de materiais complementares, cada lote é gravado no ChromaDB
antes de continuar a consumir os trechos. PDFs usam extração de texto por
página, evitando acumular o texto e os vetores do livro inteiro nesse fluxo.
O modelo carregado, os bytes do arquivo e as estruturas do parser e do banco
continuam consumindo memória; o lote não representa um limite global de RAM.

O cancelamento é verificado antes e depois da inferência e entre lotes.
Uma chamada ao modelo que já começou termina antes de o cancelamento ser
propagado; o tensor de saída e a posição na fila são liberados mesmo nesse caso.

O fluxo completo está em [Processos de contexto, janela local e RAG](../../docs/processos-contexto-rag-atlas.md).
