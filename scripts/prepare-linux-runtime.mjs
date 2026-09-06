import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { getRequestedTarget } from "./atlas-platform-targets.mjs";
import { linuxRuntimePackages, packages } from "./linux-runtime-packages.mjs";

const target = getRequestedTarget();
if (target.os !== "linux") {
  console.log(`[ATLAS] Runtime Linux não necessário para ${target.name}.`);
  process.exit(0);
}
const spec = linuxRuntimePackages[target.name];
if (!spec) {
  throw new Error(`Runtime Linux não suportado: ${target.name}`);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "resources", "linux-runtime", target.name);
const lock = sha256(Buffer.from(JSON.stringify({ spec, packages, format: 2 })));
const requiredFiles = [spec.loader, "libc.so.6", "libm.so.6", "libgcc_s.so.1", "libstdc++.so.6", "libgomp.so.1", "libssl.so.3", "libcrypto.so.3", "licenses/libc6.copyright", "licenses/gcc-14-base.copyright", "licenses/libssl3t64.copyright"];
const manifestPath = path.join(destination, "manifest.json");
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.lock === lock && requiredFiles.every(name => manifest.files?.[name]) && Object.entries(manifest.files).every(([name, hash]) => {
      const file = path.join(destination, name);
      return fs.existsSync(file) && sha256(fs.readFileSync(file)) === hash;
    })) {
      console.log(`[ATLAS] Runtime Linux verificado: ${target.name}`);
      process.exit(0);
    }
  } catch {
    // Rebuild an incomplete/corrupt cache from the pinned packages.
  }
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-linux-runtime-"));
const files = {};
const origins = [];
try {
  fs.mkdirSync(destination, { recursive: true });
  for (const pkg of packages) {
    const url = `${spec.baseUrl}${pkg.folder}/${pkg.name}_${pkg.version}_${spec.arch}.deb`;
    console.log(`[ATLAS] Preparando ${pkg.name} ${pkg.version} (${spec.arch})...`);
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) {
      throw new Error(`Falha ao baixar ${url}: HTTP ${response.status}`);
    }
    const deb = Buffer.from(await response.arrayBuffer());
    if (sha256(deb) !== spec.hashes[pkg.name]) {
      throw new Error(`SHA-256 inválido: ${pkg.name}`);
    }
    const payload = readDebData(deb);
    const archive = path.join(temp, "data.tar");
    fs.writeFileSync(archive, payload);
    const entries = execFileSync("tar", ["-tf", archive], { encoding: "utf8", windowsHide: true }).trim().split(/\r?\n/);
    for (const entry of entries) {
      const name = path.posix.basename(entry);
      if (!entry.includes(`/${spec.triplet}/`) || entry.endsWith("/")) {
        continue;
      }
      // Copy real ELF files under SONAMEs, avoiding symlinks in VSIX/Windows.
      let soname;
      if (name === spec.loader || /^lib(?:c|m|dl|pthread|rt|resolv|util|anl)\.so\.\d+$/.test(name) || /^libnss_(?:dns|files)\.so\.2$/.test(name) || /^(libgcc_s\.so\.1|libssl\.so\.3|libcrypto\.so\.3)$/.test(name)) {
        soname = name;
      } else if (/^libstdc\+\+\.so\.6\.\d+\.\d+$/.test(name)) {
        soname = "libstdc++.so.6";
      } else if (/^libgomp\.so\.1\.\d+\.\d+$/.test(name)) {
        soname = "libgomp.so.1";
      }
      if (soname) {
        const data = extract(archive, entry);
        if (data.subarray(0, 4).toString("hex") !== "7f454c46") {
          throw new Error(`Biblioteca ELF inválida: ${entry}`);
        }
        const machine = data.readUInt16LE(18);
        if (data[4] !== 2 || data[5] !== 1 || machine !== (spec.arch === "amd64" ? 62 : 183)) {
          throw new Error(`Arquitetura ELF incorreta para ${target.name}: ${entry}`);
        }
        save(soname, data);
      }
    }
    const copyright = entries.find(entry => entry === `./usr/share/doc/${pkg.name}/copyright`);
    if (copyright) {
      const data = extract(archive, copyright);
      if (data.length) {
        save(`licenses/${pkg.name}.copyright`, data);
      }
    }
    origins.push({ ...pkg, url, sha256: spec.hashes[pkg.name], sourceArchive: `${spec.baseUrl}${pkg.folder}/` });
  }
  for (const required of requiredFiles) {
    if (!files[required]) {
      throw new Error(`Runtime incompleto: ${required}`);
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ target: target.name, loader: spec.loader, glibc: "2.39", lock, origins, files }, null, 2) + "\n");
  console.log(`[ATLAS] Runtime Linux empacotado: ${target.name} (${Object.keys(files).length} arquivos).`);
} finally {
  if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith("atlas-linux-runtime-")) {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function save(name, data) {
  const file = path.join(destination, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data, { mode: name === spec.loader ? 0o755 : 0o644 });
  files[name] = sha256(data);
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function extract(archive, entry) {
  return execFileSync("tar", ["-xOf", archive, entry], { maxBuffer: 32 * 1024 * 1024, windowsHide: true });
}

function readDebData(deb) {
  if (deb.subarray(0, 8).toString() !== "!<arch>\n") {
    throw new Error("Pacote Debian inválido.");
  }
  for (let offset = 8; offset + 60 <= deb.length;) {
    const name = deb.subarray(offset, offset + 16).toString().trim().replace(/\/$/, "");
    const size = Number(deb.subarray(offset + 48, offset + 58).toString().trim());
    if (!Number.isSafeInteger(size) || size < 0 || offset + 60 + size > deb.length) {
      throw new Error("Entrada Debian inválida.");
    }
    if (/^data\.tar(?:\.(?:xz|zst|gz))?$/.test(name)) {
      return deb.subarray(offset + 60, offset + 60 + size);
    }
    offset += 60 + size + (size % 2);
  }
  throw new Error("Arquivo data.tar ausente no pacote Debian.");
}
