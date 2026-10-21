import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  materializeStoreDocsSnapshot,
  verifyStoreDocsSnapshot,
} from "../../scripts/store-docs-snapshot.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

async function fixtureRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "store-docs-snapshot-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "docs-publication"), { recursive: true });
  await Promise.all([
    cp(
      path.join(repositoryRoot, "docs-publication/pilot-release.json"),
      path.join(root, "docs-publication/pilot-release.json"),
    ),
    cp(
      path.join(repositoryRoot, "docs-publication/registry-baseline.json"),
      path.join(root, "docs-publication/registry-baseline.json"),
    ),
    cp(
      path.join(repositoryRoot, "docs-publication/snapshots"),
      path.join(root, "docs-publication/snapshots"),
      { recursive: true },
    ),
  ]);
  return root;
}

async function readGenerated(root) {
  const directory = path.join(root, "docs-publication/.generated/store-1.1.2");
  const names = (await readdir(directory)).sort();
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [name, await readFile(path.join(directory, name), "utf8")]),
    ),
  );
}

function stripFrontmatter(document) {
  return document.replace(/^---\n[\s\S]*?\n---\n\n/, "");
}

test("the real Store 1.1.2 snapshot verifies and materializes from shipped bytes", async (t) => {
  const root = await fixtureRoot(t);
  const verified = await verifyStoreDocsSnapshot({ rootDir: root });
  assert.equal(verified.receipt.package.name, "@ilokesto/store");
  assert.equal(verified.receipt.package.version, "1.1.2");
  assert.equal(
    verified.receipt.registry.integrity,
    verified.release.integrity,
  );
  assert.equal(verified.receipt.registry.gitHead, verified.release.sourceCommit);

  for (const file of verified.receipt.files) {
    const contents = await readFile(path.join(verified.packageDir, file.path));
    assert.equal(contents.byteLength, file.bytes);
    assert.equal(createHash("sha256").update(contents).digest("hex"), file.sha256);
  }

  await materializeStoreDocsSnapshot({ rootDir: root });
  const generated = await readGenerated(root);
  assert.deepEqual(Object.keys(generated), [
    "index.ko.mdx",
    "index.mdx",
    "meta.json",
    "quick-start.ko.mdx",
    "quick-start.mdx",
  ]);
  assert.deepEqual(JSON.parse(generated["meta.json"]), {
    pages: ["index", "quick-start"],
  });

  const englishSource = await readFile(path.join(verified.packageDir, "README.md"), "utf8");
  const koreanSource = await readFile(path.join(verified.packageDir, "README.ko.md"), "utf8");
  assert.equal(
    stripFrontmatter(generated["quick-start.mdx"])
      .replace("[한국어](/ko/store/quick-start)", "[한국어](./README.ko.md)")
      .replaceAll("@ilokesto/store@1.1.2", "@ilokesto/store"),
    englishSource,
  );
  assert.equal(
    stripFrontmatter(generated["quick-start.ko.mdx"])
      .replace("[English](/en/store/quick-start)", "[English](./README.md)")
      .replaceAll("@ilokesto/store@1.1.2", "@ilokesto/store"),
    koreanSource,
  );
});

test("verification rejects payload mutation and a mismatched pilot version", async (t) => {
  const mutatedRoot = await fixtureRoot(t);
  const readmePath = path.join(
    mutatedRoot,
    "docs-publication/snapshots/store/1.1.2/package/README.md",
  );
  await writeFile(readmePath, `${await readFile(readmePath, "utf8")}\nmutation\n`);
  await assert.rejects(
    verifyStoreDocsSnapshot({ rootDir: mutatedRoot }),
    /README\.md (?:byte count|SHA-256)/,
  );

  const publicationRoot = await fixtureRoot(t);
  const publicationPath = path.join(publicationRoot, "docs-publication/pilot-release.json");
  const publication = JSON.parse(await readFile(publicationPath, "utf8"));
  publication.release.version = "2.0.0";
  await writeFile(publicationPath, `${JSON.stringify(publication, null, 2)}\n`);
  await assert.rejects(
    verifyStoreDocsSnapshot({ rootDir: publicationRoot }),
    /pilot package version must be "1\.1\.2"/,
  );
});

test("materialization is independent of main docs and registry channel movement", async (t) => {
  const root = await fixtureRoot(t);
  const currentDocs = path.join(root, "packages/store/docs/index.mdx");
  await mkdir(path.dirname(currentDocs), { recursive: true });
  await writeFile(currentDocs, "first unrelated current-main document\n");

  await materializeStoreDocsSnapshot({ rootDir: root });
  const first = await readGenerated(root);
  await writeFile(currentDocs, "completely different current-main document\n");
  const baselinePath = path.join(root, "docs-publication/registry-baseline.json");
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  baseline.packages.store.version = "99.0.0";
  baseline.packages.store.distTags.latest = "99.0.0";
  await writeFile(baselinePath, JSON.stringify(baseline));
  await writeFile(
    path.join(root, "docs-publication/.generated/store-1.1.2/stale.mdx"),
    "stale\n",
  );
  await materializeStoreDocsSnapshot({ rootDir: root });
  assert.deepEqual(await readGenerated(root), first);
});

test("the frozen runtime exposes and executes the Store 1.1.2 contract", async () => {
  const runtimeUrl = pathToFileURL(
    path.join(
      repositoryRoot,
      "docs-publication/snapshots/store/1.1.2/package/dist/index.js",
    ),
  );
  const module = await import(runtimeUrl.href);
  assert.deepEqual(Object.keys(module), ["Store"]);

  const store = new module.Store({ count: 0 });
  let duplicateCalls = 0;
  const duplicate = () => duplicateCalls++;
  store.subscribe(duplicate);
  store.subscribe(duplicate);
  store.setState((state) => ({ count: state.count + 1 }));
  assert.equal(store.getInitialState().count, 0);
  assert.equal(store.getState().count, 1);
  assert.equal(duplicateCalls, 1);

  const sentinel = new Error("listener sentinel");
  let laterListenerRan = false;
  store.subscribe(() => {
    throw sentinel;
  });
  store.subscribe(() => {
    laterListenerRan = true;
  });
  assert.throws(() => store.setState({ count: 2 }), (error) => error === sentinel);
  assert.equal(laterListenerRan, false);
});
