import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const repository = path.resolve(import.meta.dirname, '../..');

test('Changesets: standalone public root -> versions only the owning library', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fetcher-changesets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ['package.json', 'pnpm-workspace.yaml', '.changeset/config.json']) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await cp(path.join(repository, file), path.join(root, file));
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  await writeFile(path.join(root, '.gitignore'), 'node_modules/\nrelease-plan.json\nci-plan.json\n');
  const git = args => execFileSync('git', ['--no-pager', '-C', root, ...args], {
    env: { ...process.env, GIT_MASTER: '1', GIT_PAGER: 'cat', PAGER: 'cat',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.test',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.test' },
    stdio: 'pipe',
  });
  git(['init', '--quiet', '-b', 'main']);
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'Release-plan fixture baseline']);
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  await writeFile(path.join(root, '.changeset/root-package.md'), `---\n"${manifest.name}": patch\n---\n\nRelease-plan fixture.\n`);
  git(['add', '.changeset/root-package.md']);
  git(['commit', '--quiet', '-m', 'Release declaration fixture']);
  await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'));
  const output = path.join(root, 'release-plan.json');

  execFileSync('pnpm', ['exec', 'changeset', 'status', '--output', output], { cwd: root, stdio: 'pipe' });

  const plan = JSON.parse(await readFile(output, 'utf8'));
  const versioned = plan.releases.filter(release => release.type !== 'none');
  assert.equal(versioned.length, 1);
  assert.equal(versioned[0].name, manifest.name);
  assert.equal(versioned[0].type, 'patch');
  assert.equal(versioned[0].oldVersion, manifest.version);
  assert.notEqual(versioned[0].newVersion, manifest.version);
  assert.deepEqual(plan.releases.map(release => release.name), [manifest.name]);
  git(['switch', '-c', 'pr-fixture']);
  git(['branch', '-d', 'main']);
  const ciOutput = path.join(root, 'ci-plan.json');
  execFileSync('pnpm', ['exec', 'changeset', 'status', '--since=origin/main', '--output', ciOutput], { cwd: root, stdio: 'pipe' });
  assert.deepEqual(JSON.parse(await readFile(ciOutput, 'utf8')).releases, plan.releases);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')), manifest);
});
