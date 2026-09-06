const fs = require("node:fs");
const path = require("node:path");

// Use a private loader for this process only. Never change process.env or the
// extension host's loaded libc/libstdc++, and never install system packages.
function getNativeLaunch(executable, args) {
  if (process.platform !== "linux") {
    return { command: executable, args };
  }
  const runtime = path.join(__dirname, `linux-${process.arch}`);
  const loaderName = {
    x64: "ld-linux-x86-64.so.2",
    arm64: "ld-linux-aarch64.so.1",
  }[process.arch];
  const loader = loaderName && path.join(runtime, loaderName);
  if (
    !loader ||
    !fs.existsSync(path.join(runtime, "manifest.json")) ||
    !fs.existsSync(loader)
  ) {
    throw new Error(
      `Runtime Linux do ATLAS ausente para ${process.arch}. Reinstale o VSIX Linux completo ou execute npm run prepare-linux-runtime ao desenvolver a extensão.`,
    );
  }
  try {
    fs.accessSync(loader, fs.constants.X_OK);
  } catch {
    // VSIX built on Windows may lose executable bits during installation.
    fs.chmodSync(loader, fs.statSync(loader).mode | 0o100);
  }
  const resolved = resolveExecutable(executable);
  const directories = [runtime, path.dirname(resolved)];
  if (directories.some((directory) => /[:;]/.test(directory))) {
    throw new Error(
      "O caminho do runtime/engine Linux não pode conter ':' ou ';'. Escolha uma pasta sem esses separadores.",
    );
  }
  if (process.env.LD_LIBRARY_PATH) {
    directories.push(process.env.LD_LIBRARY_PATH);
  }
  return {
    command: loader,
    args: ["--library-path", directories.join(":"), resolved, ...args],
  };
}

function resolveExecutable(executable) {
  if (executable.includes("/")) {
    return path.resolve(executable);
  }
  for (const directory of (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)) {
    const candidate = path.resolve(directory, executable);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {}
  }
  throw new Error(`Executável não encontrado no PATH: ${executable}`);
}

module.exports = { getNativeLaunch };
