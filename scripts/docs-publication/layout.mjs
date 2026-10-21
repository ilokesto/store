import { invariant } from './io.mjs';

export function sourceLayout(kind, name) {
  invariant(['monorepo-v1', 'standalone-v1'].includes(kind), `unsupported source layout ${kind}`);
  invariant(/^[a-z][a-z0-9-]*$/.test(name), 'invalid layout package');
  return kind === 'monorepo-v1'
    ? { kind, packageBase: `packages/${name}/`, app: 'apps/docs' }
    : { kind, packageBase: '', app: 'website' };
}

export function receiptLayout(receipt, name) {
  if (receipt.schemaVersion === 1 || receipt.schemaVersion === 2) {
    invariant(!Object.hasOwn(receipt, 'sourceLayout'), 'legacy receipt cannot declare a new source layout');
    return sourceLayout('monorepo-v1', name);
  }
  invariant(receipt.schemaVersion === 3, 'unsupported receipt schema');
  invariant(receipt.sourceLayout === 'standalone-v1', 'schema 3 requires explicit standalone-v1 source layout');
  return sourceLayout(receipt.sourceLayout, name);
}
