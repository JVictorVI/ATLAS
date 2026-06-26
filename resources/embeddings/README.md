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

1. na pasta configurada em `rag.embeddingModelsDir`, quando definida;
2. em `context.globalStorageUri/rag/embedding-models/`, quando nenhuma pasta
   foi escolhida;
3. neste diretório empacotado com a extensão.

A tela de RAG possui o botão "Baixar modelo padrão", que baixa
`Xenova/paraphrase-multilingual-MiniLM-L12-v2` para a pasta gravável ativa e
seleciona o identificador interno `atlas-embedding`. Na interface, esse modelo
é exibido como `Modelo padrão (paraphrase-multilingual-MiniLM-L12-v2)`.

Cada modelo deve ficar em uma subpasta compatível com Transformers.js para a
tarefa `feature-extraction`, contendo `config.json`, tokenizer e arquivos ONNX.
