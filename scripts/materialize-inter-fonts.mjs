import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteRoot = fileURLToPath(new URL('../website/', import.meta.url));
const manifestPath = path.join(websiteRoot, 'assets', 'inter-fonts.json');
const defaultOutput = path.join(websiteRoot, 'public', 'fonts');

export async function materializeInterFonts(outputDirectory = defaultOutput) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schema !== 'ilokesto/store-inter-font-inputs/v1' || manifest.faces.length !== 7) {
    throw new Error('Inter font input manifest is invalid');
  }

  await mkdir(outputDirectory, { recursive: true });
  const written = [];
  for (const face of manifest.faces) {
    const bytes = Buffer.from(face.base64, 'base64');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== face.bytes || sha256 !== face.sha256 || path.basename(face.filename) !== face.filename) {
      throw new Error(`Inter font input integrity check failed: ${face.subset}`);
    }
    await writeFile(path.join(outputDirectory, `inter-${face.subset}.woff2`), bytes);
    written.push({ subset: face.subset, bytes: bytes.length, sha256 });
  }
  return written;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await materializeInterFonts(), null, 2));
}
