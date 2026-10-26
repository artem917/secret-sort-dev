import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const manifest = JSON.parse(readFileSync('scripts/preserved-v05-manifest.json'));
for (const file of manifest.files) {
  const path = file.path === 'index.html' ? 'dist/v05/index.html' : `dist/v05/${file.path}`;
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), file.sha256, `v0.5 changed: ${file.path}`);
}
console.log(`Preserved v0.5: ${manifest.files.length} files match ${manifest.baseline}`);
