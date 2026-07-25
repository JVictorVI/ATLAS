import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestedTarget } from "./atlas-platform-targets.mjs";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const target = getRequestedTarget();

let source;

try {
  source = require.resolve(target.chromaPackage);
} catch {
  throw new Error(
    `[ATLAS] Runtime ChromaDB nao disponivel para ${target.name}. ` +
      "Instale as dependencias opcionais desse target antes de empacotar.",
  );
}

const destinationDir = path.join(
  projectRoot,
  "resources",
  "chroma",
  target.name,
);
const destination = path.join(destinationDir, "chromadb-binding.node");

await mkdir(destinationDir, { recursive: true });

if (await sameFileSize(source, destination)) {
  console.log(`[ATLAS] Runtime ChromaDB ja preparado: ${destination}`);
} else {
  await copyFile(source, destination);
  console.log(`[ATLAS] Runtime ChromaDB preparado: ${destination}`);
}

async function sameFileSize(sourcePath, destinationPath) {
  try {
    const [sourceInfo, destinationInfo] = await Promise.all([
      stat(sourcePath),
      stat(destinationPath),
    ]);
    return sourceInfo.size === destinationInfo.size;
  } catch {
    return false;
  }
}
