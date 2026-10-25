import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const manifest = JSON.parse(readFileSync('scripts/stable-v03-manifest.json'));
for (const file of manifest.files) {
  const relative = file.path.slice('/secret-sort-dev/'.length) || 'index.html';
  const digest = createHash('sha256').update(readFileSync(`dist/${relative}`)).digest('hex');
  assert.equal(digest, file.sha256, `Stable v0.3 changed: ${relative}`);
}
console.log(`Stable v0.3: ${manifest.files.length} files match baseline ${manifest.baseline}`);
