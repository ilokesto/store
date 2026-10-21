import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import { verifyPresentationBoundary } from "./docs-presentation.mjs";
import { download, hash, inventory, tarFiles } from "./docs-publication/io.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const runtimeImporter = "docs-publication/runtime";
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

// Resolve the package directory, not a require-condition entry point. Several
// released packages intentionally expose import-only entry points.
export async function resolveInstalledPackage(specifier, directory) {
  const locations = createRequire(path.join(directory, "package.json")).resolve.paths(specifier);
  assert.ok(locations, `Expected a package specifier: ${specifier}`);
  for (const location of locations) {
    const candidate = path.join(location, specifier);
    let manifest;
    try {
      manifest = await readJson(path.join(candidate, "package.json"));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    assert.equal(typeof manifest.name, "string", `Missing package name: ${candidate}`);
    assert.equal(typeof manifest.version, "string", `Missing package version: ${candidate}`);
    return { manifest, directory: await realpath(candidate) };
  }
  throw new Error(`Missing runtime dependency ${specifier} from ${directory}`);
}

export async function inspectRuntimeClosure({ rootDir = repositoryRoot, packages }) {
  const root = await realpath(rootDir);
  const runtimeDirectory = path.join(root, runtimeImporter);
  const runtime = await readJson(path.join(runtimeDirectory, "package.json"));
  const lock = parse(await readFile(path.join(root, "pnpm-lock.yaml"), "utf8"));
  const importer = lock.importers[runtimeImporter];
  assert.ok(importer, "Released runtime importer is absent from pnpm-lock.yaml");
  const nodes = new Map();
  const physical = new Map();
  const roots = {};

  async function visit(specifier, from, reference) {
    assert.equal(typeof reference, "string", `Missing locked dependency: ${specifier}`);
    const installed = await resolveInstalledPackage(specifier, from);
    const { manifest, directory } = installed;
    assert.ok(
      directory.startsWith(path.join(root, "node_modules") + path.sep),
      `Released runtime escaped the registry install: ${specifier} -> ${directory}`,
    );
    const version = reference.startsWith(`${manifest.name}@`)
      ? reference.slice(manifest.name.length + 1)
      : reference;
    assert.equal(version.split("(")[0], manifest.version, `Installed version differs: ${specifier}`);
    const id = `${manifest.name}@${version}`;
    const integrity = lock.packages[`${manifest.name}@${manifest.version}`]?.resolution?.integrity;
    assert.match(integrity ?? "", /^sha512-/, `Missing registry integrity: ${id}`);
    if (nodes.has(id)) {
      assert.equal(physical.get(id), directory, `Duplicate physical runtime instance: ${id}`);
      return id;
    }
    const snapshot = lock.snapshots[id];
    assert.ok(snapshot, `Missing locked snapshot: ${id}`);
    const node = { name: manifest.name, version: manifest.version, integrity, dependencies: {} };
    nodes.set(id, node);
    physical.set(id, directory);
    const declared = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    };
    const references = { ...snapshot.dependencies, ...snapshot.optionalDependencies };
    for (const dependency of Object.keys(declared).sort()) {
      // These examples render React. Optional adapters not supplied by this
      // workspace are not part of the executed example's peer environment.
      if (manifest.peerDependenciesMeta?.[dependency]?.optional
        && !Object.hasOwn(runtime.dependencies, dependency)) continue;
      node.dependencies[dependency] = await visit(dependency, directory, references[dependency]);
    }
    return id;
  }

  for (const [name, release] of Object.entries(packages).sort()) {
    const alias = `@ilokesto/released-${name}`;
    const specifier = `npm:${release.name}@${release.version}`;
    assert.equal(runtime.dependencies[alias], specifier, `Unpinned released alias: ${alias}`);
    assert.equal(importer.dependencies[alias]?.specifier, specifier, `Stale alias lock: ${alias}`);
    roots[name] = await visit(alias, runtimeDirectory, importer.dependencies[alias].version);
    assert.equal(nodes.get(roots[name]).name, release.name);
    assert.equal(nodes.get(roots[name]).version, release.version);
  }
  for (const [alias, specifier] of Object.entries(runtime.dependencies).filter(([name]) => name.startsWith("@ilokesto/released-")).sort()) {
    const name = alias.slice("@ilokesto/released-".length);
    if (Object.hasOwn(roots, name)) continue;
    const match = /^npm:(@ilokesto\/[a-z][a-z0-9-]*)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(specifier);
    assert.ok(match && match[1] === `@ilokesto/${name}`, `Unpinned transitive alias: ${alias}`);
    assert.equal(importer.dependencies[alias]?.specifier, specifier, `Stale alias lock: ${alias}`);
    roots[name] = await visit(alias, runtimeDirectory, importer.dependencies[alias].version);
    assert.equal(nodes.get(roots[name]).name, match[1], `Wrong alias package: ${alias}`);
    assert.equal(nodes.get(roots[name]).version, match[2], `Wrong alias version: ${alias}`);
  }
  for (const name of Object.keys(runtime.dependencies).filter(name => !name.startsWith("@ilokesto/released-")).sort()) {
    assert.match(runtime.dependencies[name] ?? "", /^\d+\.\d+\.\d+$/, `Unpinned peer: ${name}`);
    assert.equal(importer.dependencies[name]?.specifier, runtime.dependencies[name]);
    roots[name] = await visit(name, runtimeDirectory, importer.dependencies[name].version);
  }

  for (const name of ["react", "react-dom"]) {
    const used = [...nodes.values()].some(node => node.name === name || node.dependencies[name]);
    if (!used) continue;
    assert.ok(roots[name], `Missing shared runtime peer: ${name}`);
    const app = await resolveInstalledPackage(name, path.join(root, "website"));
    assert.equal(app.directory, physical.get(roots[name]), `App and released examples duplicate ${name}`);
    for (const [id, node] of nodes) {
      if (node.dependencies[name]) {
        assert.equal(node.dependencies[name], roots[name], `Split ${name} peer context: ${id}`);
      }
    }
  }
  const overlays = [...nodes].filter(([, node]) => node.name === "@ilokesto/overlay");
  if (overlays.length > 0) {
    assert.equal(overlays.length, 1, "Split Overlay runtime instances");
    for (const [id, node] of nodes) {
      if (node.dependencies["@ilokesto/overlay"]) {
        assert.equal(node.dependencies["@ilokesto/overlay"], overlays[0][0],
          `${id} and its directly imported Overlay must share an instance`);
      }
    }
  }
  return {
    schemaVersion: 1,
    roots,
    nodes: Object.fromEntries([...nodes].sort(([a], [b]) => a.localeCompare(b))),
  };
}

export async function verifyRuntimeClosure({ rootDir = repositoryRoot, packages } = {}) {
  const publication = packages ?? (await readJson(path.join(rootDir, "docs-publication/active.json"))).packages;
  const actual = await inspectRuntimeClosure({ rootDir, packages: publication });
  const expected = await readJson(path.join(rootDir, runtimeImporter, "closure.json"));
  assert.deepEqual(actual, expected, "Released runtime closure changed; review and record an explicit promotion");
  await verifyInstalledReleaseFiles({ rootDir, packages: publication, closure: actual });
  await verifyRuntimePayloads({ rootDir, closure: actual });
  await verifyPresentationBoundary(rootDir);
  return actual;
}

export async function verifyRuntimePayloads({ rootDir, closure }) {
  const payloads = await readJson(path.join(rootDir, runtimeImporter, "payloads.json"));
  assert.equal(payloads.schemaVersion, 1, "Runtime payload schema");
  assert.deepEqual(Object.keys(payloads.nodes).sort(), Object.keys(closure.nodes).sort(), "Runtime payload inventory");
  const visited = new Set();
  async function visit(id, specifier, from) {
    if (visited.has(id)) return;
    visited.add(id);
    const installed = await resolveInstalledPackage(specifier, from);
    const node = closure.nodes[id];
    assert.equal(payloads.nodes[id].integrity, node.integrity, `Runtime payload SRI: ${id}`);
    for (const file of payloads.nodes[id].files) {
      const target = path.resolve(installed.directory, file.path);
      assert.ok(target.startsWith(installed.directory + path.sep), `Unsafe runtime payload: ${file.path}`);
      const bytes = await readFile(target);
      assert.equal(bytes.length, file.bytes, `Runtime payload changed: ${id}/${file.path}`);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, `Runtime payload changed: ${id}/${file.path}`);
    }
    for (const [dependency, target] of Object.entries(node.dependencies)) {
      await visit(target, dependency, installed.directory);
    }
  }
  for (const [name, id] of Object.entries(closure.roots)) {
    const specifier = closure.nodes[id].name.startsWith("@ilokesto/") ? `@ilokesto/released-${name}` : name;
    await visit(id, specifier, path.join(rootDir, runtimeImporter));
  }
}

export async function captureRuntimePayloads(closure) {
  const nodes = {};
  const artifacts = new Map();
  for (const [id, node] of Object.entries(closure.nodes)) {
    const key = `${node.name}@${node.version}`;
    if (!artifacts.has(key)) {
      const metadata = JSON.parse(await download(`https://registry.npmjs.org/${encodeURIComponent(node.name)}/${node.version}`));
      assert.equal(metadata.name, node.name, `Runtime registry name: ${id}`);
      assert.equal(metadata.version, node.version, `Runtime registry version: ${id}`);
      assert.equal(metadata.dist.integrity, node.integrity, `Runtime registry SRI: ${id}`);
      const bytes = await download(metadata.dist.tarball);
      assert.equal(`sha512-${hash(bytes, "sha512", "base64")}`, node.integrity, `Runtime tarball SRI: ${id}`);
      artifacts.set(key, inventory(tarFiles(bytes)));
    }
    nodes[id] = { integrity: node.integrity, files: artifacts.get(key) };
  }
  return { schemaVersion: 1, nodes };
}

export async function verifyInstalledReleaseFiles({ rootDir, packages, closure }) {
  for (const [name, release] of Object.entries(packages)) {
    const bytes = await readFile(path.join(rootDir, release.snapshot, "receipt.json"));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), release.receiptSha256, "Unpinned release receipt");
    const receipt = JSON.parse(bytes);
    assert.equal(closure.nodes[closure.roots[name]].integrity, receipt.registry.integrity, `Registry SRI differs: ${name}`);
    const installed = await resolveInstalledPackage(`@ilokesto/released-${name}`, path.join(rootDir, runtimeImporter));
    for (const file of receipt.registry.files) {
      const target = path.resolve(installed.directory, file.path);
      assert.ok(target.startsWith(installed.directory + path.sep), `Unsafe npm payload path: ${file.path}`);
      const contents = await readFile(target);
      assert.equal(contents.byteLength, file.bytes, `Published npm payload changed: ${name}/${file.path}`);
      assert.equal(createHash("sha256").update(contents).digest("hex"), file.sha256, `Published npm payload changed: ${name}/${file.path}`);
    }
  }
}

async function main() {
  assert.ok(process.argv.length <= 4, "Use docs-runtime.mjs record|verify [manifest]");
  const active = await readJson(path.resolve(repositoryRoot, process.argv[3] ?? "docs-publication/active.json"));
  if (process.argv[2] === "record") {
    const closure = await inspectRuntimeClosure({ packages: active.packages });
    const payloads = await captureRuntimePayloads(closure);
    await writeFile(
      path.join(repositoryRoot, runtimeImporter, "closure.json"),
      `${JSON.stringify(closure, null, 2)}\n`,
    );
    await writeFile(path.join(repositoryRoot, runtimeImporter, "payloads.json"), `${JSON.stringify(payloads, null, 2)}\n`);
    console.log(`Recorded ${Object.keys(closure.nodes).length} released runtime nodes`);
    return;
  }
  assert.ok(process.argv[2] === undefined || process.argv[2] === "verify", "Use docs-runtime.mjs record|verify");
  const closure = await verifyRuntimeClosure({ packages: active.packages });
  console.log(`Verified ${Object.keys(closure.nodes).length} released runtime nodes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
