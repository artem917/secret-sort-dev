import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const base = 'https://artem917.github.io/secret-sort-dev/v06/';
const walk = (dir, prefix = '') => readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`, `${prefix}${e.name}/`) : [`${prefix}${e.name}`]);
const files = await Promise.all(walk('dist/v06').map(async path => {
  const local = readFileSync(`dist/v06/${path}`), sha256 = createHash('sha256').update(local).digest('hex');
  const url = `${base}${path === 'index.html' ? '' : path}?release=${sha256.slice(0,16)}`;
  const response = await fetch(url, {signal:AbortSignal.timeout(20000)});
  assert.equal(response.status, 200, path);
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(local), `Published bytes differ: ${path}`);
  return {path, url, status:response.status, sha256, matchesLocalBuild:true};
}));
mkdirSync('output/playwright',{recursive:true});
writeFileSync('output/playwright/published-v06-assets.json',JSON.stringify({base,passed:files.length,files},null,2));
console.log(JSON.stringify({base,passed:files.length,allHTTP200:true,allBytesMatch:true}));
