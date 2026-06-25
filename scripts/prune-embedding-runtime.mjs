import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const napiRoot = path.join(
  projectRoot,
  "resources",
  "embedding-runtime",
  "node_modules",
  "onnxruntime-node",
  "bin",
  "napi-v3",
);
const targets = [
  path.join(napiRoot, "darwin"),
  path.join(napiRoot, "linux"),
  path.join(napiRoot, "win32", "arm64"),
];

for (const target of targets) {
  const resolved = path.resolve(target);

  if (!resolved.startsWith(`${path.resolve(napiRoot)}${path.sep}`)) {
    throw new Error(`Caminho inválido para limpeza: ${resolved}`);
  }

  await rm(resolved, { recursive: true, force: true });
}

console.log("[ATLAS] Runtime de embeddings reduzido para win32-x64.");
