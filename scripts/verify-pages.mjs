import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const base = '/secret-sort-dev/';
const host = 'https://artem917.github.io';
const html = readFileSync('dist/index.html', 'utf8');
function walk(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
}
const references = [...html.matchAll(/(?:src|href)="([^\"]+)"/g)].map(match => match[1]);
if (references.some(url => !url.startsWith(base))) throw new Error('Incorrect production subpath');
const files = new Map([[base, 'dist/index.html']]);
for (const url of references) files.set(url, `dist/${url.slice(base.length)}`);
for (const asset of walk('public')) files.set(`${base}${asset}`, `dist/${asset}`);
const results = await Promise.all([...files].map(async ([urlPath, file]) => {
  const response = await fetch(`${host}${urlPath}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${urlPath}`);
  const remote = Buffer.from(await response.arrayBuffer()), local = readFileSync(file);
  if (!remote.equals(local)) throw new Error(`Published bytes differ from local build: ${urlPath}`);
  return { path: urlPath, status: response.status, matchesLocalBuild: true, sha256: createHash('sha256').update(remote).digest('hex') };
}));
mkdirSync('output/playwright', { recursive: true });
writeFileSync('output/playwright/published-assets.json', JSON.stringify({ host, base, passed: results.length, files: results }, null, 2));
console.log(JSON.stringify({ passed: results.length, allHTTP200: true, allBytesMatch: true, files: results.map(result => result.path) }, null, 2));
