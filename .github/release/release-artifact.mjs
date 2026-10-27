import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { packRelease } from '../../scripts/release-verify.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const sha = process.argv[2];
assert.match(sha ?? '', /^[0-9a-f]{40}$/);
const head = execFileSync('git', ['--no-pager', 'rev-parse', 'HEAD'], {
  cwd: root, encoding: 'utf8', env: { ...process.env, GIT_MASTER: '1', GIT_PAGER: 'cat', PAGER: 'cat' },
}).trim();
assert.equal(head, sha, 'ARTIFACT_HEAD_MISMATCH');
const { repository } = JSON.parse(await readFile(path.join(root, '.github/release/policy.json'), 'utf8'));
const directory = path.join(root, 'artifacts');
await mkdir(directory);
const packed = await packRelease(root, directory);
await writeFile(path.join(directory, 'verification.json'), `${JSON.stringify({
  schemaVersion: 1, repository, sha, package: packed.manifest.name, version: packed.manifest.version,
  file: packed.file, packSha256: packed.packSha256,
}, null, 2)}\n`);
