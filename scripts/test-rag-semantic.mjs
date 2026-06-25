import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ChromaClient } from "chromadb";
import { env, pipeline } from "@huggingface/transformers";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const dataPath = path.join(projectRoot, ".tmp-atlas-rag-semantic");
const runnerPath = path.join(
  projectRoot,
  "resources",
  "chroma",
  "chroma-runner.cjs",
);
const bindingPath = path.join(
  projectRoot,
  "resources",
  "chroma",
  "win32-x64",
  "chromadb-binding.node",
);
const port = 18767;

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = path.join(projectRoot, "resources", "embeddings");

const extractor = await pipeline("feature-extraction", "atlas-embedding", {
  local_files_only: true,
  dtype: "q8",
});
const documents = [
  "O AtlasChromaService inicia e encerra o banco vetorial ChromaDB.",
  "O AtlasSessionService mantém o histórico das conversas do usuário.",
];
const documentVectors = (
  await extractor(documents, { pooling: "mean", normalize: true })
).tolist();
const queryVector = (
  await extractor(["qual serviço gerencia a base vetorial?"], {
    pooling: "mean",
    normalize: true,
  })
).tolist();
const child = spawn(
  process.execPath,
  [
    runnerPath,
    "run",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--path",
    dataPath,
  ],
  {
    env: {
      ...process.env,
      ATLAS_CHROMA_BINDING: bindingPath,
    },
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  },
);

child.stderr.on("data", (chunk) => process.stderr.write(chunk));

try {
  const client = new ChromaClient({
    host: "127.0.0.1",
    port,
    ssl: false,
  });
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    try {
      await client.heartbeat();
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const collection = await client.getOrCreateCollection({
    name: "atlas_semantic_test",
    embeddingFunction: null,
  });

  await collection.upsert({
    ids: ["chroma", "history"],
    embeddings: documentVectors,
    documents,
  });

  const result = await collection.query({
    queryEmbeddings: queryVector,
    nResults: 1,
  });

  if (result.ids[0]?.[0] !== "chroma") {
    throw new Error("A recuperação semântica não retornou o trecho esperado.");
  }

  console.log("[ATLAS] Recuperação semântica validada com sucesso.");
} finally {
  child.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (fs.existsSync(dataPath)) {
    fs.rmSync(dataPath, { recursive: true, force: true });
  }
}
