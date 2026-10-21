import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function invariant(condition, message) {
  if (!condition) throw new Error(`Docs publication: ${message}`);
}
export const hash = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
export const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
export function equal(actual, expected, label) {
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
}
export function safePath(value) {
  invariant(typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0') && !path.posix.isAbsolute(value) && value.split('/').every((part) => part && part !== '.' && part !== '..'), `unsafe path ${JSON.stringify(value)}`);
  return value;
}
export function git(root, args, options = {}) {
  return execFileSync('git', ['-C', root, ...args], { maxBuffer: 64 * 1024 * 1024, ...options });
}
export const gitText = (root, args) => git(root, args).toString('utf8').trim();
export function commitObject(root, commit) {
  invariant(/^[a-f0-9]{40}$/.test(commit ?? ''), 'an explicit full commit SHA is required');
  equal(gitText(root, ['rev-parse', `${commit}^{commit}`]), commit, 'commit object');
}
export function gitEntries(root, commit, paths) {
  const output = git(root, ['ls-tree', '-rz', commit, '--', ...paths]).toString('utf8');
  return output.split('\0').filter(Boolean).map((entry) => {
    const match = /^(\d+) (\w+) ([a-f0-9]{40})\t(.+)$/.exec(entry);
    invariant(match && match[2] === 'blob' && ['100644', '100755'].includes(match[1]), `unsupported Git entry ${entry}`);
    return { path: safePath(match[4]), mode: match[1], blob: match[3] };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export function gitFiles(root, entries) {
  if (!entries.length) return new Map();
  const output = git(root, ['cat-file', '--batch'], { input: entries.map((entry) => entry.blob).join('\n') + '\n' });
  let offset = 0;
  return new Map(entries.map((entry) => {
    const end = output.indexOf(10, offset);
    const [object, type, size] = output.subarray(offset, end).toString().split(' ');
    equal(object, entry.blob, 'Git blob');
    invariant(type === 'blob' && /^\d+$/.test(size), 'invalid Git blob response');
    offset = end + 1;
    const bytes = output.subarray(offset, offset + Number(size));
    offset += Number(size) + 1;
    return [entry.path, bytes];
  }));
}
export function inventory(files) {
  return [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, bytes]) => ({ path: file, bytes: bytes.length, sha256: hash(bytes) }));
}
export async function diskFiles(directory, prefix = '') {
  invariant((await lstat(directory)).isDirectory(), `not a directory: ${directory}`);
  const files = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = safePath(prefix ? `${prefix}/${entry.name}` : entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const pair of await diskFiles(absolute, relative)) files.set(...pair);
    } else {
      invariant(entry.isFile(), `not a regular file: ${relative}`);
      files.set(relative, await readFile(absolute));
    }
  }
  return files;
}
export async function writeFiles(directory, files) {
  for (const [relative, bytes] of files) {
    const target = path.join(directory, safePath(relative));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}
export async function optionalBytes(file) {
  try { return await readFile(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
export async function atomicWrite(file, bytes) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, bytes, { flag: 'wx' });
  try { await rename(temporary, file); } finally { await rm(temporary, { force: true }); }
}

// Read, never extract, npm tarballs. Reject links, traversal, duplicates, and
// unsupported headers before any payload path can reach the filesystem.
export function tarFiles(tarball) {
  const tar = gunzipSync(tarball, { maxOutputLength: 64 * 1024 * 1024 });
  const files = new Map();
  let ended = false;
  for (let offset = 0; offset < tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    invariant(header.length === 512, 'truncated tar header');
    if (header.every((byte) => byte === 0)) {
      invariant(tar.subarray(offset).every((byte) => byte === 0), 'tar bytes after end marker');
      ended = true;
      break;
    }
    const text = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
    const octal = (start, length) => {
      const value = text(start, length).trim();
      invariant(/^[0-7]+$/.test(value), 'invalid tar octal field');
      return Number.parseInt(value, 8);
    };
    const checksum = [...header].reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    equal(checksum, octal(148, 8), 'tar header checksum');
    const prefix = text(345, 155);
    const name = `${prefix ? `${prefix}/` : ''}${text(0, 100)}`;
    const type = text(156, 1);
    const size = octal(124, 12);
    invariant(Number.isSafeInteger(size) && offset + 512 + size <= tar.length, 'truncated tar payload');
    invariant(['', '0', '5'].includes(type), `unsupported tar entry type ${type} (${name})`);
    invariant(name.startsWith('package/'), `tar path outside package: ${name}`);
    const relative = name.slice('package/'.length).replace(/\/$/, '');
    if (relative) safePath(relative);
    if (type !== '5') {
      invariant(relative && !files.has(relative), `duplicate or empty tar path: ${name}`);
      files.set(relative, tar.subarray(offset + 512, offset + 512 + size));
    } else invariant(size === 0, 'nonempty tar directory');
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  invariant(ended && files.size > 0, 'missing tar end marker or empty tarball');
  return files;
}
export async function download(url, maxBytes = 16 * 1024 * 1024) {
  const parsed = new URL(url);
  invariant(parsed.protocol === 'https:' && parsed.hostname === 'registry.npmjs.org', 'only the public npm registry is allowed');
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  invariant(response.ok, `registry HTTP ${response.status} for ${url}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    invariant(size <= maxBytes, `registry response exceeds ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
