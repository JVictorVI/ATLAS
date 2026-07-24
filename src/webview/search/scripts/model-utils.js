// Responsabilidade: concentra regras de negocio sobre modelos, arquivos e filtros.
const generationModelKind = {
  className: "generation-model",
  icon: "comment-discussion",
  label: "LLM",
  listTag: "LLM",
  formatLabel: "GGUF",
  fileLabel: "Arquivo GGUF",
  variantLabel: "variante(s)",
  note: "Modelo de geração usado pela engine local para produzir respostas",
};

const embeddingModelKind = {
  className: "embedding-model",
  icon: "symbol-method",
  label: "Embedding",
  listTag: "EMBEDDING",
  formatLabel: "ONNX",
  fileLabel: "Arquivo ONNX",
  variantLabel: "arquivo(s) ONNX",
  note: "Modelo usado para gerar vetores de busca semântica do RAG; não responde perguntas diretamente",
};

function getModelKind(model) {
  return model?.format === "ONNX" ? embeddingModelKind : generationModelKind;
}

function getModelBadge(model) {
  return getModelKind(model).label === "Embedding" ? "EMB" : "LLM";
}

function prioritizeGenerationModels(models) {
  return [...(models || [])].sort((left, right) => {
    const leftRank = left?.format === "ONNX" ? 1 : 0;
    const rightRank = right?.format === "ONNX" ? 1 : 0;

    return leftRank - rightRank;
  });
}

function matchesModelFilter(model) {
  if (state.modelFilter === "llm") {
    return model?.format !== "ONNX";
  }

  if (state.modelFilter === "embedding") {
    return model?.format === "ONNX";
  }

  return true;
}

function getVisibleModels() {
  return state.models.filter(matchesModelFilter);
}

function clampModelPage(page) {
  const parsedPage = Number.parseInt(page, 10);
  const safePage = Number.isFinite(parsedPage) ? parsedPage : 1;

  return Math.max(safePage, 1);
}

function getPaginatedModels(models) {
  return models || [];
}

function getModelPageRange(models) {
  const total = (models || []).length;

  if (!total) {
    return { start: 0, end: 0, total };
  }

  const start = (state.currentPage - 1) * MODEL_LIST_PAGE_SIZE + 1;
  const end = start + total - 1;

  return { start, end, total };
}

function getModelFiles(model) {
  return model?.format === "ONNX"
    ? model.onnxFiles || []
    : model?.ggufFiles || [];
}

function getSelectedFile() {
  const files = getModelFiles(state.selectedModel);
  return (
    files.find((file) => file.name === state.selectedFileName) ||
    files[0] ||
    null
  );
}

function getFirstModelFileName(model) {
  return getModelFiles(model)[0]?.name || "";
}

function getFileSizeLabel(file) {
  const size = file?.size || "";

  return size && !/informado/i.test(size) ? size : "";
}

function getVariantLabel(model, file) {
  const count = getModelFiles(model).length;
  const size = getFileSizeLabel(file);
  const kind = getModelKind(model);

  if (model?.format === "ONNX") {
    return `${count} ${kind.variantLabel}${size ? ` - ${size}` : ""}`;
  }

  return `${count} variante(s) ${size ? ` · ${size}` : ""}`;
}

function getVariantOptionLabel(file) {
  const size = getFileSizeLabel(file);
  return `${file.quantization}${size ? ` - ${size}` : ""} - ${file.name}`;
}

function getDownloadLabel(model, file) {
  const size = getFileSizeLabel(file);

  if (state.downloading) {
    return "Baixando...";
  }

  if (model?.format === "ONNX") {
    return `Baixar embedding${size ? ` ${size}` : ""}`;
  }

  return `Baixar${size ? ` ${size}` : ""}`;
}

function getHuggingFaceModelUrl(model) {
  const modelId = typeof model?.id === "string" ? model.id : "";

  if (!modelId) {
    return "";
  }

  return `https://huggingface.co/${modelId
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function getAccessLabel(model) {
  if (model.private) {
    return "Privado";
  }

  if (model.gated) {
    return "Gated";
  }

  return "Público";
}

function getAccessDescription(model) {
  if (model.private) {
    return "Este repositório é privado. Configure um token Hugging Face com acesso para consultar detalhes e baixar arquivos.";
  }

  if (model.gated) {
    return "Modelo gated: pode exigir aceite dos termos no Hugging Face e um token com permissão antes do download.";
  }

  return "Modelo público no Hugging Face.";
}

function getModelDescription(model) {
  return getFieldValue(model.description, "Não informado");
}

function createPlaceholderModel(modelId) {
  return {
    id: modelId,
    name: modelId.split("/").pop() || modelId,
    author: modelId.split("/")[0] || "Hugging Face",
    downloads: 0,
    likes: 0,
    gated: false,
    private: false,
    pipelineTag: null,
    updatedAt: null,
    tags: [],
    format: "GGUF",
    ggufFiles: [],
    onnxFiles: [],
    repositoryFiles: [],
    description: "",
    parameterCount: null,
  };
}
