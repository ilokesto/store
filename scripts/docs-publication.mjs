import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { capturePublication, currentManifestHash, promotePublication, verifyPublication } from './docs-publication/snapshot.mjs';
import { verifyRuntimeClosure } from './docs-runtime.mjs';
import { generatePublication } from './docs-publication/generate.mjs';
import { invariant } from './docs-publication/io.mjs';

export { PACKAGE_NAMES, RELEASE_COMMIT, RELEASES } from './docs-publication/catalog.mjs';
export { adaptInstallations, collectExamples, exampleOutputPath, importSpecifiers, rewriteExampleImports } from './docs-publication/examples.mjs';
export { generatePublication } from './docs-publication/generate.mjs';
export { buildSnapshot, capturePublication, currentManifestHash, promotePublication, releaseEntry, validateManifest, verifyDocsRevision, verifyPublication, verifySnapshot, writeImmutableSnapshot } from './docs-publication/snapshot.mjs';
export { hash, inventory, tarFiles } from './docs-publication/io.mjs';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

export async function runCli(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    root: { type: 'string' },
    package: { type: 'string' },
    'release-commit': { type: 'string' },
    'docs-commit': { type: 'string' },
    revision: { type: 'string' },
    manifest: { type: 'string' },
    'expected-current': { type: 'string' },
    'provenance-report': { type: 'string' },
  } });
  const [command, positionalPackage] = positionals;
  invariant(positionals.length <= (command === 'capture' ? 2 : 1), 'unexpected positional arguments');
  const rootDir = path.resolve(values.root ?? repositoryRoot);
  let result;
  if (command === 'capture') {
    invariant(!values.package || !positionalPackage, 'specify the package only once');
    result = await capturePublication({ rootDir, packageName: values.package ?? positionalPackage ?? 'all', releaseCommit: values['release-commit'], docsCommit: values['docs-commit'], revision: Number(values.revision), provenanceReport: values['provenance-report'] });
  } else if (command === 'verify') {
    const verified = await verifyPublication({ rootDir, manifestPath: values.manifest });
    result = { packages: Object.keys(verified.manifest.packages), verified: true };
  } else if (command === 'generate') {
    result = await generatePublication({ rootDir, manifestPath: values.manifest });
  } else if (command === 'promote') {
    const candidate = await verifyPublication({ rootDir, manifestPath: values.manifest ?? 'docs-publication/candidate.json' });
    await verifyRuntimeClosure({ rootDir, packages: candidate.manifest.packages });
    result = await promotePublication({ rootDir, expectedCurrent: values['expected-current'], candidatePath: values.manifest });
  } else if (command === 'status') {
    result = { activeHash: await currentManifestHash(rootDir) };
  } else throw new Error('Usage: docs-publication.mjs capture|verify|generate|promote|status [--package all|name] [--release-commit SHA --docs-commit SHA --revision N] [--manifest PATH] [--expected-current SHA256|none]');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
