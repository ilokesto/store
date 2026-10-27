import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const policy = JSON.parse(await readFile(path.join(root, '.github/release/policy.json'), 'utf8'));
const publish = parse(await readFile(path.join(root, '.github/workflows/publish.yml'), 'utf8'));
const release = parse(await readFile(path.join(root, '.github/workflows/release.yml'), 'utf8'));
const sha = 'a'.repeat(40);
const releasePr = {
  merged_at: '2026-10-25T00:00:00Z',
  merge_commit_sha: sha,
  base: { ref: 'main', repo: { full_name: policy.repository } },
  head: { ref: 'changeset-release/main', repo: { full_name: policy.repository } },
};

test('publish workflow: verification completion -> only successful main runs enter release selection', () => {
  const github = {
    event_name: 'workflow_run', repository: policy.repository,
    event: { workflow_run: {
      conclusion: 'success', head_branch: 'main', event: 'push',
      head_repository: { full_name: policy.repository },
    } },
  };
  const eligible = new Function('github', `return (${publish.jobs.plan.if});`);

  assert.deepEqual(publish.on.workflow_run, {
    workflows: ['Verify'], types: ['completed'], branches: ['main'],
  });
  assert.equal(eligible(github), true);
  for (const overrides of [
    { conclusion: 'failure' }, { conclusion: 'cancelled' },
    { head_branch: 'feature/change' }, { event: 'pull_request' },
    { head_repository: { full_name: 'foreign/package' } },
  ]) {
    assert.equal(eligible({
      ...github, event: { workflow_run: { ...github.event.workflow_run, ...overrides } },
    }), false);
  }
});

for (const [scenario, prs, live, expected] of [
  ['merged release PR', [releasePr], sha, true],
  ['ordinary merged PR', [{ ...releasePr, head: { ...releasePr.head, ref: 'fix/example' } }], sha, false],
  ['no associated PR', [], sha, false],
  ['unmerged release PR', [{ ...releasePr, merged_at: null }], sha, false],
  ['different merge commit', [{ ...releasePr, merge_commit_sha: 'b'.repeat(40) }], sha, false],
  ['foreign PR head', [{ ...releasePr, head: { ...releasePr.head, repo: { full_name: 'foreign/package' } } }], sha, false],
  ['foreign PR base', [{ ...releasePr, base: { ...releasePr.base, repo: { full_name: 'foreign/package' } } }], sha, false],
  ['non-main PR base', [{ ...releasePr, base: { ...releasePr.base, ref: 'dev' } }], sha, false],
  ['superseded main commit', [releasePr], 'b'.repeat(40), false],
]) {
  test(`publish selection: ${scenario} -> ${expected ? 'exact SHA selected' : 'no publication'}`, async t => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'release-selection-'));
    t.after(() => rm(temporary, { recursive: true, force: true }));
    const output = path.join(temporary, 'output');
    await writeFile(path.join(temporary, 'gh'), [
      '#!/bin/sh', 'case "$*" in',
      '  *git/ref/heads/main*) printf "%s\\n" "$TEST_LIVE_SHA" ;;',
      '  *"/pulls?per_page=100"*) printf "%s\\n" "$TEST_PRS" ;;',
      '  *) exit 64 ;;', 'esac', '',
    ].join('\n'), { mode: 0o755 });

    const result = spawnSync('bash', ['-c', publish.jobs.plan.steps[0].run], {
      encoding: 'utf8',
      env: {
        ...process.env, PATH: `${temporary}:${process.env.PATH}`,
        GITHUB_OUTPUT: output, GITHUB_REPOSITORY: policy.repository,
        GITHUB_REF: 'refs/heads/main', RELEASE_SHA: sha,
        TEST_LIVE_SHA: live, TEST_PRS: JSON.stringify([prs]),
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const outputs = Object.fromEntries((await readFile(output, 'utf8')).trim().split('\n').map(line => line.split('=')));
    assert.equal(outputs.publish, String(expected));
    assert.equal(outputs.sha, expected ? sha : undefined);
  });
}

test('release workflow: generated PR -> explicit CI dispatch verifies its exact head', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'release-dispatch-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const commands = path.join(temporary, 'commands');
  await writeFile(path.join(temporary, 'gh'), [
    '#!/bin/sh',
    'if [ "$1 $2" = "pr view" ]; then printf "%s\\n" "$TEST_HEAD";',
    'else printf "%s\\n" "$*" > "$TEST_COMMANDS"; fi', '',
  ].join('\n'), { mode: 0o755 });
  const dispatch = release.jobs.release.steps.find(step => step.env?.RELEASE_PR_NUMBER);

  const result = spawnSync('bash', ['-c', dispatch.run], {
    encoding: 'utf8',
    env: {
      ...process.env, PATH: `${temporary}:${process.env.PATH}`,
      RELEASE_PR_NUMBER: '42', TEST_HEAD: sha, TEST_COMMANDS: commands,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal((await readFile(commands, 'utf8')).trim(),
    `workflow run ci.yml --ref changeset-release/main -f expected_head_sha=${sha} -f release_pr_number=42`);
  assert.equal(release.jobs.release.permissions.actions, 'write');
  assert.ok(!release.jobs.release.steps.some(step => step.with?.publish));
});

test('CI artifact command: isolated checkout -> packages the exact repository head', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'release-artifact-command-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await mkdir(path.join(temporary, '.github/release'), { recursive: true });
  await mkdir(path.join(temporary, 'scripts'));
  await mkdir(path.join(temporary, 'dist'));
  for (const file of [
    '.github/release/policy.json', '.github/release/release-artifact.mjs',
    'scripts/release-verify.mjs', 'scripts/release-tar.mjs',
  ]) await copyFile(path.join(root, file), path.join(temporary, file));
  await writeFile(path.join(temporary, 'package.json'), JSON.stringify({
    name: '@' + policy.repository, version: '0.0.0', type: 'module', files: ['dist'],
    packageManager: 'pnpm@10.17.1',
  }));
  await writeFile(path.join(temporary, 'dist/index.js'), 'export const value = 42;\n');
  const env = {
    ...process.env, GIT_MASTER: '1',
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.test',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.test',
  };
  const git = args => execFileSync('git', ['--no-pager', ...args], {
    cwd: temporary, env, encoding: 'utf8',
  }).trim();
  git(['init', '--quiet', '-b', 'main']);
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'Release artifact fixture']);
  const head = git(['rev-parse', 'HEAD']);
  const ci = parse(await readFile(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
  const artifact = ci.jobs.quality.steps.find(step => step.env?.VERIFIED_SHA);

  const result = spawnSync('bash', ['-c', artifact.run], {
    cwd: temporary, encoding: 'utf8', env: { ...env, VERIFIED_SHA: head },
  });

  assert.equal(result.status, 0, result.stderr);
  const metadata = JSON.parse(await readFile(path.join(temporary, 'artifacts/verification.json'), 'utf8'));
  assert.equal(metadata.repository, policy.repository);
  assert.equal(metadata.sha, head);
  assert.equal(metadata.package, '@' + policy.repository);
  assert.equal(metadata.version, '0.0.0');
  const tarball = await readFile(path.join(temporary, 'artifacts', metadata.file));
  assert.equal(metadata.packSha256, createHash('sha256').update(tarball).digest('hex'));
});
