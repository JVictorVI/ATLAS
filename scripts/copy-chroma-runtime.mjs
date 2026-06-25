import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const targets = [
  {
    packageName: "chromadb-js-bindings-win32-x64-msvc",
    folder: "win32-x64",
  },
];

for (const target of targets) {
  let source;

  try {
    source = require.resolve(target.packageName);
  } catch {
    console.warn(
      `[ATLAS] Runtime ChromaDB não disponível para ${target.folder}; pacote específico não será gerado.`,
    );
    continue;
  }

  const destinationDir = path.join(
    projectRoot,
    "resources",
    "chroma",
    target.folder,
  );
  const destination = path.join(destinationDir, "chromadb-binding.node");

  await mkdir(destinationDir, { recursive: true });

  if (await sameFileSize(source, destination)) {
    console.log(`[ATLAS] Runtime ChromaDB já preparado: ${destination}`);
    continue;
  }

  await copyFile(source, destination);
  console.log(`[ATLAS] Runtime ChromaDB preparado: ${destination}`);
}

async function sameFileSize(source, destination) {
  try {
    const [sourceInfo, destinationInfo] = await Promise.all([
      stat(source),
      stat(destination),
    ]);
    return sourceInfo.size === destinationInfo.size;
  } catch {
    return false;
  }
}
