#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SLUGS = ['store', 'state', 'form', 'overlay', 'modal', 'toast', 'fetcher', 'utilinent', 'queryable'];
const LEGACY = { state: 'caro-kann', form: 'sicilian', overlay: 'grunfeld', modal: 'grunfeld', toast: 'grunfeld' };
const DELETION_TARGETS = ['ilokesto/caro-kann', 'ilokesto/sicilian', 'ilokesto/grunfeld', 'ilokesto/ilokesto'];
const HEX = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const TYPES = new Set(['blob', 'tree', 'commit', 'tag']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const lines = bytes => bytes.toString().trim().split('\n').filter(Boolean);

function invariant(condition, code, detail) {
  if (!condition) {
    const error = new Error(`${code}: ${detail}`);
    error.code = code;
    throw error;
  }
}

function equal(actual, expected, code, detail) {
  invariant(JSON.stringify(actual) === JSON.stringify(expected), code, detail);
}

function unique(records, key, code) {
  const seen = new Set();
  for (const row of records) {
    invariant(!seen.has(row[key]), code, row[key]);
    seen.add(row[key]);
  }
}

async function exists(file) {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return false;
  }
}

export async function git(repo, args, input = '') {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith('GIT_')) {
      delete environment[key];
    }
  }
  Object.assign(environment, {
    GIT_MASTER: '1', GIT_PAGER: 'cat', PAGER: 'cat', LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1',
    GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: 'file',
  });
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['--no-pager', '-C', repo, ...args], {
      env: environment, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.stdin.on('error', error => {
      if (error.code !== 'EPIPE') {
        reject(error);
      }
    });
    child.on('close', code => {
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr);
      if (code !== 0) {
        const error = new Error(`GIT_FAILED: git ${args.join(' ')} exited ${code}: ${err.toString().trim()}`);
        error.code = 'GIT_FAILED';
        reject(error);
        return;
      }
      resolve(out);
    });
    child.stdin.end(input);
  });
}

async function text(repo, args, input) {
  return (await git(repo, args, input)).toString().trim();
}

export function mappedRef(source, ref) {
  invariant(/^[a-z][a-z0-9-]*$/.test(source), 'INVALID_SOURCE', source);
  invariant(typeof ref.ref === 'string' && ref.ref.startsWith('refs/'), 'INVALID_REF', ref.ref);
  invariant(ref.type === 'commit' || (ref.type === 'tag' && ref.peeledType === 'commit' && HEX.test(ref.peeled)), 'UNSUPPORTED_REF_TYPE', ref.ref);
  if (source === 'ilokesto' && /^refs\/tags\/@ilokesto\/[^/]+@[^/]+$/.test(ref.ref)) {
    return ref.ref;
  }
  return `refs/${ref.type === 'tag' ? 'tags' : 'heads'}/legacy/${source}/${ref.ref.slice(5)}`;
}

export function validateManifest(manifest) {
  invariant(manifest?.schemaVersion === 1 && SLUGS.includes(manifest.package), 'INVALID_MANIFEST', 'schemaVersion/package');
  const expectedSources = ['ilokesto', ...(LEGACY[manifest.package] ? [LEGACY[manifest.package]] : [])].sort();
  invariant(Array.isArray(manifest.archives), 'INVALID_MANIFEST', 'archives');
  equal(manifest.archives.map(source => source.id).sort(), expectedSources, 'SOURCE_ASSIGNMENT', manifest.package);
  invariant(HEX.test(manifest.source?.cut) && manifest.source.prefix === `packages/${manifest.package}` && HEX.test(manifest.source.tree), 'INVALID_MANIFEST', 'source');
  invariant(HEX.test(manifest.projection?.commit) && HEX.test(manifest.checkpoint?.commit), 'INVALID_MANIFEST', 'projection/checkpoint');
  const destinations = [];
  for (const source of manifest.archives) {
    invariant(Array.isArray(source.refs) && source.refs.length > 0 && Array.isArray(source.objects) && source.objects.length > 0, 'INVALID_MANIFEST', source.id);
    unique(source.refs, 'ref', 'DUPLICATE_SOURCE_REF');
    unique(source.objects, 'oid', 'DUPLICATE_OBJECT');
    for (const ref of source.refs) {
      invariant(HEX.test(ref.oid), 'INVALID_OBJECT_ID', ref.ref);
      equal(ref.destination, mappedRef(source.id, ref), 'MAPPING_RULE', ref.ref);
      destinations.push(ref.destination);
    }
    for (const object of source.objects) {
      invariant(HEX.test(object.oid) && TYPES.has(object.type) && Number.isSafeInteger(object.size) && object.size >= 0 && SHA256.test(object.sha256), 'INVALID_OBJECT_RECORD', object.oid);
    }
  }
  destinations.sort();
  for (let index = 1; index < destinations.length; index++) {
    invariant(destinations[index] !== destinations[index - 1] && !destinations[index].startsWith(`${destinations[index - 1]}/`), 'MAPPING_COLLISION', destinations[index]);
  }
  invariant(Array.isArray(manifest.projection.correspondence) && manifest.projection.correspondence.length > 0, 'INVALID_MANIFEST', 'source correspondence');
  unique(manifest.projection.correspondence, 'source', 'DUPLICATE_CORRESPONDENCE');
  invariant(Array.isArray(manifest.imports), 'INVALID_MANIFEST', 'imports');
  invariant(Array.isArray(manifest.provenance?.lookups) && Array.isArray(manifest.provenance?.receipts), 'INVALID_MANIFEST', 'provenance');
  return manifest;
}

async function repositoryBoundary(repo) {
  const root = await realpath(repo);
  const common = await realpath(await text(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  invariant(common === path.join(root, '.git'), 'EXTERNAL_OBJECT_STORE', common);
  for (const file of ['objects/info/alternates', 'objects/info/http-alternates', 'shallow', 'info/grafts']) {
    invariant(!await exists(path.join(common, file)), 'EXTERNAL_OBJECT_STORE', file);
  }
  invariant((await text(repo, ['rev-parse', '--is-shallow-repository'])) === 'false', 'SHALLOW_REPOSITORY', repo);
  const config = await text(repo, ['config', '--local', '--list']);
  invariant(!/(?:partialclone|promisor|alternaterefscommand)=/i.test(config), 'EXTERNAL_OBJECT_STORE', 'partial/promisor configuration');
  invariant((await text(repo, ['for-each-ref', '--format=%(refname)', 'refs/replace'])).length === 0, 'REPLACE_REFS', repo);
}

async function refInventory(repo) {
  const output = await git(repo, ['for-each-ref', '--format=%(refname)%09%(objectname)%09%(objecttype)%09%(*objectname)%09%(*objecttype)%09%(symref)']);
  return new Map(lines(output).map(line => {
    const [ref, oid, type, peeled, peeledType, symbolic] = line.split('\t');
    return [ref, { oid, type, peeled: peeled || null, peeledType: peeledType || null, symbolic: symbolic || null }];
  }));
}

function resolveArchiveRef(refs, expected) {
  const names = [expected.destination];
  if (expected.destination.startsWith('refs/heads/')) {
    names.push(expected.destination.replace('refs/heads/', 'refs/remotes/origin/'));
  }
  const present = names.filter(name => refs.has(name));
  invariant(present.length > 0, 'MISSING_ARCHIVE_REF', expected.destination);
  for (const name of present) {
    const actual = refs.get(name);
    invariant(actual.oid === expected.oid, 'ARCHIVE_REF_CHANGED', name);
    invariant(actual.type === expected.type && actual.peeled === (expected.peeled ?? null) && actual.peeledType === (expected.peeledType ?? null) && actual.symbolic === null, 'ARCHIVE_TAG_OR_TYPE_CHANGED', name);
  }
  return present[0];
}

export async function readObjects(repo, queries) {
  if (queries.length === 0) {
    return [];
  }
  invariant(queries.every(query => typeof query === 'string' && !/[\r\n\0]/.test(query)), 'INVALID_OBJECT_QUERY', 'newline');
  const output = await git(repo, ['cat-file', '--batch'], `${queries.join('\n')}\n`);
  const objects = [];
  let cursor = 0;
  for (const query of queries) {
    const newline = output.indexOf(10, cursor);
    invariant(newline !== -1, 'MISSING_OBJECT', query);
    const header = output.subarray(cursor, newline).toString();
    const match = /^([0-9a-f]{40}) (blob|tree|commit|tag) (\d+)$/.exec(header);
    invariant(match, 'MISSING_OBJECT', `${query}: ${header}`);
    const [, oid, type, sizeText] = match;
    const size = Number(sizeText);
    cursor = newline + 1;
    const body = output.subarray(cursor, cursor + size);
    invariant(body.length === size && output[cursor + size] === 10, 'TRUNCATED_OBJECT', query);
    const actualOid = createHash('sha1').update(`${type} ${size}\0`).update(body).digest('hex');
    invariant(actualOid === oid, 'CORRUPT_OBJECT', oid);
    objects.push({ oid, type, size, sha256: hash(body), body });
    cursor += size + 1;
  }
  invariant(cursor === output.length, 'OBJECT_STREAM_LENGTH', 'unexpected trailing data');
  return objects;
}

export async function verifyHistory(repo, manifest) {
  validateManifest(manifest);
  await repositoryBoundary(repo);
  const refs = await refInventory(repo);
  const union = new Set();
  const summaries = [];
  const expectedObjects = new Map();
  for (const source of manifest.archives) {
    const mapped = source.refs.map(ref => resolveArchiveRef(refs, ref));
    const closure = lines(await git(repo, ['rev-list', '--objects', '--no-object-names', '--stdin'], `${mapped.join('\n')}\n`)).sort();
    const expected = source.objects.map(object => object.oid).sort();
    const actualSet = new Set(closure);
    for (const oid of expected) {
      invariant(actualSet.has(oid), 'UNREACHABLE_ARCHIVE_OBJECT', `${source.id} ${oid}`);
      union.add(oid);
    }
    equal(closure, expected, 'ARCHIVE_CLOSURE_CHANGED', source.id);
    for (const object of source.objects) {
      const previous = expectedObjects.get(object.oid);
      if (previous) {
        equal(object, previous, 'CONTRADICTORY_OBJECT', object.oid);
      }
      expectedObjects.set(object.oid, object);
    }
    for (const symbolic of source.symbolicRefs) {
      const target = source.refs.find(ref => ref.ref === symbolic.target);
      invariant(target && target.oid === symbolic.oid, 'SYMBOLIC_RELATION_CHANGED', symbolic.name);
    }
    summaries.push({ source: source.id, refs: mapped.length, reachableObjects: closure.length });
  }
  const objects = await readObjects(repo, [...expectedObjects.keys()].sort());
  const byOid = new Map(objects.map(object => [object.oid, object]));
  for (const object of objects) {
    const { body, ...identity } = object;
    equal(identity, expectedObjects.get(object.oid), 'OBJECT_BYTES_CHANGED', object.oid);
  }
  const monorepo = manifest.archives.find(source => source.id === 'ilokesto');
  invariant(monorepo.refs.some(ref => ref.ref === 'refs/heads/main' && ref.oid === manifest.source.cut), 'SOURCE_CUT_CHANGED', manifest.source.cut);
  const lookups = manifest.provenance.lookups;
  const resolved = await readObjects(repo, lookups.map(lookup => `${lookup.commit}:${lookup.path}`));
  for (let index = 0; index < lookups.length; index++) {
    const lookup = lookups[index];
    const object = resolved[index];
    invariant(union.has(lookup.commit) && union.has(object.oid), 'UNREACHABLE_PROVENANCE', `${lookup.commit}:${lookup.path}`);
    invariant(object.oid === lookup.oid && object.type === lookup.type && object.sha256 === lookup.sha256, 'PROVENANCE_CHANGED', `${lookup.commit}:${lookup.path}`);
  }
  for (const receipt of manifest.provenance.receipts) {
    const bytes = byOid.get(receipt.blob);
    invariant(bytes?.type === 'blob' && bytes.sha256 === receipt.sha256, 'RECEIPT_CHANGED', receipt.path);
    const parsed = JSON.parse(bytes.body);
    if (receipt.package) {
      invariant(parsed.package?.name === receipt.package && [1, 2].includes(parsed.schemaVersion), 'RECEIPT_IDENTITY', receipt.path);
      const originalTag = monorepo.refs.find(ref => ref.ref === `refs/tags/${parsed.provenance.tag}`);
      invariant(originalTag?.type === 'tag' && originalTag.peeled === parsed.provenance.tagTarget, 'RECEIPT_TAG_CHANGED', receipt.path);
      await git(repo, ['merge-base', '--is-ancestor', parsed.releaseSource.commit, parsed.docsRevision.commit]);
    }
  }
  await git(repo, ['fsck', '--full', '--no-reflogs']);
  return { mode: 'history', package: manifest.package, archives: summaries, objectBytesVerified: objects.length, provenanceLookups: lookups.length, receipts: manifest.provenance.receipts.length };
}

export async function verifyCheckpoint(repo, manifest) {
  validateManifest(manifest);
  await repositoryBoundary(repo);
  const { source, projection, checkpoint } = manifest;
  for (const [ref, expected] of [
    ['refs/tags/migration/projection-v1', projection.commit],
    ['refs/tags/migration/checkpoint-v1', checkpoint.commit],
  ]) {
    invariant(await text(repo, ['rev-parse', '--verify', ref]) === expected, 'CHECKPOINT_REF_CHANGED', ref);
  }
  const trees = await readObjects(repo, [`${source.cut}:${source.prefix}`, `${projection.commit}^{tree}`, `${checkpoint.commit}^{tree}`]);
  invariant(trees.every(tree => tree.type === 'tree' && tree.oid === source.tree), 'CHECKPOINT_TREE_CHANGED', source.prefix);
  equal(await text(repo, ['rev-list', '--parents', '-n', '1', checkpoint.commit]), `${checkpoint.commit} ${projection.commit}`, 'CHECKPOINT_PARENT_CHANGED', checkpoint.commit);
  await git(repo, ['merge-base', '--is-ancestor', checkpoint.commit, 'HEAD']);
  const projectedCommits = new Set(lines(await git(repo, ['rev-list', projection.commit])));
  const changes = lines(await git(repo, ['rev-list', '--full-history', source.cut, '--', source.prefix])).sort();
  equal(projection.correspondence.map(row => row.source).sort(), changes, 'INCOMPLETE_CORRESPONDENCE', source.prefix);
  const queries = projection.correspondence.flatMap(row => [`${row.source}:${source.prefix}`, `${row.projected}^{tree}`]);
  const correspondingTrees = await readObjects(repo, queries);
  for (let index = 0; index < projection.correspondence.length; index++) {
    const row = projection.correspondence[index];
    const original = correspondingTrees[index * 2];
    const projected = correspondingTrees[index * 2 + 1];
    invariant(projectedCommits.has(row.projected), 'UNREACHABLE_PROJECTION', row.projected);
    invariant(original.type === 'tree' && projected.type === 'tree' && original.oid === row.tree && projected.oid === row.tree, 'CORRESPONDENCE_TREE_CHANGED', row.source);
  }
  const importLog = await text(repo, ['log', source.cut, `--grep=^git-subtree-dir: ${source.prefix}/*$`, '--format=%H']);
  equal(lines(importLog).sort(), manifest.imports.map(item => item.join).sort(), 'IMPORT_METADATA_CHANGED', source.prefix);
  invariant(manifest.package === 'queryable' ? manifest.imports.length === 0 : manifest.imports.length === 1, 'MISSING_IMPORT_METADATA', source.prefix);
  let importedCommits = 0;
  for (const item of manifest.imports) {
    const [join] = await readObjects(repo, [item.join]);
    const message = join.body.toString();
    invariant(message.includes(`\ngit-subtree-dir: ${source.prefix}\n`) && message.includes(`\ngit-subtree-mainline: ${item.mainline}\n`) && message.includes(`\ngit-subtree-split: ${item.split}\n`), 'IMPORT_METADATA_CHANGED', item.join);
    const parents = lines(await git(repo, ['rev-list', '--parents', '-n', '1', item.join]))[0].split(' ').slice(1);
    equal(parents, [item.mainline, item.split], 'IMPORT_PARENTS_CHANGED', item.join);
    const importTrees = await readObjects(repo, [`${item.join}:${source.prefix}`, `${item.split}^{tree}`]);
    equal(importTrees[0].oid, importTrees[1].oid, 'IMPORT_TREE_CHANGED', item.join);
    const ancestors = lines(await git(repo, ['rev-list', item.split])).sort();
    equal(item.ancestors, ancestors, 'IMPORT_ANCESTRY_CHANGED', item.split);
    for (const oid of ancestors) {
      invariant(projectedCommits.has(oid), 'LOST_PREIMPORT_ANCESTOR', oid);
    }
    importedCommits += ancestors.length;
  }
  return { mode: 'checkpoint', package: manifest.package, sourceCut: source.cut, sourceTree: source.tree, projection: projection.commit, checkpoint: checkpoint.commit, correspondence: changes.length, importedCommits };
}

export async function verifyStandalone(repo, manifest) {
  validateManifest(manifest);
  repo = await realpath(repo);
  const withinRepo = target => {
    const relative = path.relative(repo, target);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  const localTarget = async (file, range, code = 'EXTERNAL_DEPENDENCY_PATH') => {
    // Match pnpm's local resolver: normalize protocol slashes, not URI escapes.
    const spec = range.replace(/\\/g, '/').replace(/^(?:file|link|workspace):\/*([A-Z]:)/i, '$1')
      .replace(/^(?:file|link|workspace):(?:\/*([~./]))?/, '$1');
    const target = path.resolve(path.dirname(path.join(repo, file)), spec);
    invariant(!/^(?:\/|[A-Z]:|~\/)/i.test(spec) && withinRepo(target), code, `${file} ${range}`);
    const resolved = await realpath(target);
    invariant(withinRepo(resolved), code, `${file} ${range}`);
    return resolved;
  };
  invariant(withinRepo(await realpath(path.join(repo, 'package.json'))), 'EXTERNAL_REPOSITORY_PATH', 'package.json');
  const root = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'));
  invariant(root.name === `@ilokesto/${manifest.package}`, 'PACKAGE_IDENTITY', root.name);
  if (manifest.package === 'queryable') {
    invariant(root.private === true, 'PRIVATE_PACKAGE_EXPOSED', root.name);
  }
  const files = (await git(repo, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).toString().split('\0').filter(Boolean);
  const generated = new Set(['node_modules', 'dist', '.next', '.source', '.generated']);
  const manifests = new Map();
  for (const file of new Set(['package.json', ...files])) {
    if (file.startsWith('docs-publication/releases/') || file.startsWith('.migration/')
      || file.split('/').some(part => generated.has(part))) {
      continue;
    }
    const location = path.join(repo, file);
    if (!await exists(location)) {
      continue;
    }
    invariant(withinRepo(await realpath(location)), 'EXTERNAL_REPOSITORY_PATH', file);
    if (file === 'package.json' || file.endsWith('/package.json')) {
      manifests.set(file, file === 'package.json' ? root : JSON.parse(await readFile(location, 'utf8')));
    }
  }
  const localPackages = new Map();
  for (const [file, current] of manifests) {
    invariant(current.name === root.name || !SLUGS.some(slug => current.name === `@ilokesto/${slug}`),
      'SIBLING_DEPENDENCY', `${file} ${current.name}`);
    if (file === 'package.json' || current.private === true) {
      invariant(!localPackages.has(current.name), 'DUPLICATE_WORKSPACE_NAME', current.name);
      localPackages.set(current.name, {
        private: current.private === true,
        directory: path.dirname(await realpath(path.join(repo, file))),
      });
    }
  }
  for (const [file, current] of manifests) {
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [name, range] of Object.entries(current[section] ?? {})) {
        invariant(typeof range === 'string', 'INVALID_DEPENDENCY', `${file} ${name}`);
        invariant(root.name === '@ilokesto/queryable'
          || (name !== '@ilokesto/queryable' && !/^npm:@ilokesto\/queryable@/.test(range)),
        'PRIVATE_PACKAGE_DEPENDENCY', `${file} ${name}`);
        if (range.startsWith('workspace:')) {
          const [, alias, requested] = /^workspace:(?:([^._/][^@]*)@)?(.*)$/.exec(range);
          let targetName = alias ?? name;
          let local = localPackages.get(targetName);
          if (range.startsWith('workspace:.')) {
            const target = await localTarget(file, range, 'SIBLING_DEPENDENCY');
            [targetName, local] = [...localPackages].find(([, candidate]) => candidate.directory === target) ?? [];
          } else {
            invariant(!/[\\/:@]/.test(requested), 'SIBLING_DEPENDENCY', `${file} ${name} ${range}`);
          }
          invariant(file !== 'package.json' && current.private === true && local
            && (targetName === root.name || (local.private && !SLUGS.includes(targetName.slice('@ilokesto/'.length)))),
          'SIBLING_DEPENDENCY', `${file} ${name} ${range}`);
        }
        if (/^(?:file|link):/.test(range)) {
          await localTarget(file, range);
          invariant(!SLUGS.some(slug => name === `@ilokesto/${slug}` && name !== root.name),
            'SIBLING_DEPENDENCY', `${file} ${name} ${range}`);
        }
      }
    }
    const scripts = JSON.stringify(current.scripts ?? {});
    invariant(!/\.\.\/(?:\.\.\/)*(?:packages|store|state|form|overlay|modal|toast|fetcher|utilinent|queryable)(?:\/|\b)|\/Users\/[^"]+\/ilokesto(?:\/|")/.test(scripts), 'SIBLING_SCRIPT', file);
    for (const script of Object.values(current.scripts ?? {})) {
      for (const match of script.matchAll(/(?:--filter|-F)(?:=|\s+)['"]?(@ilokesto\/[a-z-]+)/g)) {
        invariant(match[1] === root.name || !SLUGS.includes(match[1].slice('@ilokesto/'.length)), 'SIBLING_SCRIPT', `${file} ${match[1]}`);
      }
    }
  }
  if (manifest.package === 'queryable') {
    const workflows = files.filter(file => /^\.github\/workflows\/.*\.ya?ml$/.test(file));
    for (const file of workflows) {
      invariant(!/\b(?:npm|pnpm)\s+publish\b|changesets\/action/.test(await readFile(path.join(repo, file), 'utf8')), 'PRIVATE_PUBLISH_WORKFLOW', file);
    }
  }
  return { mode: 'standalone', package: root.name, manifests: manifests.size };
}

export function verifyRelease(input) {
  invariant(input?.schemaVersion === 1 && HEX.test(input.requestedSha), 'RELEASE_INPUT', 'requested SHA');
  invariant(input.package?.private !== true && input.package?.name !== '@ilokesto/queryable', 'PRIVATE_RELEASE', input.package?.name);
  invariant(input.requestedSha === input.currentMain && input.requestedSha === input.workflowSha, 'RELEASE_SHA_CHANGED', input.requestedSha);
  invariant(input.verify?.headSha === input.requestedSha && input.verify.repository === input.repository && input.verify.name === 'verify' && input.verify.conclusion === 'success' && Number.isSafeInteger(input.verify.runId), 'UNVERIFIED_RELEASE_SHA', input.requestedSha);
  invariant(SHA256.test(input.packSha256) && input.packSha256 === input.verify.artifactSha256, 'RELEASE_ARTIFACT_CHANGED', input.packSha256);
  invariant(input.registry?.name === input.package.name && input.registry.version === input.package.version, 'REGISTRY_IDENTITY', input.package.name);
  invariant(input.registry.published === true || input.registry.published === false, 'REGISTRY_STATUS', 'missing observation');
  return { mode: 'release', sha: input.requestedSha, status: input.registry.published ? 'already-published-no-publish' : 'eligible-unpublished', publishPerformed: false };
}

export function verifyHosting(input) {
  invariant(input?.schemaVersion === 1 && input.before && input.after, 'HOSTING_INPUT', 'before/after');
  for (const key of ['teamId', 'projectId', 'deploymentId']) {
    invariant(typeof input.before[key] === 'string' && input.before[key].length > 0 && input.before[key] === input.after[key], 'HOSTING_ID_CHANGED', key);
  }
  equal(input.after.domains, input.before.domains, 'HOSTING_DOMAINS_CHANGED', 'domains');
  invariant(input.after.gitConnection === null && input.createdDeployments?.length === 0, 'HOSTING_MUTATION', 'Git connection/deployment');
  invariant(Array.isArray(input.before.routes) && input.before.routes.length > 0, 'HOSTING_ROUTES', 'empty baseline');
  equal(input.after.routes, input.before.routes, 'HOSTING_ROUTES_CHANGED', 'full route inventory');
  invariant(input.after.routes.every(route => route.status === 200), 'HOSTING_ROUTE_FAILED', 'first-party routes');
  return { mode: 'hosting', deploymentId: input.after.deploymentId, routes: input.after.routes.length };
}

export async function verifyDeletionGate(input, evidenceRoot) {
  invariant(input?.schemaVersion === 1 && input.stage === 'remote' && input.remoteReleaseReady === true, 'REMOTE_AUTHORITY_REQUIRED', 'local approval is insufficient');
  equal(input.targets, DELETION_TARGETS, 'UNEXPECTED_DELETION_TARGET', 'exact ordered four-name allowlist');
  invariant(input.sources?.length === 4, 'SOURCE_INVENTORY_REQUIRED', 'four sources');
  equal(input.sources.map(source => source.name).sort(), [...DELETION_TARGETS].sort(), 'SOURCE_INVENTORY_REQUIRED', 'names');
  for (const source of input.sources) {
    invariant(source.frozenRefs?.length > 0, 'SOURCE_INVENTORY_REQUIRED', source.name);
    equal(source.currentRefs, source.frozenRefs, 'SOURCE_REFS_MOVED', source.name);
  }
  equal(input.proofs?.map(proof => proof.task).sort((a, b) => a - b), [14, 15, 16, 17], 'MISSING_REQUIRED_PROOF', 'tasks 14-17');
  for (const proof of input.proofs) {
    invariant(typeof proof.path === 'string' && !path.isAbsolute(proof.path) && !proof.path.split('/').includes('..') && SHA256.test(proof.sha256), 'PROOF_PATH', proof.path);
    const bytes = await readFile(path.join(evidenceRoot, proof.path));
    invariant(hash(bytes) === proof.sha256, 'PROOF_DIGEST_CHANGED', proof.path);
    const receipt = JSON.parse(bytes);
    invariant(receipt.status === 'complete' && receipt.task === proof.task && receipt.scope === 'remote' && receipt.verdict === 'confirmed', 'UNCONFIRMED_PROOF', proof.path);
    equal(receipt.sourceInventories, input.sources.map(source => ({ name: source.name, refs: source.frozenRefs })), 'PROOF_SOURCE_BINDING', proof.path);
    equal(receipt.destinations, input.destinations, 'PROOF_DESTINATION_BINDING', proof.path);
  }
  equal(input.destinations?.map(destination => destination.slug).sort(), [...SLUGS].sort(), 'DESTINATION_INVENTORY', 'all nine');
  invariant(input.destinations.every(destination => HEX.test(destination.sha)), 'DESTINATION_SHA', 'full SHAs');
  return { mode: 'deletion-gate', targets: input.targets, proofDigests: input.proofs.map(proof => proof.sha256), deletionPerformed: false };
}

async function main(args) {
  const mode = args.shift() ?? 'all';
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    invariant(['--repo', '--manifest', '--input', '--evidence', '--manifest-stdin'].includes(args[index]) && args[index + 1], 'CLI_ARGUMENT', args[index]);
    invariant(!(args[index] in options), 'CLI_ARGUMENT', `duplicate ${args[index]}`);
    options[args[index]] = args[index + 1];
  }
  if (['release', 'hosting', 'deletion-gate'].includes(mode)) {
    invariant(options['--input'], 'CLI_ARGUMENT', '--input required');
    const input = JSON.parse(await readFile(options['--input'], 'utf8'));
    const result = mode === 'release' ? verifyRelease(input) : mode === 'hosting' ? verifyHosting(input) : await verifyDeletionGate(input, options['--evidence'] ?? process.cwd());
    process.stdout.write(`${JSON.stringify({ status: 'pass', ...result })}\n`);
    return;
  }
  invariant(['history', 'checkpoint', 'standalone', 'all'].includes(mode), 'CLI_MODE', mode);
  const repo = path.resolve(options['--repo'] ?? process.cwd());
  let bytes;
  if (options['--manifest-stdin'] === '-') {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
  } else {
    invariant(!options['--manifest-stdin'], 'CLI_ARGUMENT', '--manifest-stdin must be -');
    bytes = await readFile(path.join(repo, '.migration/source-manifest.json'));
  }
  const manifest = validateManifest(JSON.parse(bytes));
  if (options['--manifest']) {
    const cutover = JSON.parse(await readFile(options['--manifest'], 'utf8'));
    invariant(cutover.source_remote_main === manifest.source.cut && cutover.sources?.['ilokesto/ilokesto']?.source_package_trees?.[manifest.package] === manifest.source.tree, 'CUTOVER_BASELINE_CHANGED', manifest.package);
  }
  const results = [];
  if (mode === 'all' || mode === 'history') {
    results.push(await verifyHistory(repo, manifest));
  }
  if (mode === 'all' || mode === 'checkpoint') {
    results.push(await verifyCheckpoint(repo, manifest));
  }
  if (mode === 'all' || mode === 'standalone') {
    results.push(await verifyStandalone(repo, manifest));
  }
  process.stdout.write(`${JSON.stringify({ status: 'pass', manifestSha256: hash(bytes), results })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${JSON.stringify({ status: 'fail', code: error.code ?? 'INVALID_INPUT', message: error.message })}\n`);
    process.exitCode = 1;
  });
}
