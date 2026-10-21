import assert from 'node:assert/strict';
import { access, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as collections from '../source.config.ts';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const packages = ['store'];

test('all package documentation is consumed from its canonical workspace directory', async () => {
  for (const packageName of packages) {
    const collection = collections[packageName];
    const canonical = await realpath(resolve(repoRoot, 'docs'));
    assert.equal(await realpath(resolve(appRoot, collection.docs.dir)), canonical);
    assert.equal(await realpath(resolve(appRoot, collection.meta.dir)), canonical);
    assert.equal(collection.docs.postprocess.includeProcessedMarkdown, true);
    await access(resolve(repoRoot, 'docs/index.mdx'));
    await access(resolve(repoRoot, 'docs/index.ko.mdx'));
    const released = collections[`${packageName}Released`];
    const frozen = await realpath(`${repoRoot}docs-publication/.generated/${packageName}/docs`);
    assert.equal(await realpath(resolve(appRoot, released.docs.dir)), frozen);
    assert.equal(await realpath(resolve(appRoot, released.meta.dir)), frozen);
    assert.notEqual(frozen, canonical);
  }

  await assert.rejects(access(`${appRoot}content/docs`));
});
