import { mkdir, mkdtemp, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { OWNED_PACKAGE, PACKAGE_NAMES, RELEASE_CATALOG, auditedRelease } from './catalog.mjs';
import { collectExamples } from './examples.mjs';
import { receiptLayout, sourceLayout } from './layout.mjs';
import { atomicWrite, commitObject, diskFiles, download, equal, git, gitEntries, gitFiles, gitText, hash, inventory, invariant, json, optionalBytes, readJson, tarFiles, writeFiles } from './io.mjs';

const isDocs = (file) => /^packages\/[^/]+\/(?:docs\/|README(?:\.ko)?\.md$)/.test(file);
const isStandaloneDocs = (file) => /^(?:docs\/|website\/|docs-publication\/|README(?:\.ko)?\.md$)/.test(file);

export function releaseEntry(name, releaseCommit, docsCommit, revision) {
  invariant(PACKAGE_NAMES.includes(name), `unknown package ${name}`);
  invariant(Number.isSafeInteger(revision) && revision > 0, 'revision must be a positive integer');
  invariant(/^[a-f0-9]{40}$/.test(docsCommit ?? ''), 'docsCommit must be a full commit SHA');
  const matches = Object.values(RELEASE_CATALOG).filter(release =>
    release.name === `@ilokesto/${name}` && release.releaseCommit === releaseCommit);
  invariant(matches.length === 1, `missing or ambiguous audited release ${name} at ${releaseCommit}`);
  const { version, channel } = matches[0];
  return { name: `@ilokesto/${name}`, version, channel, revision, releaseCommit, docsCommit, snapshot: `docs-publication/releases/${name}/${version}/r${revision}` };
}
export function validateManifest(manifest, { complete = true } = {}) {
  invariant(manifest?.schemaVersion === 1 && manifest.packages && typeof manifest.packages === 'object' && !Array.isArray(manifest.packages), 'invalid publication manifest');
  const names = Object.keys(manifest.packages).sort();
  invariant(names.length > 0, 'empty publication manifest');
  if (complete) equal(names, [OWNED_PACKAGE], 'complete package inventory');
  for (const name of names) {
    const entry = manifest.packages[name];
    invariant(entry && typeof entry === 'object', `missing identity for ${name}`);
    const expected = releaseEntry(name, entry.releaseCommit, entry.docsCommit, entry.revision);
    invariant(/^[a-f0-9]{64}$/.test(entry.receiptSha256 ?? ''), `${name} receipt digest missing`);
    expected.receiptSha256 = entry.receiptSha256;
    equal(Object.keys(entry).sort(), Object.keys(expected).sort(), `${name} identity fields`);
    for (const key of Object.keys(expected)) equal(entry[key], expected[key], `${name} ${key}`);
  }
  return manifest;
}

export function verifyDocsRevision({ rootDir, releaseCommit, docsCommit, packageNames = [OWNED_PACKAGE], layout = 'monorepo-v1' }) {
  commitObject(rootDir, releaseCommit);
  commitObject(rootDir, docsCommit);
  git(rootDir, ['merge-base', '--is-ancestor', releaseCommit, docsCommit]);
  const paths = packageNames.map(name => sourceLayout(layout, name).packageBase || '.');
  const docFile = layout === 'standalone-v1' ? isStandaloneDocs : isDocs;
  const changed = git(rootDir, ['diff', '--name-only', '-z', releaseCommit, docsCommit, '--', ...paths]).toString().split('\0').filter(Boolean);
  invariant(changed.every(docFile), `docs revision changes package runtime/build inputs: ${changed.filter((file) => !docFile(file)).join(', ')}`);
  for (const name of packageNames) {
    const runtime = (commit) => gitEntries(rootDir, commit, [sourceLayout(layout, name).packageBase || '.']).filter((entry) => !docFile(entry.path));
    equal(runtime(docsCommit), runtime(releaseCommit), `${name} runtime source/manifests/build configuration`);
  }
  // Root documentation tooling may evolve independently. No package is rebuilt
  // for released examples: npm artifact bytes and the runtime lock are verified.
  return { releaseCommit, docsCommit };
}

function sourcePayload(rootDir, entry, layout) {
  const name = entry.name.slice('@ilokesto/'.length);
  const files = new Map();
  const sources = {};
  for (const [label, commit] of [['release', entry.releaseCommit], ['revision', entry.docsCommit]]) {
    const base = sourceLayout(layout, name).packageBase;
    const entries = gitEntries(rootDir, commit, [`${base}docs`, `${base}README.md`, `${base}README.ko.md`]);
    invariant(!entries.some(file => file.path.startsWith(`${base}docs/next/`) || /^next(?:\.ko)?\.mdx$/.test(file.path.slice(`${base}docs/`.length))), `${name} documentation uses the reserved next route`);
    invariant(entries.some((file) => file.path === `${base}README.md`) && entries.some((file) => file.path === `${base}README.ko.md`), `missing bilingual READMEs for ${name}`);
    const contents = gitFiles(rootDir, entries);
    for (const [file, bytes] of contents) files.set(`${label}/${file.slice(base.length)}`, bytes);
    const docsTree = gitText(rootDir, ['rev-parse', `${commit}:${base}docs`]);
    if (label === 'release') equal(docsTree, auditedRelease(entry).docsTree, `${name} audited docs tree`);
    sources[label] = {
      commit,
      packageTree: gitText(rootDir, ['rev-parse', base ? `${commit}:${base.slice(0, -1)}` : `${commit}^{tree}`]),
      docsTree,
      files: entries,
    };
  }
  const runtimeEntries = gitEntries(rootDir, entry.releaseCommit, [sourceLayout(layout, name).packageBase || '.'])
    .filter((record) => !(layout === 'standalone-v1' ? isStandaloneDocs : isDocs)(record.path));
  const runtimeFiles = inventory(gitFiles(rootDir, runtimeEntries)).map((record, index) => ({ ...record, blob: runtimeEntries[index].blob, mode: runtimeEntries[index].mode }));
  const examples = collectExamples(rootDir, entry.docsCommit, name, layout);
  for (const [file, bytes] of examples.files) files.set(`examples/${file}`, bytes);
  return { files, sources, runtimeFiles, examples: { commit: entry.docsCommit, files: examples.entries } };
}
function unpackAndVerify({ tarball, entry, releaseFiles, sourceManifest, dependencyVersions }) {
  const name = entry.name.slice('@ilokesto/'.length);
  const audited = auditedRelease(entry);
  equal(`sha512-${hash(tarball, 'sha512', 'base64')}`, audited.integrity, `${name} npm tarball SRI`);
  const files = tarFiles(tarball);
  invariant(files.has('package.json'), 'tarball has no package manifest');
  const manifest = JSON.parse(files.get('package.json'));
  equal(manifest.name, entry.name, 'npm package name');
  equal(manifest.version, entry.version, 'npm package version');
  for (const file of ['README.md', 'README.ko.md']) {
    invariant(files.has(file), `npm payload missing ${file}`);
    equal(hash(files.get(file)), hash(releaseFiles.get(`release/${file}`)), `npm ${file} source bytes`);
  }
  const expected = structuredClone(sourceManifest);
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dependency, version] of Object.entries(expected[section] ?? {})) {
      if (!version.startsWith('workspace:')) continue;
      const dependencyName = dependency.replace('@ilokesto/', '');
      invariant(dependencyVersions[dependencyName], `unknown workspace dependency ${dependency}`);
      const range = version.slice('workspace:'.length);
      expected[section][dependency] = range === '*' ? dependencyVersions[dependencyName] : ['^', '~'].includes(range) ? `${range}${dependencyVersions[dependencyName]}` : range;
    }
  }
  // Key order is irrelevant to JSON manifests; values and the entire field set are not.
  const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  equal(canonical(manifest), canonical(expected), 'npm/source package manifest');
  return { files, manifest };
}
export function buildSnapshot({ rootDir, entry, tarball, report, layout = 'monorepo-v1' }) {
  const name = entry.name.slice('@ilokesto/'.length);
  const audited = auditedRelease(entry);
  equal(hash(report), audited.reportSha256, 'audited provenance report SHA-256');
  const base = sourceLayout(layout, name).packageBase;
  equal(audited.sourceLayout ?? 'monorepo-v1', layout, 'audited source layout');
  const source = sourcePayload(rootDir, entry, layout);
  const manifest = JSON.parse(git(rootDir, ['show', `${entry.releaseCommit}:${base}package.json`]));
  const dependencyVersions = layout === 'standalone-v1' ? {} : Object.fromEntries(PACKAGE_NAMES.map(dependency => [
    dependency, JSON.parse(git(rootDir, ['show', `${entry.releaseCommit}:packages/${dependency}/package.json`])).version,
  ]));
  const npm = unpackAndVerify({ tarball, entry, releaseFiles: source.files, sourceManifest: manifest, dependencyVersions });
  source.files.set('npm/package.tgz', tarball);
  source.files.set('provenance/release-provenance.md', report);
  const receipt = {
    schemaVersion: layout === 'standalone-v1' ? 3 : 2,
    ...(layout === 'standalone-v1' ? { sourceLayout: layout } : {}),
    package: entry,
    releaseSource: source.sources.release,
    docsRevision: source.sources.revision,
    runtimeSource: { commit: entry.releaseCommit, files: source.runtimeFiles },
    exampleSource: source.examples,
    registry: {
      tarball: audited.tarball,
      integrity: audited.integrity,
      shasum: hash(tarball, 'sha1'),
      gitHead: audited.provenance.npmGitHead,
      attestations: audited.provenance.npmAttestations,
      files: inventory(npm.files),
    },
    provenance: {
      ...audited.provenance,
      reportSha256: audited.reportSha256,
      tag: `${entry.name}@${entry.version}`,
      tagTarget: entry.releaseCommit,
      ...(audited.timestampAnomaly ? { timestampAnomaly: audited.timestampAnomaly } : {}),
    },
    files: inventory(source.files),
  };
  source.files.set('receipt.json', Buffer.from(json(receipt)));
  return { files: source.files, receipt };
}

export async function writeImmutableSnapshot(directory, files) {
  await mkdir(path.dirname(directory), { recursive: true });
  let existing;
  try { existing = await diskFiles(directory); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing) {
    equal(inventory(existing), inventory(files), 'existing immutable snapshot (refusing overwrite)');
    return;
  }
  const temporary = await mkdtemp(`${directory}.capture-`);
  try {
    await writeFiles(temporary, files);
    await rename(temporary, directory);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
async function publicationLock(rootDir, action) {
  const directory = path.join(rootDir, 'docs-publication');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, '.publication.lock');
  const handle = await open(file, 'wx');
  try { return await action(); } finally {
    await handle.close();
    await rm(file);
  }
}
export async function capturePublication({ rootDir, packageName = 'all', releaseCommit, docsCommit, revision, provenanceReport }) {
  const names = packageName === 'all' ? [OWNED_PACKAGE] : [packageName];
  equal(names, [OWNED_PACKAGE], 'owning package capture');
  for (const name of names) releaseEntry(name, releaseCommit, docsCommit, revision);
  verifyDocsRevision({ rootDir, releaseCommit, docsCommit, packageNames: names, layout: 'standalone-v1' });
  invariant(provenanceReport, 'capture requires an explicit --provenance-report');
  const reportPath = provenanceReport;
  const report = await readFile(reportPath);
  return publicationLock(rootDir, async () => {
    const candidatePath = path.join(rootDir, 'docs-publication/candidate.json');
    const previous = await optionalBytes(candidatePath) ?? await optionalBytes(path.join(rootDir, 'docs-publication/active.json'));
    const candidate = previous ? validateManifest(JSON.parse(previous), { complete: false }) : { schemaVersion: 1, packages: {} };
    for (const name of names) {
      const entry = releaseEntry(name, releaseCommit, docsCommit, revision);
      const audited = auditedRelease(entry);
      equal(hash(report), audited.reportSha256, 'audited provenance report');
      const tag = `${entry.name}@${entry.version}`;
      equal(gitText(rootDir, ['rev-parse', `${tag}^{commit}`]), releaseCommit, `${name} release tag target`);
      equal(gitText(rootDir, ['cat-file', '-t', tag]), 'tag', `${name} annotated release tag`);
      const metadata = JSON.parse(await download(`https://registry.npmjs.org/${encodeURIComponent(entry.name)}/${entry.version}`));
      equal(metadata.name, entry.name, 'registry package name');
      equal(metadata.version, entry.version, 'registry package version');
      equal(metadata.dist?.integrity, audited.integrity, 'registry audited SRI');
      equal(metadata.dist?.tarball, audited.tarball, 'registry tarball URL');
      equal(metadata.gitHead ?? null, audited.provenance.npmGitHead, 'audited npm gitHead');
      equal(metadata.dist?.attestations ?? null, audited.provenance.npmAttestations, 'audited npm attestations');
      const tarball = await download(audited.tarball);
      equal(hash(tarball, 'sha1'), metadata.dist.shasum, 'registry tarball SHA-1');
      const built = buildSnapshot({ rootDir, entry, tarball, report, layout: 'standalone-v1' });
      await writeImmutableSnapshot(path.join(rootDir, entry.snapshot), built.files);
      candidate.packages[name] = { ...entry, receiptSha256: hash(built.files.get('receipt.json')) };
      const archivePath = path.join(rootDir, 'docs-publication/archive-index.json');
      const archives = await readJson(archivePath);
      invariant(archives.schemaVersion === 1 && Array.isArray(archives.entries), 'missing archive inventory');
      const existing = archives.entries.find(item => item.snapshot === entry.snapshot);
      if (existing) equal(existing, candidate.packages[name], 'immutable archive identity');
      else archives.entries.push(candidate.packages[name]);
      await atomicWrite(archivePath, json(archives));
    }
    candidate.packages = Object.fromEntries(PACKAGE_NAMES.filter((name) => candidate.packages[name]).map((name) => [name, candidate.packages[name]]));
    await atomicWrite(candidatePath, json(candidate));
    return { manifest: candidate, manifestPath: candidatePath };
  });
}

export async function verifySnapshot({ rootDir, entry }) {
  const files = await diskFiles(path.join(rootDir, entry.snapshot));
  invariant(files.has('receipt.json') && files.has('npm/package.tgz') && files.has('provenance/release-provenance.md'), 'incomplete immutable snapshot');
  equal(hash(files.get('receipt.json')), entry.receiptSha256, `${entry.name} snapshot receipt SHA-256`);
  const receipt = JSON.parse(files.get('receipt.json'));
  const { receiptSha256, ...identity } = entry;
  equal(receipt.package, identity, `${entry.name} receipt identity`);
  const layout = receiptLayout(receipt, entry.name.slice('@ilokesto/'.length));
  equal(auditedRelease(entry).sourceLayout ?? 'monorepo-v1', layout.kind, 'audited source layout');
  for (const source of [receipt.releaseSource, receipt.docsRevision, receipt.runtimeSource]) {
    invariant(source.files.every(file => file.path.startsWith(layout.packageBase)), 'source file outside explicit package layout');
  }
  invariant(receipt.exampleSource.files.every(file => file.path.startsWith(`${layout.app}/`)), 'example outside explicit website layout');
  equal(receipt.releaseSource.commit, entry.releaseCommit, 'release commit');
  equal(receipt.docsRevision.commit, entry.docsCommit, 'docs revision commit');
  equal(receipt.runtimeSource.commit, entry.releaseCommit, 'runtime source commit');
  equal(receipt.exampleSource.commit, receipt.schemaVersion === 1 ? entry.releaseCommit : entry.docsCommit, 'example source commit');
  const payload = new Map(files);
  payload.delete('receipt.json');
  equal(inventory(payload), receipt.files, `${entry.name} snapshot file inventory/bytes/SHA-256`);
  equal([...files.keys()].filter((file) => file.startsWith('examples/')).sort(), receipt.exampleSource.files.map((file) => `examples/${file.path}`), 'example source inventory');
  for (const source of receipt.exampleSource.files) {
    const bytes = files.get(`examples/${source.path}`);
    invariant(['100644', '100755'].includes(source.mode), 'unsupported example source mode');
    equal(hash(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), 'sha1'), source.blob, `example source blob ${source.path}`);
  }
  equal(receipt.registry.integrity, auditedRelease(entry).integrity, 'audited registry integrity');
  equal(`sha512-${hash(files.get('npm/package.tgz'), 'sha512', 'base64')}`, receipt.registry.integrity, 'npm tarball SRI');
  equal(inventory(tarFiles(files.get('npm/package.tgz'))), receipt.registry.files, 'npm package inventory');
  return { entry, receipt, files };
}
export async function verifyPublication({ rootDir, manifestPath = 'docs-publication/active.json' }) {
  const manifest = validateManifest(await readJson(path.resolve(rootDir, manifestPath)));
  const archives = await readJson(path.join(rootDir, 'docs-publication/archive-index.json'));
  invariant(archives.schemaVersion === 1 && Array.isArray(archives.entries) && archives.entries.length > 0, 'missing archive inventory');
  invariant(new Set(archives.entries.map(entry => entry.snapshot)).size === archives.entries.length, 'duplicate archive identity');
  for (const entry of archives.entries) {
    invariant(entry.name === `@ilokesto/${OWNED_PACKAGE}`, 'foreign archive in owning publication');
    validateManifest({ schemaVersion: 1, packages: { [OWNED_PACKAGE]: entry } });
    await verifySnapshot({ rootDir, entry });
  }
  const snapshots = new Map();
  for (const [name, entry] of Object.entries(manifest.packages)) {
    snapshots.set(name, await verifySnapshot({ rootDir, entry }));
  }
  return { manifest, snapshots };
}
export async function currentManifestHash(rootDir) {
  const bytes = await optionalBytes(path.join(rootDir, 'docs-publication/active.json'));
  return bytes ? hash(bytes) : 'none';
}
export async function promotePublication({ rootDir, expectedCurrent, candidatePath = 'docs-publication/candidate.json' }) {
  invariant(expectedCurrent === 'none' || /^[a-f0-9]{64}$/.test(expectedCurrent ?? ''), 'promotion requires --expected-current SHA256|none');
  return publicationLock(rootDir, async () => {
    equal(await currentManifestHash(rootDir), expectedCurrent, 'expected current manifest (stale promotion)');
    const bytes = await readFile(path.resolve(rootDir, candidatePath));
    const result = await verifyPublication({ rootDir, manifestPath: candidatePath });
    equal(hash(await readFile(path.resolve(rootDir, candidatePath))), hash(bytes), 'candidate changed during verification');
    equal(await currentManifestHash(rootDir), expectedCurrent, 'expected current manifest (stale promotion)');
    await atomicWrite(path.join(rootDir, 'docs-publication/active.json'), bytes);
    return { manifest: result.manifest, hash: hash(bytes) };
  });
}
