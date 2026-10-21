import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveInstalledPackage } from '../../scripts/docs-runtime.mjs';
import { scopeDevelopmentLink, getDocsChannel, publishedPackages } from '../lib/publication.ts';

test('the selected npm Store executes its published aggregate-delivery contract', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const installed = await resolveInstalledPackage('@ilokesto/released-store', path.join(root, 'docs-publication/runtime'));
  assert.equal(installed.manifest.version, publishedPackages.store.version);
  assert.ok(installed.directory.startsWith(`${path.join(root, 'node_modules')}${path.sep}`));
  const { Store } = await import(pathToFileURL(path.join(installed.directory, 'dist/index.js')).href);
  const counter = new Store({ count: 0 });
  const sentinel = new Error('published listener failure');
  let secondListenerRan = false;
  counter.subscribe(() => { throw sentinel; });
  counter.subscribe(() => { secondListenerRan = true; });
  assert.throws(() => counter.setState({ count: 1 }),
    error => error instanceof AggregateError && error.errors.includes(sentinel));
  assert.equal(secondListenerRan, true);
});

test('the selected npm Store notifies only when its selected value changes', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const installed = await resolveInstalledPackage('@ilokesto/released-store', path.join(root, 'docs-publication/runtime'));
  assert.equal(installed.manifest.version, publishedPackages.store.version);
  assert.ok(installed.directory.startsWith(`${path.join(root, 'node_modules')}${path.sep}`));
  const { Store } = await import(pathToFileURL(path.join(installed.directory, 'dist/index.js')).href);
  const store = new Store({ count: 0, revision: 0 });
  const changes = [];
  store.subscribeSelector(state => state.count, (next, previous) => changes.push([next, previous]));
  store.setState(state => ({ ...state, revision: state.revision + 1 }));
  store.setState(state => ({ ...state, count: state.count + 1 }));

  assert.deepEqual(changes, [[1, 0]]);
});

test('development links stay scoped without rewriting external destinations', () => {
  for (const name of Object.keys(publishedPackages)) {
    assert.equal(scopeDevelopmentLink(`/en/${name}/quick-start#install`), `/en/${name}/next/quick-start#install`);
    assert.equal(scopeDevelopmentLink(`/ko/${name}?x=1`), `/ko/${name}/next?x=1`);
    assert.equal(scopeDevelopmentLink(`/en/${name}/next/quick-start`), `/en/${name}/next/quick-start`);
    assert.equal(getDocsChannel([name]), 'released');
    assert.equal(getDocsChannel([name, 'next']), 'next');
  }
  assert.equal(scopeDevelopmentLink('https://example.com/en/store'), 'https://example.com/en/store');
  assert.equal(scopeDevelopmentLink('../reference/store'), '../reference/store');
  assert.equal(scopeDevelopmentLink('/en/unknown'), '/en/unknown');
});
