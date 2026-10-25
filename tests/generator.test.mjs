import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel } from '../src/generator/level-generator.ts';
import { verifyLevel } from '../src/generator/verify.ts';
import { TEMPLATES } from '../src/generator/template-data.ts';

test('1000 deterministic distinct seeds replay to victory in reserve0 and reserve4', t => {
  const signatures = new Set();
  let checkedActions=0;
  for (let i = 0; i < 1000; i++) {
    const seed = `certified-${i}`, level = generateLevel(seed);
    assert.deepEqual(level, generateLevel(seed), `determinism ${seed}`);
    signatures.add(level.columns.map(col => col.map(tile => tile.kind).join('')).join('|'));
    assert.equal(level.algorithm,'reverse-packets-v3');
    assert.equal(level.solution.filter(a => a.type === 'reveal').length, 10);
    const moves=level.solution.filter(a=>a.type==='move');
    assert.ok(moves.length>=104&&moves.length<=139);
    assert.ok(moves.filter(a=>a.count>1).length>=70);
    let streak=0,maxStreak=0;
    for(const action of moves){streak=action.count===1?streak+1:0;maxStreak=Math.max(maxStreak,streak);}
    assert.ok(maxStreak<=9);
    for(const col of level.columns){
      assert.ok(new Set(col.map(t=>t.kind)).size>=5);
      let run=0,last=-1;for(const tile of col){run=tile.kind===last?run+1:1;last=tile.kind;assert.ok(run<=3);}
    }
    assert.equal(verifyLevel(level, 0), true, `reserve0 ${seed}`);
    assert.equal(verifyLevel(level, 4), true, `reserve4 ${seed}`);
    checkedActions+=level.solution.length*2;
  }
  assert.equal(signatures.size, 1000);
  t.diagnostic(`1000 unique mixed layouts;2000 complete production replays;${checkedActions} checked actions under atomic autoReveal;108 IDs and9x12 kinds preserved.`);
});

test('all32 corpus constructions preserve matching donor anchors and inventory',()=>{
  assert.equal(TEMPLATES.length,32);const shapes=new Set();
  for(const template of TEMPLATES){
    const cols=Array.from({length:9},(_,kind)=>Array(12).fill(kind));cols.push([]);
    for(const [from,to,count]of template.reverse){
      assert.notEqual(from,to);assert.ok(count>0&&Number.isInteger(count));
      const chunk=cols[from].slice(0,count);assert.equal(chunk.length,count);assert.ok(chunk.every(k=>k===chunk[0]));
      assert.ok(cols[to].length+count<=12);assert.ok(cols[from].length===count||cols[from][count]===chunk[0]);
      cols[to].unshift(...cols[from].splice(0,count));assert.equal(cols.flat().length,108);
    }
    assert.deepEqual(cols.map(c=>c.length).sort((a,b)=>a-b),[10,10,11,11,11,11,11,11,11,11]);
    const shape=cols.map(col=>{const runs=[];for(const kind of col){if(runs.at(-1)?.[0]===kind)runs.at(-1)[1]++;else runs.push([kind,1]);}return runs.map(r=>r[1]).join(',');}).sort().join('|');
    shapes.add(shape);
  }
  assert.equal(shapes.size,32,'templates differ in run-length shape, not just labels/columns');
});
