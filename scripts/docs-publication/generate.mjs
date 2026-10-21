import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { adaptInstallations, exampleOutputPath, rewriteExampleImports } from './examples.mjs';
import { invariant, writeFiles } from './io.mjs';
import { verifyPublication } from './snapshot.mjs';
import { receiptLayout } from './layout.mjs';

async function replaceGenerated(directory, files) {
  await mkdir(path.dirname(directory), { recursive: true });
  const temporary = await mkdtemp(`${directory}.generate-`);
  try {
    await writeFiles(temporary, files);
    await rm(directory, { recursive: true, force: true });
    await rename(temporary, directory);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
export async function generatePublication({ rootDir, manifestPath = 'docs-publication/active.json' }) {
  // Verification happens before deleting or replacing any existing generated file.
  const verified = await verifyPublication({ rootDir, manifestPath });
  const outputs = [];
  for (const [name, snapshot] of verified.snapshots) {
    const documents = new Map();
    const examples = new Map();
    const frozenPaths = new Set(snapshot.receipt.exampleSource.files.map((file) => file.path));
    for (const [file, bytes] of snapshot.files) {
      if (file.startsWith('revision/')) {
        const target = file.slice('revision/'.length);
        documents.set(target, /\.mdx?$/.test(target) ? Buffer.from(adaptInstallations(bytes.toString('utf8'), verified.manifest.packages)) : bytes);
      }
      if (file.startsWith('examples/')) {
        const sourcePath = file.slice('examples/'.length);
        const target = exampleOutputPath(sourcePath);
        invariant(!examples.has(target), `generated example path collision: ${target}`);
        examples.set(target, Buffer.from(rewriteExampleImports(bytes.toString('utf8'), sourcePath, frozenPaths, receiptLayout(snapshot.receipt, name).kind)));
      }
    }
    const docsDir = path.join(rootDir, 'docs-publication/.generated', name);
    const runtimeDir = path.join(rootDir, 'docs-publication/runtime/.generated', name);
    await replaceGenerated(docsDir, documents);
    await replaceGenerated(runtimeDir, examples);
    outputs.push({ name, docsDir: path.join(docsDir, 'docs'), runtimeDir, docsFiles: documents.size, exampleFiles: examples.size });
  }
  return { manifest: verified.manifest, outputs };
}
