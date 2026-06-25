const path = require("path");

function resolveBinding() {
  const explicitPath = process.env.ATLAS_CHROMA_BINDING;

  if (explicitPath) {
    return require(path.resolve(explicitPath));
  }

  const platform = process.platform;
  const arch = process.arch;
  const packages = {
    "darwin-arm64": "chromadb-js-bindings-darwin-arm64",
    "darwin-x64": "chromadb-js-bindings-darwin-x64",
    "linux-arm64": "chromadb-js-bindings-linux-arm64-gnu",
    "linux-x64": "chromadb-js-bindings-linux-x64-gnu",
    "win32-x64": "chromadb-js-bindings-win32-x64-msvc",
  };
  const packageName = packages[`${platform}-${arch}`];

  if (!packageName) {
    throw new Error(`Plataforma não suportada pelo ChromaDB: ${platform}-${arch}.`);
  }

  return require(packageName);
}

const binding = resolveBinding();
binding.cli(["chroma", ...process.argv.slice(2)]);
