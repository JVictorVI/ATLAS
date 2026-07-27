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

const EMBEDDING_REQUIRED_DOWNLOAD_FILES = [
  "config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.txt",
  "merges.txt",
  "sentencepiece.bpe.model",
  "spiece.model",
  "unigram.json",
];

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

function shouldShowVariantSelector(model) {
  const files = getModelFiles(model);

  return model?.format !== "ONNX" || files.length > 1;
}

function getDownloadKey(modelId, fileName) {
  return `${modelId || ""}\n${fileName || ""}`;
}

function isModelFileDownloading(model, file) {
  const downloads = Array.isArray(state.downloads) ? state.downloads : [];
  const key = getDownloadKey(model?.id, file?.name);

  return downloads.some(
    (download) => getDownloadKey(download.modelId, download.fileName) === key,
  );
}

function getFirstModelFileName(model) {
  return getModelFiles(model)[0]?.name || "";
}

function getFileSizeLabel(file) {
  const size = file?.size || "";

  return size && !/informado/i.test(size) ? size : "";
}

function normalizeRepoPath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .join("/");
}

function getRepositoryFileMap(model) {
  const details = Array.isArray(model?.repositoryFileDetails)
    ? model.repositoryFileDetails
    : [];

  return new Map(
    details
      .map((file) => {
        const name = normalizeRepoPath(file?.name);
        const sizeBytes = Number(file?.sizeBytes);

        return [
          name.toLowerCase(),
          {
            name,
            sizeBytes:
              Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0,
          },
        ];
      })
      .filter((entry) => entry[1].name),
  );
}

function getRepoDir(filePath) {
  const normalized = normalizeRepoPath(filePath);

  return normalized.includes("/")
    ? normalized.slice(0, normalized.lastIndexOf("/"))
    : "";
}

function getRepoBasename(filePath) {
  return normalizeRepoPath(filePath).split("/").pop() || "";
}

function isEmbeddingOnnxCompanionFile(candidatePath, selectedOnnxFile) {
  const candidateName = getRepoBasename(candidatePath);
  const selectedName = getRepoBasename(selectedOnnxFile);
  const lowerCandidateName = candidateName.toLowerCase();
  const lowerSelectedName = selectedName.toLowerCase();

  if (!getRepoDir(selectedOnnxFile)) {
    return false;
  }

  if (getRepoDir(candidatePath) !== getRepoDir(selectedOnnxFile)) {
    return false;
  }

  if (lowerCandidateName.endsWith(".onnx")) {
    return false;
  }

  return (
    lowerCandidateName.startsWith(`${lowerSelectedName}_`) ||
    lowerCandidateName.startsWith(`${lowerSelectedName}.`) ||
    (lowerSelectedName === "model.onnx" && !/\.(md|txt)$/i.test(candidateName))
  );
}

function getEmbeddingDownloadFiles(model, selectedFile) {
  if (model?.format !== "ONNX" || !selectedFile?.name) {
    return [];
  }

  const repositoryFiles = getRepositoryFileMap(model);
  const selectedPath = normalizeRepoPath(selectedFile.name);
  const selectedEntry = repositoryFiles.get(selectedPath.toLowerCase());

  if (!selectedEntry) {
    return [
      { name: selectedPath, sizeBytes: Number(selectedFile.sizeBytes) || 0 },
    ];
  }

  const selectedDir = getRepoDir(selectedEntry.name);
  const files = EMBEDDING_REQUIRED_DOWNLOAD_FILES.map((file) =>
    repositoryFiles.get(file.toLowerCase()),
  ).filter(Boolean);

  if (selectedDir) {
    for (const file of EMBEDDING_REQUIRED_DOWNLOAD_FILES) {
      const nestedFile = repositoryFiles.get(
        `${selectedDir}/${file}`.toLowerCase(),
      );

      if (nestedFile) {
        files.push(nestedFile);
      }
    }
  }

  files.push(selectedEntry);

  for (const file of repositoryFiles.values()) {
    if (isEmbeddingOnnxCompanionFile(file.name, selectedEntry.name)) {
      files.push(file);
    }
  }

  return Array.from(
    new Map(files.map((file) => [file.name.toLowerCase(), file])).values(),
  );
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 1 : 2)} ${units[unitIndex]}`;
}

function getEmbeddingDownloadSizeLabel(model, file) {
  const totalBytes = getEmbeddingDownloadFiles(model, file).reduce(
    (sum, item) => sum + (Number(item.sizeBytes) || 0),
    0,
  );

  return formatBytes(totalBytes) || getFileSizeLabel(file);
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
  if (isModelFileDownloading(model, file)) {
    return "Baixando...";
  }

  if (model?.format === "ONNX") {
    const size = getEmbeddingDownloadSizeLabel(model, file);
    return `Baixar ${size ? ` ${size}` : ""}`;
  }

  const size = getFileSizeLabel(file);
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
    repositoryFileDetails: [],
    description: "",
    parameterCount: null,
  };
}
