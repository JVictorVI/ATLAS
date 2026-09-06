import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-native-tests-"));
const bundle = path.join(temp, "services.cjs");

try {
  await build({
    stdin: {
      contents: `export { AtlasLocalEngineService } from './src/services/AtlasLocalEngineService';
        export { AtlasChromaService } from './src/services/AtlasChromaService';
        export { AtlasRuntimeDiagnostics } from './src/utils/AtlasRuntimeDiagnostics';`,
      resolveDir: root,
    },
    bundle: true, platform: "node", format: "cjs", outfile: bundle,
    plugins: [{ name: "vscode-stub", setup(builder) {
      builder.onResolve({ filter: /^vscode$/ }, () => ({ path: "vscode", namespace: "stub" }));
      builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "module.exports = {};", loader: "js" }));
    } }],
  });
  const { AtlasLocalEngineService, AtlasChromaService, AtlasRuntimeDiagnostics } = createRequire(import.meta.url)(bundle);

  const diagnostics = new AtlasRuntimeDiagnostics();
  diagnostics.append("x".repeat(20000));
  diagnostics.append("\n\u001b[31mllama-server: libgomp.so.1: cannot open shared object file\u001b[0m\n");
  const missingLibrary = diagnostics.failure("Falha").message;
  assert.ok(missingLibrary.length < 10000);
  assert.ok(!missingLibrary.includes("\u001b"));
  assert.match(missingLibrary, /VSIX Linux inclui libgomp/);
  assert.match(diagnostics.failure("Falha", "version `GLIBC_2.39' not found").message, /runtime próprio com GLIBC 2\.39/);
  assert.match(diagnostics.failure("Falha", "spawn EACCES").message, /permissões/);
  const oldCppRuntime = diagnostics.failure("Falha", "/usr/lib/x86_64-linux-gnu/libstdc++.so.6: version `GLIBCXX_3.4.29' not found").message;
  assert.match(oldCppRuntime, /VSIX Linux inclui libstdc\+\+\.so\.6/);
  for (const library of ["libssl.so.3", "libcrypto.so.3"]) {
    const missingOpenSsl = diagnostics.failure("Falha", `llama-server: error while loading shared libraries: ${library}: cannot open shared object file: No such file or directory`).message;
    assert.match(missingOpenSsl, /OpenSSL 3/);
    assert.match(missingOpenSsl, /VSIX Linux inclui libssl\.so\.3/);
  }

  const context = { extensionPath: temp, globalStorageUri: { fsPath: path.join(temp, "data") } };
  if (process.platform === "linux") {
    const runtimeDir = path.join(temp, "resources", "linux-runtime");
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.copyFileSync(path.join(root, "resources", "linux-runtime", "launch.cjs"), path.join(runtimeDir, "launch.cjs"));
    fs.cpSync(path.join(root, "resources", "linux-runtime", `linux-${process.arch}`), path.join(runtimeDir, `linux-${process.arch}`), { recursive: true });
  }
  const modelPath = path.join(temp, "test.gguf");
  fs.writeFileSync(modelPath, "fixture");
  const engine = new AtlasLocalEngineService(context, { getConfig: () => ({}) });
  const model = { id: "test", name: "test", path: modelPath, parameters: {}, custom: { llamaServerPath: process.execPath } };
  // Node intentionally rejects llama-server arguments: verify real stderr survives close.
  try {
    await assert.rejects(engine.ensureEngine(model), /bad option: --host/);
    assert.equal(engine.isRunning(), false);
    await assert.rejects(engine.ensureEngine(model), /bad option: --host/);
    assert.equal(engine.isRunning(), false);
  } finally {
    engine.stopEngine();
  }

  const chromaDir = path.join(temp, "resources", "chroma");
  const platformDir = path.join(chromaDir, `${process.platform}-${process.arch}`);
  fs.mkdirSync(platformDir, { recursive: true });
  fs.writeFileSync(path.join(platformDir, "chromadb-binding.node"), "invalid native library");
  // Simulate a loader failure in the runner, with output split across chunks.
  fs.writeFileSync(path.join(chromaDir, "chroma-runner.cjs"), `process.stderr.write("version ");
    setTimeout(() => { process.stderr.write("GLIBC_2.39 not found\\n"); process.exitCode = 1; }, 20);`);
  const chroma = new AtlasChromaService(context);
  try {
    const concurrent = await Promise.allSettled([chroma.ensureReady(), chroma.ensureReady()]);
    for (const result of concurrent) {
      assert.equal(result.status, "rejected");
      assert.match(result.reason.message, /código 1.*GLIBC_2\.39 not found/s);
      assert.match(result.reason.message, /runtime próprio com GLIBC 2\.39/);
    }
    assert.equal(chroma.getStatus().running, false);
    assert.match(chroma.getStatus().errorMessage, /GLIBC_2\.39/);
    await assert.rejects(chroma.ensureReady(), /GLIBC_2\.39/);
  } finally {
    chroma.stop();
  }
  console.log("[ATLAS] Diagnósticos nativos, stderr, falha concorrente e nova tentativa validados.");
} finally {
  if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith("atlas-native-tests-")) {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
