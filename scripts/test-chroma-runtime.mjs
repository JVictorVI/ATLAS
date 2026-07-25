import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ChromaClient } from "chromadb";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const dataPath = path.join(projectRoot, ".tmp-atlas-rag-integration");
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
  `${process.platform}-${process.arch}`,
  "chromadb-binding.node",
);
const port = 18766;

if (!fs.existsSync(bindingPath)) {
  throw new Error(
    "Runtime ChromaDB não preparado. Execute npm run prepare-rag-runtime.",
  );
}

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

child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

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

  await client.heartbeat();
  const collection = await client.getOrCreateCollection({
    name: "atlas_runtime_test",
    embeddingFunction: null,
  });

  await collection.upsert({
    ids: ["alpha", "beta"],
    embeddings: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    documents: ["alpha", "beta"],
    metadatas: [{ sourceId: "one" }, { sourceId: "two" }],
  });

  const result = await collection.query({
    queryEmbeddings: [[0.9, 0.1, 0]],
    nResults: 1,
  });

  if (result.ids[0]?.[0] !== "alpha") {
    throw new Error("A consulta vetorial retornou um resultado inesperado.");
  }

  console.log("[ATLAS] ChromaDB empacotado validado com sucesso.");
} finally {
  child.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));

  const resolvedDataPath = path.resolve(dataPath);
  if (
    resolvedDataPath.startsWith(
      `${projectRoot}${path.sep}`,
    ) &&
    fs.existsSync(resolvedDataPath)
  ) {
    fs.rmSync(resolvedDataPath, { recursive: true, force: true });
  }
}
