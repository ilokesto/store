import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { importSpecifiers } from "./docs-publication/examples.mjs";

export async function verifyPresentationBoundary(rootDir) {
  const app = path.join(rootDir, "website");
  const queue = [
    "components/demos/demo-frame.tsx",
    "components/landings/landing-shell.tsx",
    "components/landings/landing-packages.ts",
  ].map(file => path.join(app, file));
  const visited = new Set();
  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = await readFile(file, "utf8");
    for (const imported of importSpecifiers(source, file)) {
      assert.ok(!imported.value.startsWith("@ilokesto/"), `Shared presentation imports package API: ${file} -> ${imported.value}`);
      const target = imported.value.startsWith("@/")
        ? path.join(app, imported.value.slice(2))
        : imported.value.startsWith(".") ? path.resolve(path.dirname(file), imported.value) : undefined;
      if (!target || /\.(?:css|json)$/.test(target)) continue;
      assert.ok(target.startsWith(app + path.sep), `Shared presentation escapes app source: ${target}`);
      let resolved;
      for (const extension of ["", ".tsx", ".ts", ".mjs", ".js", "/index.tsx", "/index.ts"]) {
        try {
          await readFile(target + extension);
          resolved = target + extension;
          break;
        } catch (error) {
          if (error instanceof Error && "code" in error && ["ENOENT", "EISDIR"].includes(error.code)) continue;
          throw error;
        }
      }
      assert.ok(resolved, `Unresolved shared presentation import: ${target}`);
      queue.push(resolved);
    }
  }
  return visited.size;
}
