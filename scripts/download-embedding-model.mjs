import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const destinationRoot = path.join(
  projectRoot,
  "resources",
  "embeddings",
  "atlas-embedding",
);
const modelBaseUrl =
  "https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main";
const files = [
  "config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "unigram.json",
  "onnx/model_quantized.onnx",
];

for (const relativePath of files) {
  const destination = path.join(destinationRoot, relativePath);

  if (await fileExists(destination)) {
    console.log(`[ATLAS] Modelo de embeddings já disponível: ${relativePath}`);
    continue;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  console.log(`[ATLAS] Baixando modelo de embeddings: ${relativePath}`);
  const response = await fetch(`${modelBaseUrl}/${relativePath}`);

  if (!response.ok) {
    throw new Error(
      `Falha ao baixar ${relativePath}: HTTP ${response.status}`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(destination, bytes);
}

await writeFile(
  path.join(destinationRoot, "atlas-model.json"),
  JSON.stringify(
    {
      source: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
      revision: "main",
      task: "feature-extraction",
      dimensions: 384,
      quantization: "int8",
    },
    null,
    2,
  ),
  "utf8",
);

async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}
