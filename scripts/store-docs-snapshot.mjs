import { createHash } from "node:crypto";
import { readdir, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const STORE_PACKAGE_NAME = "@ilokesto/store";
export const STORE_VERSION = "1.1.2";

const SNAPSHOT_RELATIVE_PATH = `docs-publication/snapshots/store/${STORE_VERSION}`;
const PACKAGE_RELATIVE_PATH = `${SNAPSHOT_RELATIVE_PATH}/package`;
const GENERATED_RELATIVE_PATH = `docs-publication/.generated/store-${STORE_VERSION}`;
const EXPECTED_FILES = [
  "README.md",
  "README.ko.md",
  "package.json",
  "dist/index.js",
  "dist/index.d.ts",
];
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function invariant(condition, message) {
  if (!condition) {
    throw new Error(`Store ${STORE_VERSION} snapshot verification failed: ${message}`);
  }
}

async function readJson(filePath, label) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${filePath}`, { cause: error });
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label} at ${filePath}`, { cause: error });
  }
}

async function listPayloadFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listPayloadFiles(absolutePath, relativePath)));
    } else {
      invariant(entry.isFile(), `payload entry is not a regular file: ${relativePath}`);
      files.push(relativePath);
    }
  }

  return files.sort();
}

function assertSameValue(actual, expected, label) {
  invariant(actual === expected, `${label} must be ${JSON.stringify(expected)}`);
}

export async function verifyStoreDocsSnapshot({ rootDir = repositoryRoot } = {}) {
  const root = path.resolve(rootDir);
  const releasePath = path.join(root, "docs-publication/pilot-release.json");
  const receiptPath = path.join(root, SNAPSHOT_RELATIVE_PATH, "receipt.json");
  const packageDir = path.join(root, PACKAGE_RELATIVE_PATH);
  const [publication, receipt, manifest] = await Promise.all([
    readJson(releasePath, "pilot release"),
    readJson(receiptPath, "snapshot receipt"),
    readJson(path.join(packageDir, "package.json"), "frozen package manifest"),
  ]);
  const pinned = publication?.release;

  assertSameValue(publication?.schemaVersion, 1, "publication schemaVersion");
  invariant(pinned && typeof pinned === "object", "publication is missing release");
  assertSameValue(receipt?.schemaVersion, 1, "receipt schemaVersion");
  assertSameValue(receipt?.package?.name, STORE_PACKAGE_NAME, "receipt package name");
  assertSameValue(receipt?.package?.version, STORE_VERSION, "receipt package version");
  assertSameValue(receipt?.packagePath, PACKAGE_RELATIVE_PATH, "receipt packagePath");
  assertSameValue(manifest?.name, STORE_PACKAGE_NAME, "frozen manifest name");
  assertSameValue(manifest?.version, STORE_VERSION, "frozen manifest version");
  assertSameValue(pinned.name, STORE_PACKAGE_NAME, "pilot package name");
  assertSameValue(pinned.version, STORE_VERSION, "pilot package version");
  assertSameValue(receipt?.registry?.tarball, pinned.tarball, "receipt registry tarball");
  assertSameValue(receipt?.registry?.integrity, pinned.integrity, "receipt registry integrity");
  assertSameValue(receipt?.registry?.gitHead, pinned.sourceCommit, "receipt registry gitHead");
  assertSameValue(receipt?.registry?.publishedAt, pinned.publishedAt, "receipt publication time");
  invariant(
    typeof receipt?.registry?.shasum === "string" &&
      /^[a-f0-9]{40}$/.test(receipt.registry.shasum),
    "receipt registry shasum must be a lowercase SHA-1",
  );

  invariant(Array.isArray(receipt?.files), "receipt files must be an array");
  const receiptPaths = receipt.files.map((file) => file?.path);
  assertSameValue(
    JSON.stringify([...receiptPaths].sort()),
    JSON.stringify([...EXPECTED_FILES].sort()),
    "receipt file inventory",
  );
  assertSameValue(new Set(receiptPaths).size, EXPECTED_FILES.length, "receipt unique file count");

  const payloadFiles = await listPayloadFiles(packageDir);
  assertSameValue(
    JSON.stringify(payloadFiles),
    JSON.stringify([...EXPECTED_FILES].sort()),
    "payload file inventory",
  );

  for (const record of receipt.files) {
    invariant(Number.isSafeInteger(record.bytes) && record.bytes >= 0, `${record.path} has an invalid byte count`);
    invariant(
      typeof record.sha256 === "string" && /^[a-f0-9]{64}$/.test(record.sha256),
      `${record.path} has an invalid SHA-256`,
    );
    const filePath = path.join(packageDir, ...record.path.split("/"));
    const [contents, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
    invariant(fileStat.isFile(), `${record.path} is not a regular file`);
    assertSameValue(contents.byteLength, record.bytes, `${record.path} byte count`);
    assertSameValue(
      createHash("sha256").update(contents).digest("hex"),
      record.sha256,
      `${record.path} SHA-256`,
    );
  }

  return { release: pinned, receipt, packageDir };
}

function renderQuickStart(readme, locale) {
  const languageLink =
    locale === "en"
      ? ["[한국어](./README.ko.md)", "[한국어](/ko/store/quick-start)"]
      : ["[English](./README.md)", "[English](/en/store/quick-start)"];
  const adapted = readme
    .replace(languageLink[0], languageLink[1])
    .replaceAll("pnpm add @ilokesto/store", `pnpm add @ilokesto/store@${STORE_VERSION}`)
    .replaceAll("npm install @ilokesto/store", `npm install @ilokesto/store@${STORE_VERSION}`);
  const title = locale === "en" ? "Store 1.1.2 quick start" : "Store 1.1.2 빠른 시작";
  return `---\ntitle: ${title}\n---\n\n${adapted}`;
}

const indexDocuments = {
  en: `---
title: Store 1.1.2
description: Immutable documentation snapshot for @ilokesto/store 1.1.2
---

> Versioned site annotation: this release page is generated from the frozen npm 1.1.2 payload, not current-main documentation.

[Read the frozen 1.1.2 quick start](./quick-start)
`,
  ko: `---
title: Store 1.1.2
description: "@ilokesto/store 1.1.2 불변 문서 스냅샷"
---

> 버전 사이트 안내: 이 릴리스 페이지는 현재 main 문서가 아닌 고정된 npm 1.1.2 페이로드에서 생성됩니다.

[고정된 1.1.2 빠른 시작 읽기](./quick-start)
`,
};

export async function materializeStoreDocsSnapshot({ rootDir = repositoryRoot } = {}) {
  const verified = await verifyStoreDocsSnapshot({ rootDir });
  const outputDir = path.join(path.resolve(rootDir), GENERATED_RELATIVE_PATH);
  const [englishReadme, koreanReadme] = await Promise.all([
    readFile(path.join(verified.packageDir, "README.md"), "utf8"),
    readFile(path.join(verified.packageDir, "README.ko.md"), "utf8"),
  ]);
  const outputs = new Map([
    ["index.mdx", indexDocuments.en],
    ["index.ko.mdx", indexDocuments.ko],
    ["quick-start.mdx", renderQuickStart(englishReadme, "en")],
    ["quick-start.ko.mdx", renderQuickStart(koreanReadme, "ko")],
    ["meta.json", `${JSON.stringify({ pages: ["index", "quick-start"] }, null, 2)}\n`],
  ]);

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await Promise.all(
    [...outputs].map(([name, contents]) =>
      writeFile(path.join(outputDir, name), contents, "utf8"),
    ),
  );

  return { outputDir, files: [...outputs.keys()], receipt: verified.receipt };
}

async function runCli() {
  const result = await materializeStoreDocsSnapshot();
  process.stdout.write(
    `Verified @ilokesto/store@${STORE_VERSION} and generated ${result.files.length} files in ${result.outputDir}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
