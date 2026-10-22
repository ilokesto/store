import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { materializeInterFonts } from '../../scripts/materialize-inter-fonts.mjs';
import manifest from '../assets/inter-fonts.json' with { type: 'json' };

test('bundled Inter subsets materialize byte-for-byte with verified hashes', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'store-inter-fonts-'));
  try {
    const written = await materializeInterFonts(output);
    assert.equal(written.length, manifest.faces.length);
    for (const face of manifest.faces) {
      const bytes = await readFile(path.join(output, `inter-${face.subset}.woff2`));
      assert.equal(bytes.length, face.bytes, face.subset);
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        face.sha256,
        face.subset,
      );
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
