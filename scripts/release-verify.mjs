import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { tarFiles } from './docs-publication/io.mjs';

const rootDir = path.resolve(import.meta.dirname, '..');
const shaPattern = /^[0-9a-f]{40}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(bytes.toString());
const git = (root, args) => execFileSync('git', ['--no-pager', '-C', root, ...args], {
  encoding: 'utf8', env: { ...process.env, GIT_MASTER: '1', GIT_PAGER: 'cat', PAGER: 'cat' },
}).trim();

export function validateReleaseIdentity({ sha, manifest, repository, head }) {
  assert.match(sha ?? '', shaPattern, 'RELEASE_SHA_INVALID');
  assert.ok(manifest.private !== true && manifest.name !== '@ilokesto/queryable', 'PRIVATE_RELEASE');
  assert.match(manifest.name, /^@ilokesto\/[a-z][a-z0-9-]*$/, 'PACKAGE_IDENTITY');
  const expected = `ilokesto/${manifest.name.slice('@ilokesto/'.length)}`;
  assert.equal(repository, expected, 'FOREIGN_REPOSITORY');
  assert.equal(manifest.repository?.url, `git+https://github.com/${expected}.git`, 'FOREIGN_PACKAGE_REPOSITORY');
  assert.equal(head, sha, 'RELEASE_SHA_CHANGED');
}

export function validateVerifyRun({ sha, repository, workflow, run, jobs, artifact, metadata, packSha256 }) {
  assert.equal(workflow.path, '.github/workflows/ci.yml', 'FOREIGN_WORKFLOW');
  assert.equal(run.workflow_id, workflow.id, 'FOREIGN_WORKFLOW');
  assert.equal(run.repository?.full_name, repository, 'FOREIGN_VERIFY_REPOSITORY');
  assert.equal(run.head_repository?.full_name, repository, 'FOREIGN_VERIFY_HEAD');
  assert.equal(run.head_sha, sha, 'UNVERIFIED_RELEASE_SHA');
  assert.equal(run.head_branch, 'main', 'UNVERIFIED_RELEASE_BRANCH');
  assert.ok(['push', 'workflow_dispatch'].includes(run.event), 'UNVERIFIED_RELEASE_EVENT');
  assert.equal(run.status, 'completed', 'VERIFY_INCOMPLETE');
  assert.equal(run.conclusion, 'success', 'VERIFY_FAILED');
  assert.ok(Number.isSafeInteger(run.id) && run.id > 0, 'INVALID_VERIFY_RUN');
  const gates = jobs.filter(job => job.name === 'verify');
  assert.equal(gates.length, 1, 'MISSING_VERIFY_CHECK');
  assert.equal(gates[0].conclusion, 'success', 'VERIFY_CHECK_FAILED');
  assert.equal(gates[0].head_sha, sha, 'VERIFY_CHECK_SHA');
  assert.equal(artifact.name, `verified-package-${sha}`, 'VERIFY_ARTIFACT_NAME');
  assert.equal(artifact.expired, false, 'VERIFY_ARTIFACT_EXPIRED');
  assert.equal(artifact.workflow_run?.id, run.id, 'VERIFY_ARTIFACT_RUN');
  assert.equal(artifact.workflow_run?.head_sha, sha, 'VERIFY_ARTIFACT_SHA');
  assert.equal(metadata.schemaVersion, 1, 'VERIFY_ARTIFACT_SCHEMA');
  assert.equal(metadata.repository, repository, 'VERIFY_ARTIFACT_REPOSITORY');
  assert.equal(metadata.sha, sha, 'VERIFY_ARTIFACT_SHA');
  assert.equal(metadata.packSha256, packSha256, 'RELEASE_ARTIFACT_CHANGED');
}

export async function packRelease(root, destination) {
  execFileSync('pnpm', ['pack', '--pack-destination', destination], { cwd: root, stdio: 'pipe' });
  const names = (await readdir(destination)).filter(name => name.endsWith('.tgz'));
  assert.equal(names.length, 1, 'Expected exactly one package tarball');
  const bytes = await readFile(path.join(destination, names[0]));
  const files = tarFiles(bytes);
  const manifest = json(files.get('package.json'));
  assert.ok([...files.keys()].every(name => !/^(?:website|docs-publication|scripts|tests|\.migration)\//.test(name)), 'MIGRATION_DATA_IN_PACKAGE');
  return { file: names[0], bytes, manifest, packSha256: digest(bytes) };
}

export async function verifyRelease({
  root = rootDir, sha,
  github = async endpoint => json(execFileSync('gh', ['api', endpoint], { maxBuffer: 16 * 1024 * 1024 })),
  downloadArtifact = async endpoint => execFileSync('gh', ['api', endpoint], { maxBuffer: 64 * 1024 * 1024 }),
  registry = async (name, version) => {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`, {
      signal: AbortSignal.timeout(30_000), redirect: 'error',
    });
    if (response.status === 404) return { published: false };
    assert.equal(response.status, 200, `REGISTRY_HTTP_${response.status}`);
    return { published: true, metadata: await response.json() };
  },
} = {}) {
  const manifest = json(await readFile(path.join(root, 'package.json')));
  const policy = json(await readFile(path.join(root, '.release/policy.json')));
  const repository = policy.repository;
  validateReleaseIdentity({ sha, manifest, repository, head: git(root, ['rev-parse', 'HEAD']) });
  assert.equal(git(root, ['status', '--porcelain', '--untracked-files=all']), '', 'DIRTY_RELEASE_CHECKOUT');
  assert.equal(manifest.publishConfig?.tag ?? 'latest', policy.distTag, 'RELEASE_CHANNEL_CHANGED');

  const repo = await github(`repos/${repository}`);
  assert.equal(repo.full_name, repository, 'FOREIGN_REPOSITORY');
  assert.equal(repo.default_branch, 'main', 'RELEASE_DEFAULT_BRANCH');
  const main = async () => (await github(`repos/${repository}/git/ref/heads/main`)).object.sha;
  assert.equal(await main(), sha, 'RELEASE_SHA_CHANGED');
  const workflow = await github(`repos/${repository}/actions/workflows/ci.yml`);
  const runs = await github(`repos/${repository}/actions/workflows/${workflow.id}/runs?head_sha=${sha}&branch=main&per_page=100`);
  const run = runs.workflow_runs.find(candidate => candidate.head_sha === sha
    && candidate.head_branch === 'main' && candidate.status === 'completed'
    && candidate.conclusion === 'success' && ['push', 'workflow_dispatch'].includes(candidate.event));
  assert.ok(run, 'UNVERIFIED_RELEASE_SHA');
  const jobs = await github(`repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
  assert.equal(jobs.total_count, jobs.jobs.length, 'INCOMPLETE_VERIFY_JOBS');
  const artifacts = await github(`repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`);
  assert.equal(artifacts.total_count, artifacts.artifacts.length, 'INCOMPLETE_VERIFY_ARTIFACTS');
  const matching = artifacts.artifacts.filter(item => item.name === `verified-package-${sha}` && !item.expired);
  assert.equal(matching.length, 1, 'MISSING_OR_AMBIGUOUS_VERIFY_ARTIFACT');
  const artifact = matching[0];
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'fetcher-release-verify-'));
  try {
    const packed = await packRelease(root, temporary);
    assert.equal(packed.manifest.name, manifest.name, 'PACKED_PACKAGE_IDENTITY');
    assert.equal(packed.manifest.version, manifest.version, 'PACKED_PACKAGE_VERSION');
    const archive = await downloadArtifact(`repos/${repository}/actions/artifacts/${artifact.id}/zip`);
    assert.equal(artifact.digest, `sha256:${digest(archive)}`, 'VERIFY_DOWNLOAD_DIGEST');
    const zip = path.join(temporary, 'verify.zip');
    await writeFile(zip, archive);
    const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n');
    assert.deepEqual([...entries].sort(), [packed.file, 'verification.json'].sort(), 'VERIFY_ARTIFACT_CONTENTS');
    const metadata = json(execFileSync('unzip', ['-p', zip, 'verification.json']));
    const verifiedTarball = execFileSync('unzip', ['-p', zip, packed.file], { maxBuffer: 64 * 1024 * 1024 });
    assert.equal(digest(verifiedTarball), packed.packSha256, 'VERIFY_TARBALL_CHANGED');
    validateVerifyRun({ sha, repository, workflow, run, jobs: jobs.jobs, artifact, metadata, packSha256: packed.packSha256 });
    assert.equal(metadata.package, manifest.name, 'VERIFY_PACKAGE_IDENTITY');
    assert.equal(metadata.version, manifest.version, 'VERIFY_PACKAGE_VERSION');
    assert.equal(metadata.file, packed.file, 'VERIFY_PACKAGE_FILENAME');
    const observed = await registry(manifest.name, manifest.version);
    if (observed.published) {
      assert.equal(observed.metadata.name, manifest.name, 'REGISTRY_IDENTITY');
      assert.equal(observed.metadata.version, manifest.version, 'REGISTRY_VERSION');
      assert.match(observed.metadata.dist?.integrity ?? '', /^sha512-/, 'REGISTRY_INTEGRITY');
    }
    const tag = `${manifest.name}@${manifest.version}`;
    const refs = await github(`repos/${repository}/git/matching-refs/tags/${encodeURIComponent(tag)}`);
    assert.ok(Array.isArray(refs), 'RELEASE_TAG_RESPONSE');
    const exact = refs.filter(ref => ref.ref === `refs/tags/${tag}`);
    assert.ok(exact.length <= 1, 'AMBIGUOUS_RELEASE_TAG');
    if (exact.length && !observed.published) {
      const object = exact[0].object;
      const target = object.type === 'tag'
        ? (await github(`repos/${repository}/git/tags/${object.sha}`)).object.sha
        : object.sha;
      assert.equal(target, sha, 'RELEASE_TAG_MISMATCH');
    }
    assert.equal(await main(), sha, 'RELEASE_SHA_CHANGED');
    const finalRegistry = await registry(manifest.name, manifest.version);
    assert.equal(finalRegistry.published, observed.published, 'REGISTRY_MOVED');
    return {
      schemaVersion: 1, repository, sha,
      package: manifest.name, version: manifest.version, distTag: policy.distTag,
      status: observed.published ? 'already-published-no-publish' : 'eligible-unpublished',
      publishAllowed: !observed.published && policy.publishingEnabled === true,
      bootstrapPublishingDisabled: policy.publishingEnabled !== true,
      publishPerformed: false,
      verify: { runId: run.id, runAttempt: run.run_attempt, checkId: gatesId(jobs.jobs), artifactId: artifact.id, artifactDigest: artifact.digest },
      packSha256: packed.packSha256, file: packed.file,
      registry: observed, checkedAt: new Date().toISOString(),
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function gatesId(jobs) {
  return jobs.find(job => job.name === 'verify').id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { sha: { type: 'string' } } });
  verifyRelease({ sha: values.sha }).then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'already-published-no-publish') process.exitCode = 2;
  }).catch(error => {
    process.stderr.write(`${JSON.stringify({ status: 'rejected', message: error.message, publishPerformed: false })}\n`);
    process.exitCode = 1;
  });
}
