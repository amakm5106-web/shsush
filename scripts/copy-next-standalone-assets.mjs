import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const copies = [
  [resolve(root, '.next/static'), resolve(root, '.next/standalone/.next/static')],
  [resolve(root, 'public'), resolve(root, '.next/standalone/public')],
];

for (const [source, destination] of copies) {
  await mkdir(dirname(destination), { recursive: true });
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
}

console.log('Copied public and Next.js static assets into .next/standalone.');
