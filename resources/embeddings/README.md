# Modelo de embeddings do ATLAS

O pacote final deve incluir neste diretório um modelo compatível com
Transformers.js para a tarefa `feature-extraction`.

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
