import { createRequire } from 'node:module';
import path from 'node:path';
import { PACKAGE_NAMES } from './catalog.mjs';
import { equal, gitEntries, gitFiles, invariant } from './io.mjs';
import { sourceLayout } from './layout.mjs';

const require = createRequire(new URL('../../website/package.json', import.meta.url));
const ts = require('typescript');
const SHARED = new Set([
  'apps/docs/components/demos/demo-frame',
  'apps/docs/components/landings/landing-shell',
  'apps/docs/components/landings/landing-packages',
]);
const EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];

export function importSpecifiers(source, filename = 'example.tsx') {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  invariant(ast.parseDiagnostics.length === 0, `cannot parse example ${filename}`);
  const imports = [];
  const add = (node) => {
    invariant(node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)), `nonliteral executable import in ${filename}`);
    imports.push({ value: node.text, start: node.getStart(ast) + 1, end: node.getEnd() - 1 });
  };
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) add(node.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return imports;
}
function appPath(specifier, sourcePath, app) {
  if (specifier.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier));
  if (specifier.startsWith('@/')) return `${app}/${specifier.slice(2)}`;
  return null;
}
function shared(target, app) {
  return SHARED.has(target.replace(app, 'apps/docs').replace(/\.[jt]sx?$/, '')) || target.endsWith('.css');
}
function resolveLocal(target, paths, app) {
  invariant(target.startsWith(`${app}/`), `example import escapes docs app: ${target}`);
  const resolved = EXTENSIONS.map((extension) => `${target}${extension}`).find((candidate) => paths.has(candidate));
  invariant(resolved, `unresolved frozen helper: ${target}`);
  return resolved;
}
export function exampleOutputPath(sourcePath) {
  if (/^(?:apps\/docs|website)\/components\/(demos\/(?:[^/]+-demo\.tsx|fetcher-copy\.ts)|landings\/store-landing\.tsx)$/.test(sourcePath)) return path.posix.basename(sourcePath);
  return `_source/${sourcePath}`;
}
export function collectExamples(root, commit, name, layout = 'monorepo-v1') {
  const { app } = sourceLayout(layout, name);
  const entries = gitEntries(root, commit, [app]);
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const all = gitFiles(root, entries.filter((entry) => /\.[jt]sx?$/.test(entry.path)));
  const queue = [`${app}/components/demos/${name}-demo.tsx`];
  if (name === 'fetcher') queue.push(`${app}/components/demos/fetcher-copy.ts`);
  if (name === 'store') queue.push(`${app}/components/landings/store-landing.tsx`);
  const files = new Map();
  while (queue.length) {
    const sourcePath = queue.shift();
    if (files.has(sourcePath)) continue;
    invariant(all.has(sourcePath), `missing example source ${sourcePath}`);
    const bytes = all.get(sourcePath);
    files.set(sourcePath, bytes);
    for (const specifier of importSpecifiers(bytes.toString('utf8'), sourcePath)) {
      const target = appPath(specifier.value, sourcePath, app);
      if (target && !shared(target, app)) queue.push(resolveLocal(target, byPath, app));
    }
  }
  return { files, entries: [...files.keys()].sort().map((file) => byPath.get(file)) };
}
export function rewriteExampleImports(source, sourcePath, frozenPaths, layout = 'monorepo-v1') {
  const { app } = sourceLayout(layout, 'example');
  const replacements = importSpecifiers(source, sourcePath).map((specifier) => {
    let value = specifier.value;
    const packageMatch = /^@ilokesto\/([^/]+)(\/.*)?$/.exec(value);
    if (packageMatch) {
      invariant(PACKAGE_NAMES.includes(packageMatch[1]), `unrecognized example package ${value}`);
      value = `@ilokesto/released-${packageMatch[1]}${packageMatch[2] ?? ''}`;
    } else {
      const target = appPath(value, sourcePath, app);
      if (target && shared(target, app)) value = `@/${target.slice(app.length + 1)}`;
      else if (target) {
        const resolved = resolveLocal(target, frozenPaths, app);
        value = path.posix.relative(path.posix.dirname(exampleOutputPath(sourcePath)), exampleOutputPath(resolved)).replace(/\.[jt]sx?$/, '');
        if (!value.startsWith('.')) value = `./${value}`;
      }
    }
    return { ...specifier, value };
  });
  let output = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
  // Reparse the generated file, rather than trusting string-offset edits.
  equal(importSpecifiers(output, sourcePath).length, replacements.length, 'generated import count');
  return output;
}

export function adaptInstallations(document, packages) {
  const pin = (line) => line.replace(/@ilokesto\/([a-z][a-z0-9-]*)(?:@[^\s`'";,]+)?/g, (original, name) => {
    const selected = packages[name];
    invariant(selected || PACKAGE_NAMES.includes(name), `installation references unknown package ${name}`);
    if (!selected) return original;
    return `@ilokesto/${name}@${selected.version}`;
  });
  let fence = null;
  return document.split(/(?<=\n)/).map((line) => {
    const marker = /^\s*(`{3,}|~{3,})([^\r\n]*)/.exec(line);
    if (marker) {
      if (!fence) fence = { marker: marker[1][0], length: marker[1].length, language: marker[2].trim().split(/\s/)[0] };
      else if (marker[1][0] === fence.marker && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return line;
    }
    if (fence?.language === 'package-install') return pin(line);
    if (fence && ['', 'sh', 'shell', 'bash', 'zsh', 'console', 'terminal'].includes(fence.language) && /^\s*(?:\$\s*)?(?:npm\s+(?:install|i)|pnpm\s+(?:add|install)|yarn\s+add|bun\s+(?:add|install))\s/.test(line)) return pin(line);
    return line;
  }).join('');
}
