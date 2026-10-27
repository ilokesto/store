import assert from 'node:assert/strict';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const invariant = (condition, message) => assert.ok(condition, message);
const equal = (actual, expected, label) => assert.equal(actual, expected, label);
function safePath(value) {
  invariant(typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0') && !path.posix.isAbsolute(value) && value.split('/').every(part => part && part !== '.' && part !== '..'), `unsafe path ${JSON.stringify(value)}`);
  return value;
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
