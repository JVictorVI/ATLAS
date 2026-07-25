export const SUPPORTED_TARGETS = {
  "win32-x64": {
    name: "win32-x64",
    os: "win32",
    cpu: "x64",
    chromaPackage: "chromadb-js-bindings-win32-x64-msvc",
    onnxRuntimePath: ["win32", "x64"],
    sharpPackages: ["sharp-win32-x64"],
    vsixOut: "atlas-win32-x64.vsix",
  },
  "linux-x64": {
    name: "linux-x64",
    os: "linux",
    cpu: "x64",
    chromaPackage: "chromadb-js-bindings-linux-x64-gnu",
    onnxRuntimePath: ["linux", "x64"],
    sharpPackages: ["sharp-linux-x64", "sharp-libvips-linux-x64"],
    vsixOut: "atlas-linux-x64.vsix",
  },
  "linux-arm64": {
    name: "linux-arm64",
    os: "linux",
    cpu: "arm64",
    chromaPackage: "chromadb-js-bindings-linux-arm64-gnu",
    onnxRuntimePath: ["linux", "arm64"],
    sharpPackages: ["sharp-linux-arm64", "sharp-libvips-linux-arm64"],
    vsixOut: "atlas-linux-arm64.vsix",
  },
  "darwin-x64": {
    name: "darwin-x64",
    os: "darwin",
    cpu: "x64",
    chromaPackage: "chromadb-js-bindings-darwin-x64",
    onnxRuntimePath: ["darwin", "x64"],
    sharpPackages: ["sharp-darwin-x64", "sharp-libvips-darwin-x64"],
    vsixOut: "atlas-darwin-x64.vsix",
  },
  "darwin-arm64": {
    name: "darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    chromaPackage: "chromadb-js-bindings-darwin-arm64",
    onnxRuntimePath: ["darwin", "arm64"],
    sharpPackages: ["sharp-darwin-arm64", "sharp-libvips-darwin-arm64"],
    vsixOut: "atlas-darwin-arm64.vsix",
  },
};

export function getCurrentTargetName() {
  return `${process.platform}-${process.arch}`;
}

export function getRequestedTarget(argv = process.argv.slice(2)) {
  const requested =
    readTargetArg(argv) ||
    process.env.ATLAS_PACKAGE_TARGET ||
    process.env.npm_config_atlas_target ||
    process.env.npm_config_target ||
    getCurrentTargetName();

  const target = SUPPORTED_TARGETS[requested];

  if (!target) {
    throw new Error(
      `[ATLAS] Target de plataforma nao suportado: ${requested}. ` +
        `Targets suportados: ${Object.keys(SUPPORTED_TARGETS).join(", ")}.`,
    );
  }

  return target;
}

function readTargetArg(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--target") {
      return argv[index + 1];
    }

    if (value?.startsWith("--target=")) {
      return value.slice("--target=".length);
    }
  }

  return "";
}
