import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { ChromaClient } from "chromadb";

const vsixPath = process.argv[2];
// /proc/self/exe points to the loader when this test itself runs under an old
// sysroot loader. In that compatibility test, supply the actual Node binary.
const nodeExecutable = process.env.ATLAS_TEST_NODE_EXECUTABLE ?? process.execPath;
if (!vsixPath) {
  throw new Error("Uso: node scripts/test-packaged-chroma.mjs <VSIX da plataforma atual>");
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas vsix test-"));
let child;
let closed;
let output = "";
try {
  const zip = await JSZip.loadAsync(fs.readFileSync(vsixPath));
  const manifest = JSON.parse(await zip.file("extension/package.json").async("string"));
  assert.deepEqual(manifest.extensionKind, ["workspace"]);
  assert.ok(manifest.contributes.commands.some((command) => command.command === "atlas.mostrarLogs"));
  assert.ok(!Object.keys(zip.files).some((name) => name.endsWith(".vsix")), "VSIX aninhado no pacote");
  assert.ok(!Object.keys(zip.files).some(name => /extension\/resources\/(chroma|linux-runtime)\/(?:linux|win32|darwin)-[^/]+\//.test(name) && !name.includes(`/${process.platform}-${process.arch}/`)), "Runtime de outro target incluído no VSIX");
  const runtime = `resources/chroma/${process.platform}-${process.arch}/chromadb-binding.node`;
  const runner = "resources/chroma/chroma-runner.cjs";
  const nativeFiles = process.platform === "linux" ? Object.keys(zip.files).filter(name => name.startsWith("extension/resources/linux-runtime/") && !zip.files[name].dir).map(name => name.slice("extension/".length)) : [];
  for (const relative of [runtime, runner, ...nativeFiles]) {
    const entry = zip.file(`extension/${relative}`);
    assert.ok(entry, `Arquivo ausente no VSIX: ${relative}`);
    const destination = path.join(temp, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, await entry.async("nodebuffer"));
  }
  let getNativeLaunch = (command, args) => ({ command, args });
  if (process.platform === "linux") {
    const runtimeDir = path.join(temp, "resources", "linux-runtime", `linux-${process.arch}`);
    const runtimeManifest = JSON.parse(fs.readFileSync(path.join(runtimeDir, "manifest.json"), "utf8"));
    for (const [name, hash] of Object.entries(runtimeManifest.files)) {
      assert.equal(createHash("sha256").update(fs.readFileSync(path.join(runtimeDir, name))).digest("hex"), hash, name);
    }
    getNativeLaunch = createRequire(import.meta.url)(path.join(temp, "resources", "linux-runtime", "launch.cjs")).getNativeLaunch;
    // Exercise restoration of executable permissions after a Windows-built VSIX.
    fs.chmodSync(path.join(runtimeDir, runtimeManifest.loader), 0o644);
    const before = process.env.LD_LIBRARY_PATH;
    const probe = getNativeLaunch(nodeExecutable, ["-e", "console.log(require('node:fs').readFileSync('/proc/self/maps', 'utf8'))"]);
    const probeResult = spawnSync(probe.command, probe.args, { encoding: "utf8" });
    assert.equal(probeResult.status, 0, probeResult.stderr);
    assert.ok(probeResult.stdout.includes(`${runtimeDir}/libc.so.6`), "Node não carregou a GLIBC privada");
    assert.equal(process.env.LD_LIBRARY_PATH, before, "Launcher alterou o ambiente do host");
  }
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  const launch = getNativeLaunch(nodeExecutable, [path.join(temp, runner), "run", "--host", "127.0.0.1", "--port", String(port), "--path", path.join(temp, "data")]);
  child = spawn(launch.command, launch.args, {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", CHROMADB_VERSION: "bundled", ATLAS_CHROMA_BINDING: path.join(temp, runtime) },
    windowsHide: true,
  });
  closed = once(child, "close");
  let spawnError;
  child.on("error", (error) => { spawnError = error; });
  child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-8192); });
  child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-8192); });
  const client = new ChromaClient({ host: "127.0.0.1", port, ssl: false });
  const deadline = Date.now() + 30000;
  while (true) {
    if (spawnError || child.exitCode !== null || child.signalCode !== null || Date.now() >= deadline) {
      throw new Error(`ChromaDB não iniciou: ${spawnError ?? output}`);
    }
    try {
      await client.heartbeat();
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  const collection = await client.createCollection({ name: "atlas_vsix_test", embeddingFunction: null });
  await collection.upsert({ ids: ["alpha", "beta"], embeddings: [[1, 0, 0], [0, 1, 0]], documents: ["alpha", "beta"] });
  const results = await collection.query({ queryEmbeddings: [[0.9, 0.1, 0]], nResults: 1 });
  assert.equal(results.ids[0][0], "alpha");
  if (process.platform === "linux") {
    const maps = fs.readFileSync(`/proc/${child.pid}/maps`, "utf8");
    assert.ok(maps.includes(`/resources/linux-runtime/linux-${process.arch}/libstdc++.so.6`), "ChromaDB não carregou o runtime C++ privado");
  }
  console.log(`[ATLAS] VSIX ${process.platform}-${process.arch}: manifesto, heartbeat, gravação e consulta vetorial validados.`);
  if (process.argv[3] && process.argv[4]) {
    child.kill("SIGKILL");
    await closed;
    const engineLaunch = getNativeLaunch(path.resolve(process.argv[3]), ["--host", "127.0.0.1", "--port", String(port), "--model", path.resolve(process.argv[4]), "--ctx-size", "512", "--threads", "2"]);
    output = "";
    child = spawn(engineLaunch.command, engineLaunch.args, { cwd: path.dirname(path.resolve(process.argv[3])), windowsHide: true });
    closed = once(child, "close");
    spawnError = null;
    child.on("error", error => { spawnError = error; });
    child.stdout.on("data", chunk => { output = (output + chunk).slice(-8192); });
    child.stderr.on("data", chunk => { output = (output + chunk).slice(-8192); });
    const engineDeadline = Date.now() + 60000;
    while (true) {
      if (spawnError || child.exitCode !== null || Date.now() >= engineDeadline) {
        throw new Error(`Engine não iniciou: ${spawnError ?? output}`);
      }
      try {
        if ((await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) })).ok) {
          break;
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Responda apenas: OK" }], max_tokens: 8, stream: false }),
      signal: AbortSignal.timeout(30000),
    });
    const completion = await response.json();
    assert.ok(response.ok && completion.choices?.[0]?.message?.content, JSON.stringify(completion));
    if (process.platform === "linux") {
      const maps = fs.readFileSync(`/proc/${child.pid}/maps`, "utf8");
      for (const library of ["libc.so.6", "libstdc++.so.6", "libgomp.so.1", "libssl.so.3", "libcrypto.so.3"]) {
        assert.ok(maps.includes(`/resources/linux-runtime/linux-${process.arch}/${library}`), `Engine não carregou ${library} privado`);
      }
    }
    console.log("[ATLAS] Engine: GGUF carregado e geração validada com as bibliotecas do VSIX.");
  }
} finally {
  if (child) {
    child.kill("SIGKILL");
    await closed.catch(() => {});
  }
  if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith("atlas vsix test-")) {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
