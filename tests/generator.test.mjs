import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel } from '../src/generator/level-generator.ts';
import { verifyLevel } from '../src/generator/verify.ts';

test('1000 deterministic distinct seeds replay to victory in reserve0 and reserve4', t => {
  const signatures = new Set();
  for (let i = 0; i < 1000; i++) {
    const seed = `certified-${i}`, level = generateLevel(seed);
    assert.deepEqual(level, generateLevel(seed), `determinism ${seed}`);
    signatures.add(level.columns.map(col => col.map(tile => tile.kind).join('')).join('|'));
    assert.equal(level.solution.filter(a => a.type === 'reveal').length, 108);
    assert.equal(level.solution.filter(a => a.type === 'move').length, 108);
    assert.equal(verifyLevel(level, 0), true, `reserve0 ${seed}`);
    assert.equal(verifyLevel(level, 4), true, `reserve4 ${seed}`);
  }
  assert.equal(signatures.size, 1000);
  t.diagnostic('1000 unique layouts; 2000 complete production replays; all 432000 actions legal with inventory checked after each action.');
});
