import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyRelease } from './release-verify.mjs';

const root = path.resolve(import.meta.dirname, '..');
const policy = JSON.parse(await readFile(path.join(root, '.release/policy.json'), 'utf8'));
assert.equal(policy.publishingEnabled, true, 'BOOTSTRAP_PUBLISHING_DISABLED');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'LOCAL_PUBLISH_FORBIDDEN');
assert.equal(process.env.GITHUB_REPOSITORY, policy.repository, 'FOREIGN_REPOSITORY');
assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'RELEASE_BRANCH');
const sha = process.argv[2];
assert.equal(process.env.GITHUB_SHA, sha, 'RELEASE_SHA_CHANGED');
const eligibility = await verifyRelease({ root, sha });
assert.equal(eligibility.publishAllowed, true, 'RELEASE_NOT_ELIGIBLE');
assert.equal(eligibility.status, 'eligible-unpublished', 'ALREADY_PUBLISHED');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'fetcher-publish-'));
try {
  execFileSync('gh', ['run', 'download', String(eligibility.verify.runId), '--repo', policy.repository,
    '--name', `verified-package-${sha}`, '--dir', temporary], { stdio: 'pipe' });
  assert.equal(path.basename(eligibility.file), eligibility.file, 'UNSAFE_ARTIFACT_PATH');
  const tarball = path.join(temporary, eligibility.file);
  const bytes = await readFile(tarball);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), eligibility.packSha256, 'PUBLISH_ARTIFACT_CHANGED');
  const main = JSON.parse(execFileSync('gh', ['api', `repos/${policy.repository}/git/ref/heads/main`]));
  assert.equal(main.object.sha, sha, 'RELEASE_SHA_CHANGED');
  const registry = await fetch(`https://registry.npmjs.org/${encodeURIComponent(eligibility.package)}/${eligibility.version}`, {
    signal: AbortSignal.timeout(30_000), redirect: 'error',
  });
  assert.equal(registry.status, 404, 'VERSION_ALREADY_PUBLISHED_OR_REGISTRY_UNAVAILABLE');
  const refs = JSON.parse(execFileSync('gh', ['api', `repos/${policy.repository}/git/matching-refs/tags/${encodeURIComponent(`${eligibility.package}@${eligibility.version}`)}`]));
  assert.equal(refs.length, 0, 'RELEASE_TAG_ALREADY_EXISTS');
  execFileSync('npm', ['publish', tarball, '--access', 'public', '--tag', policy.distTag], { stdio: 'inherit' });
  const tag = `${eligibility.package}@${eligibility.version}`;
  const gitEnv = { ...process.env, GIT_MASTER: '1', GIT_PAGER: 'cat', PAGER: 'cat' };
  execFileSync('git', ['--no-pager', 'tag', '-a', tag, sha, '-m', tag], { cwd: root, env: gitEnv });
  execFileSync('git', ['--no-pager', 'push', 'origin', `refs/tags/${tag}`], { cwd: root, env: gitEnv });
} finally {
  await rm(temporary, { recursive: true, force: true });
}
